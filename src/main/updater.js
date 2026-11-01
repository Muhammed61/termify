// Otomatik güncelleme: public Muhammed61/termify-releases deposundaki sürümleri denetler.
// Yeni sürüm varsa arayüzde şerit gösterilir; kullanıcı onaylayınca indirilir, kurulur
// ve uygulama yeniden açılır. Kaynak kod gizli kalır, sadece kurulum dosyası dağıtılır.
const { app, BrowserWindow } = require('electron');
const { autoUpdater } = require('electron-updater');

// Durumlar: idle | dev | checking | none | available | downloading | installing | error
let state = { status: app.isPackaged ? 'idle' : 'dev' };
let available = '';
let lastCheck = 0;
let checking = false;
const busy = () => checking || state.status === 'downloading' || state.status === 'installing';

// electron-updater'ın uzun İngilizce hata metnini kısa bir Türkçe açıklamaya çevirir
function friendlyError(e) {
  const msg = e instanceof Error ? e.message : String(e ?? '');
  if (/ENOTFOUND|ETIMEDOUT|ECONNREFUSED|ECONNRESET|EAI_AGAIN|net::ERR_/i.test(msg)) return 'İnternet bağlantısı yok; güncellemeler denetlenemedi.';
  if (/latest\.yml|404/i.test(msg)) return 'Sunucuda güncelleme bilgisi bulunamadı. Yeni sürüm yayınlandığında tekrar deneyin.';
  if (/sha512|checksum/i.test(msg)) return 'İndirilen dosya doğrulanamadı. Lütfen tekrar deneyin.';
  return `Güncelleme sırasında bir sorun oluştu: ${msg.split('\n')[0].slice(0, 140)}`;
}

function set(next) {
  state = next;
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('update-state', state);
}

function check() {
  if (!app.isPackaged || busy()) return;
  checking = true;
  lastCheck = Date.now();
  autoUpdater
    .checkForUpdates()
    .catch(() => undefined)
    .finally(() => (checking = false));
}

function initUpdater() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.on('checking-for-update', () => {
    if (!['available', 'downloading', 'installing'].includes(state.status)) set({ status: 'checking' });
  });
  autoUpdater.on('update-not-available', () => set({ status: 'none' }));
  autoUpdater.on('update-available', (info) => {
    available = info.version;
    if (state.status === 'downloading' || state.status === 'installing') return;
    set({ status: 'available', version: info.version });
  });
  autoUpdater.on('download-progress', (p) => set({ status: 'downloading', version: available, percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => {
    set({ status: 'installing', version: info.version });
    // Sessiz kurulum, ardından uygulama yeniden açılır
    setTimeout(() => autoUpdater.quitAndInstall(true, true), 1500);
  });
  autoUpdater.on('error', (e) => {
    // İndirme sırasında hata olursa tekrar denenebilsin
    if (available && state.status === 'downloading') set({ status: 'available', version: available });
    else set({ status: 'error', message: friendlyError(e) });
  });

  setTimeout(check, 5000);
  setInterval(check, 30 * 60 * 1000);
  // Pencereye dönüldüğünde (en fazla 5 dakikada bir) tekrar bakılır
  app.on('browser-window-focus', () => Date.now() - lastCheck > 5 * 60 * 1000 && check());
}

const updates = {
  info() {
    return { version: app.getVersion(), state };
  },

  async check() {
    if (!app.isPackaged) return { message: 'Geliştirme modunda güncelleme denetlenmez.' };
    if (busy()) return { message: '' };
    try {
      checking = true;
      lastCheck = Date.now();
      const r = await autoUpdater.checkForUpdates().finally(() => (checking = false));
      return { message: r && r.isUpdateAvailable ? '' : `Termify güncel (sürüm ${app.getVersion()}).` };
    } catch (e) {
      throw new Error(friendlyError(e));
    }
  },

  // Kullanıcının onayıyla indirir; inince kurup uygulamayı yeniden başlatır
  download() {
    if (state.status !== 'available') return false;
    set({ status: 'downloading', version: available, percent: 0 });
    autoUpdater.downloadUpdate().catch(() => undefined);
    return true;
  },
};

module.exports = { initUpdater, updates };
