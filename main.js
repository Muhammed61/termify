// Termify — Electron ana süreç
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Vault } = require('./src/main/vault');
const { SessionManager } = require('./src/main/sessions');
const { ForwardManager } = require('./src/main/forward');
const keys = require('./src/main/keys');
const localfs = require('./src/main/localfs');
const { initUpdater, updates } = require('./src/main/updater');

let win = null;

// Eski adıyla (Kabuk SSH) oluşturulmuş kasayı yeni klasöre taşı
const dataDir = app.getPath('userData');
const legacyVault = path.join(app.getPath('appData'), 'Kabuk SSH', 'kasa.json');
if (!fs.existsSync(path.join(dataDir, 'kasa.json')) && fs.existsSync(legacyVault)) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.copyFileSync(legacyVault, path.join(dataDir, 'kasa.json'));
}

const vault = new Vault(dataDir);
const pendingAsks = new Map();

function emit(channel, ...args) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
}

// Kullanıcıya arayüz üzerinden soru sorar (host anahtarı onayı, parola vb.)
function ask(request) {
  return new Promise((resolve) => {
    const id = crypto.randomUUID();
    pendingAsks.set(id, resolve);
    emit('ask', { id, ...request });
  });
}

const sessions = new SessionManager({ vault, ask, emit });
const forwards = new ForwardManager({ vault, ask, emit });

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 560,
    backgroundColor: '#14161b',
    title: 'Termify',
    icon: path.join(__dirname, 'renderer', 'assets', 'icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#101216', symbolColor: '#aab2bf', height: 38 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Terminaldeki bağlantıları varsayılan tarayıcıda aç
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.control && input.shift && input.key.toLowerCase() === 'i') {
      win.webContents.toggleDevTools();
    }
  });
  win.on('closed', () => {
    win = null;
  });
}

// IPC: hataları düzgün Türkçe mesajlarla renderer'a taşımak için sarmalayıcı
function handle(channel, fn, { needsVault = true } = {}) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      if (needsVault && !vault.isUnlocked()) throw new Error('Kasa kilitli');
      return { ok: true, value: await fn(...args) };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  });
}

const COLLECTIONS = new Set(['hosts', 'keys', 'snippets', 'forwards']);
function checkCollection(c) {
  if (!COLLECTIONS.has(c)) throw new Error('Geçersiz koleksiyon');
}

function registerIpc() {
  ipcMain.on('ask:reply', (_e, id, value) => {
    const resolve = pendingAsks.get(id);
    if (resolve) {
      pendingAsks.delete(id);
      resolve(value);
    }
  });

  // Kasa
  handle('vault:status', () => ({ exists: vault.exists(), unlocked: vault.isUnlocked() }), { needsVault: false });
  handle('vault:create', (pw) => vault.create(pw), { needsVault: false });
  handle('vault:unlock', (pw) => vault.unlock(pw), { needsVault: false });
  handle('vault:lock', () => vault.lock(), { needsVault: false });
  handle('vault:changePassword', (oldPw, newPw) => vault.changePassword(oldPw, newPw));
  handle('vault:export', async () => {
    const r = await dialog.showSaveDialog(win, {
      title: 'Yedeği dışa aktar',
      defaultPath: `termify-yedek-${new Date().toISOString().slice(0, 10)}.termify`,
      filters: [{ name: 'Termify yedeği', extensions: ['termify'] }],
    });
    if (r.canceled) return false;
    vault.exportTo(r.filePath);
    return r.filePath;
  });
  handle('vault:import', async (password) => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Yedeği içe aktar',
      filters: [{ name: 'Termify yedeği', extensions: ['termify', 'kabuk', 'json'] }],
      properties: ['openFile'],
    });
    if (r.canceled) return false;
    vault.importFrom(r.filePaths[0], password);
    return true;
  });

  // Veri
  handle('data:all', () => vault.data);
  handle('data:upsert', (collection, item) => {
    checkCollection(collection);
    return vault.upsert(collection, item);
  });
  handle('data:remove', (collection, id) => {
    checkCollection(collection);
    if (collection === 'forwards') forwards.stop(id);
    vault.remove(collection, id);
  });
  handle('settings:save', (settings) => {
    vault.data.settings = { ...vault.data.settings, ...settings };
    vault.save();
    return vault.data.settings;
  });
  handle('knownHosts:remove', (id) => {
    delete vault.data.knownHosts[id];
    vault.save();
  });

  // Anahtarlar
  handle('keys:generate', (opts) => keys.generate(opts));
  handle('keys:describe', (priv, passphrase) => keys.describe(priv, passphrase));
  handle('keys:readFile', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Özel anahtar dosyası seç',
      defaultPath: path.join(require('os').homedir(), '.ssh'),
      properties: ['openFile', 'showHiddenFiles'],
    });
    if (r.canceled) return null;
    const p = r.filePaths[0];
    if (fs.statSync(p).size > 64 * 1024) throw new Error('Dosya bir SSH anahtarı için çok büyük');
    return { name: path.basename(p), content: fs.readFileSync(p, 'utf8') };
  });
  handle('keys:saveFile', async (name, content) => {
    const r = await dialog.showSaveDialog(win, { title: 'Anahtarı kaydet', defaultPath: name });
    if (r.canceled) return false;
    fs.writeFileSync(r.filePath, content, { mode: 0o600 });
    return r.filePath;
  });

  handle('keys:install', async (hostId, keyId) => {
    const key = vault.get('keys', keyId);
    if (!key) throw new Error('Anahtar bulunamadı');
    const pub = key.public.trim();
    if (!/^[a-z0-9@.-]+ [A-Za-z0-9+/=]+( [^'\n\r]*)?$/.test(pub)) throw new Error('Genel anahtar biçimi geçersiz');
    const cmd = `umask 077; mkdir -p ~/.ssh && touch ~/.ssh/authorized_keys && (grep -qxF '${pub}' ~/.ssh/authorized_keys || echo '${pub}' >> ~/.ssh/authorized_keys)`;
    const r = await sessions.exec({ id: hostId }, cmd);
    if (r.code !== 0) throw new Error(r.stderr.trim() || `Komut ${r.code} koduyla bitti`);
  });

  // Terminal
  handle('term:open', (ref, size) => sessions.openShell(ref, size));
  ipcMain.on('term:write', (_e, id, data) => sessions.write(id, data));
  ipcMain.on('term:resize', (_e, id, cols, rows) => sessions.resize(id, cols, rows));
  ipcMain.on('term:close', (_e, id) => sessions.closeShell(id));

  // SFTP
  handle('sftp:open', (ref) => sessions.openSftp(ref));
  handle('sftp:close', (id) => sessions.closeSftp(id));
  handle('sftp:list', (id, dir) => sessions.list(id, dir));
  handle('sftp:mkdir', (id, p) => sessions.mkdir(id, p));
  handle('sftp:rename', (id, a, b) => sessions.rename(id, a, b));
  handle('sftp:chmod', (id, p, mode) => sessions.chmod(id, p, mode));
  handle('sftp:remove', (id, p) => sessions.remove(id, p));
  handle('sftp:readText', (id, p) => sessions.readText(id, p));
  handle('sftp:writeText', (id, p, text) => sessions.writeText(id, p, text));
  handle('sftp:upload', (id, locals, remoteDir, tid) => sessions.upload(id, locals, remoteDir, tid));
  handle('sftp:download', (id, remotes, localDir, tid) => sessions.download(id, remotes, localDir, tid));

  // Yerel dosyalar
  handle('local:home', () => localfs.home());
  handle('local:list', (dir) => localfs.list(dir));
  handle('local:parent', (dir) => localfs.parent(dir));
  handle('local:join', (...p) => localfs.join(...p));
  handle('local:mkdir', (p) => localfs.mkdir(p));
  handle('local:rename', (a, b) => localfs.rename(a, b));
  handle('local:remove', (p) => localfs.remove(p));
  handle('local:open', (p) => shell.openPath(p));

  // Port yönlendirme
  handle('forward:start', (id) => forwards.start(id));
  handle('forward:stop', (id) => forwards.stop(id));
  handle('forward:active', () => forwards.activeIds());

  handle('app:openExternal', (url) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
  }, { needsVault: false });

  // Güncellemeler (kasa kilitliyken de çalışır)
  handle('update:info', () => updates.info(), { needsVault: false });
  handle('update:check', () => updates.check(), { needsVault: false });
  handle('update:download', () => updates.download(), { needsVault: false });
}

app.setAppUserModelId('com.muhammed61.termify');

// Tek pencere: ikinci kez açılınca mevcut pencere öne gelir
if (!app.requestSingleInstanceLock()) app.exit(0);
app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  registerIpc();
  createWindow();
  initUpdater();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  sessions.closeAll();
  forwards.stopAll();
  if (process.platform !== 'darwin') app.quit();
});
