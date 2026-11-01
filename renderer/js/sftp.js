// SFTP sekmesi: solda yerel bilgisayar, sağda uzak sunucu; sürükle-bırak ile aktarım.
import { h, icon, iconBtn, clear, toast, modal, confirmDialog, promptDialog, contextMenu, formatBytes, formatDate, formatMode, avatar } from './ui.js';
import { store, hostLabel, hostAddress, getHost, parseQuick } from './state.js';
import { addTab, closeTab } from './tabs.js';

const progressHandlers = new Map();
const closedHandlers = new Map();
window.api.on('sftp:progress', (tid, p) => {
  const fn = progressHandlers.get(tid);
  if (fn) fn(p);
});
window.api.on('sftp:closed', (id) => {
  const fn = closedHandlers.get(id);
  if (fn) fn();
});

const rjoin = (dir, name) => (dir === '/' ? '' : dir.replace(/\/+$/, '')) + '/' + name;
const rparent = (dir) => (dir === '/' ? '/' : dir.replace(/\/+$/, '').replace(/\/[^/]*$/, '') || '/');
const DRAG_TYPE = 'application/x-termify-files';

export function openSftp(hostRef) {
  const view = h('div', { class: 'sftp-view' });
  const tab = addTab({ title: 'SFTP', icon: 'folder', view, onClose: () => ctx.dispose() });
  const ctx = { sid: null, dispose: () => {} };

  const start = (ref) => {
    clear(view);
    const host = (ref.id && getHost(ref.id)) || ref;
    tab.setTitle(`SFTP · ${hostLabel(host)}`);
    buildBrowser(view, ref, host, ctx, tab);
  };

  if (hostRef) start(hostRef);
  else view.append(hostPicker(start));
  return tab;
}

function hostPicker(onPick) {
  const quick = h('input', { class: 'input', placeholder: 'kullanıcı@sunucu:port', spellcheck: 'false' });
  const go = () => {
    const ref = parseQuick(quick.value);
    if (!ref) return toast('Geçersiz adres. Örnek: root@192.168.1.10:22', 'error');
    onPick(ref);
  };
  quick.addEventListener('keydown', (e) => e.key === 'Enter' && go());
  const hosts = store.data.hosts;
  return h('div', { class: 'host-picker' },
    h('div', { class: 'box' },
      h('h2', { style: { margin: 0, fontSize: '17px' } }, 'SFTP için bir host seçin'),
      h('div', { class: 'quick' }, icon('bolt', 16), quick, h('button', { class: 'btn primary', onclick: go }, 'Bağlan')),
      hosts.length
        ? h('div', { class: 'list' }, hosts.map((x) => h('div', { class: 'card', onclick: () => onPick({ id: x.id }) },
          avatar(hostLabel(x), x.color),
          h('div', { class: 'card-main' }, h('div', { class: 'card-title' }, hostLabel(x)), h('div', { class: 'card-sub' }, hostAddress(x))))))
        : h('p', { class: 'muted' }, 'Kayıtlı host yok; yukarıdan hızlı bağlanabilirsiniz.')));
}

function buildBrowser(view, ref, host, ctx, tab) {
  const transfers = h('div', { class: 'transfers' });
  const remoteOps = {
    kind: 'remote',
    title: hostLabel(host),
    list: (p) => window.api.sftp.list(ctx.sid, p),
    parent: async (p) => rparent(p),
    join: async (d, n) => rjoin(d, n),
    mkdir: (p) => window.api.sftp.mkdir(ctx.sid, p),
    rename: (a, b) => window.api.sftp.rename(ctx.sid, a, b),
    remove: (p) => window.api.sftp.remove(ctx.sid, p),
    home: async () => ctx.home,
    display: (p) => p,
  };
  const localOps = {
    kind: 'local',
    title: 'Bu bilgisayar',
    list: (p) => window.api.local.list(p),
    parent: (p) => window.api.local.parent(p),
    join: (d, n) => window.api.local.join(d, n),
    mkdir: (p) => window.api.local.mkdir(p),
    rename: (a, b) => window.api.local.rename(a, b),
    remove: (p) => window.api.local.remove(p),
    home: () => window.api.local.home(),
    display: (p) => p || 'Bu Bilgisayar',
  };

  const panels = {};
  const transfer = async (from, entries) => {
    const to = from.ops.kind === 'local' ? panels.remote : panels.local;
    if (!ctx.sid) return toast('SFTP bağlantısı yok', 'error');
    const paths = await Promise.all(entries.map((e) => from.ops.join(from.path, e.name)));
    runTransfer(from.ops.kind === 'local' ? 'upload' : 'download', paths, to.path, to);
  };
  const runTransfer = async (kind, paths, targetDir, targetPanel) => {
    if (kind === 'download' && !targetDir) return toast('İndirmek için yerel panelde bir klasör açın', 'error');
    const tid = crypto.randomUUID();
    const label = paths.length === 1 ? paths[0].split(/[\\/]/).pop() : `${paths.length} öğe`;
    const bar = h('div');
    const info = h('span', { class: 'muted', style: { width: '160px', textAlign: 'right' } }, 'Hazırlanıyor…');
    const row = h('div', { class: 'transfer' },
      icon(kind === 'upload' ? 'upload' : 'download', 14),
      h('span', { class: 'ellipsis', style: { width: '220px' } }, (kind === 'upload' ? 'Yükleniyor: ' : 'İndiriliyor: ') + label),
      h('div', { class: 'bar' }, bar), info,
      iconBtn('x', 'Listeden kaldır', () => row.remove(), 'btn ghost sm icon-btn'));
    transfers.prepend(row);
    progressHandlers.set(tid, ({ done, total, file }) => {
      const pct = total ? Math.round((done / total) * 100) : 100;
      bar.style.width = pct + '%';
      info.textContent = `${formatBytes(done)} / ${formatBytes(total)} · %${pct}`;
      row.title = file;
    });
    try {
      if (kind === 'upload') await window.api.sftp.upload(ctx.sid, paths, targetDir, tid);
      else await window.api.sftp.download(ctx.sid, paths, targetDir, tid);
      row.classList.add('done');
      bar.style.width = '100%';
      info.textContent = 'Tamamlandı';
      setTimeout(() => row.remove(), 6000);
    } catch (err) {
      row.classList.add('error');
      info.textContent = 'Hata';
      toast('Aktarım başarısız: ' + err.message, 'error');
    } finally {
      progressHandlers.delete(tid);
      targetPanel.refresh();
    }
  };

  panels.local = createPanel(localOps, { transfer, onOsDrop: null });
  panels.remote = createPanel(remoteOps, {
    transfer,
    onOsDrop: (paths) => runTransfer('upload', paths, panels.remote.path, panels.remote),
    openFile: (entry, path) => editRemote(ctx, path, entry),
    chmod: async (path, entry) => {
      const cur = entry.mode != null ? (entry.mode & 0o777).toString(8).padStart(3, '0') : '644';
      const v = await promptDialog({ title: 'İzinleri değiştir', message: `${entry.name} için sekizlik izin değeri (ör. 755, 644)`, value: cur });
      if (v == null) return;
      if (!/^[0-7]{3,4}$/.test(v)) return toast('Geçersiz izin değeri', 'error');
      await window.api.sftp.chmod(ctx.sid, path, v);
      panels.remote.refresh();
    },
  });
  panels.local.other = panels.remote;
  panels.remote.other = panels.local;

  view.append(h('div', { class: 'sftp-panels' }, panels.local.el, panels.remote.el), transfers);
  panels.local.setStatus('open');
  localOps.home().then((p) => panels.local.go(p));

  const connect = async () => {
    panels.remote.showMessage(h('div', null, h('div', { class: 'dot connecting', style: { margin: '0 auto 10px' } }), `${hostLabel(host)} bağlanılıyor…`));
    panels.remote.setStatus('connecting');
    tab.setStatus('connecting');
    try {
      const { id, home } = await window.api.sftp.open(ref);
      if (ctx.disposed) return window.api.sftp.close(id);
      ctx.sid = id;
      ctx.home = home;
      closedHandlers.set(id, () => {
        ctx.sid = null;
        panels.remote.setStatus('closed');
        tab.setStatus('closed');
        showReconnect('Bağlantı kapandı');
      });
      panels.remote.setStatus('open');
      tab.setStatus('open');
      panels.remote.hideMessage();
      await panels.remote.go(home);
    } catch (err) {
      panels.remote.setStatus('closed');
      tab.setStatus('closed');
      showReconnect(err.message);
    }
  };
  const showReconnect = (msg) => {
    panels.remote.showMessage(h('div', null,
      h('div', { style: { color: 'var(--danger)', marginBottom: '12px' } }, msg),
      h('button', { class: 'btn primary', onclick: connect }, icon('refresh', 14), 'Yeniden bağlan')));
  };
  ctx.dispose = () => {
    ctx.disposed = true;
    if (ctx.sid) {
      closedHandlers.delete(ctx.sid);
      window.api.sftp.close(ctx.sid);
    }
  };
  connect();
}

function createPanel(ops, hooks) {
  const panel = { ops, path: null, entries: [], selected: new Set(), showHidden: false, anchor: null };
  const dot = h('span', { class: 'dot' });
  const pathInput = h('input', { class: 'input', spellcheck: 'false' });
  pathInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') panel.go(pathInput.value.trim() === 'Bu Bilgisayar' ? '' : pathInput.value.trim());
  });
  const hiddenBtn = iconBtn('eye', 'Gizli dosyaları göster', () => {
    panel.showHidden = !panel.showHidden;
    hiddenBtn.classList.toggle('on', panel.showHidden);
    panel.render();
  }, 'btn ghost sm icon-btn');
  const isLocal = ops.kind === 'local';
  const sendBtn = h('button', { type: 'button', class: 'btn sm', title: isLocal ? 'Seçilenleri sunucuya yükle' : 'Seçilenleri bilgisayara indir', onclick: () => panel.sendSelected() },
    icon(isLocal ? 'upload' : 'download', 14), isLocal ? 'Yükle' : 'İndir');
  const table = h('div', { class: 'ftable', tabindex: '0' });
  const msg = h('div', { class: 'overlay-msg', style: { display: 'none' } });

  panel.el = h('div', { class: 'fpanel' },
    h('div', { class: 'fpanel-head' },
      h('div', { class: 'top' },
        h('div', { class: 'name' }, isLocal ? icon('monitor', 16) : dot, ops.title),
        hiddenBtn,
        iconBtn('folderPlus', 'Yeni klasör', () => panel.newFolder(), 'btn ghost sm icon-btn'),
        iconBtn('refresh', 'Yenile', () => panel.refresh(), 'btn ghost sm icon-btn'),
        sendBtn),
      h('div', { class: 'pathbar' },
        iconBtn('up', 'Üst klasör', () => panel.up(), 'btn sm icon-btn'),
        iconBtn('home', 'Ana klasör', async () => panel.go(await ops.home()), 'btn sm icon-btn'),
        pathInput)),
    table, msg);

  panel.setStatus = (s) => (dot.className = `dot ${s}`);
  panel.showMessage = (node) => {
    msg.replaceChildren(node);
    msg.style.display = '';
  };
  panel.hideMessage = () => (msg.style.display = 'none');

  panel.go = async (p) => {
    if (!panel.entries.length) table.replaceChildren(h('div', { class: 'muted', style: { padding: '24px', textAlign: 'center' } }, 'Yükleniyor…'));
    try {
      const entries = await ops.list(p);
      panel.path = p;
      panel.entries = entries;
      panel.selected.clear();
      pathInput.value = ops.display(p);
      panel.render();
    } catch (err) {
      toast(`Klasör açılamadı: ${err.message}`, 'error');
      pathInput.value = ops.display(panel.path);
    }
  };
  panel.refresh = () => panel.path != null && panel.go(panel.path);
  panel.up = async () => panel.go(await ops.parent(panel.path));

  const visible = () => {
    const list = panel.entries.filter((e) => panel.showHidden || !e.name.startsWith('.'));
    return list.sort((a, b) => {
      const da = a.type.includes('d') ? 0 : 1;
      const db = b.type.includes('d') ? 0 : 1;
      return da - db || a.name.localeCompare(b.name, 'tr', { numeric: true, sensitivity: 'base' });
    });
  };
  const isDir = (e) => e.type === 'd' || e.type === 'ld';
  const selectedEntries = () => panel.entries.filter((e) => panel.selected.has(e.name));

  panel.render = () => {
    clear(table);
    const rowCls = `frow ${isLocal ? 'local-row' : ''}`;
    table.append(h('div', { class: rowCls + ' header' }, h('div', null, 'Ad'), h('div', { class: 'meta' }, 'Boyut'), h('div', { class: 'meta' }, 'Değiştirilme'), isLocal ? null : h('div', { class: 'meta left' }, 'İzinler')));
    if (panel.path !== '' && panel.path !== '/' && !(isLocal && /^[A-Z]:\\?$/i.test(panel.path || ''))) {
      table.append(h('div', { class: rowCls, ondblclick: () => panel.up() }, h('div', { class: 'fname' }, icon('folder', 16), h('span', null, '..'))));
    }
    const list = visible();
    for (const e of list) {
      const row = h('div', {
        class: `${rowCls} ${panel.selected.has(e.name) ? 'selected' : ''}`,
        draggable: 'true',
        onclick: (ev) => panel.select(e, ev, list),
        ondblclick: () => panel.open(e),
        oncontextmenu: (ev) => {
          ev.preventDefault();
          if (!panel.selected.has(e.name)) panel.select(e, {}, list);
          panel.menu(ev.clientX, ev.clientY, e);
        },
        ondragstart: (ev) => {
          if (!panel.selected.has(e.name)) panel.select(e, {}, list);
          ev.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ from: ops.kind }));
          ev.dataTransfer.effectAllowed = 'copy';
          dragSource = panel;
        },
      },
        h('div', { class: 'fname' }, icon(isDir(e) ? 'folder' : e.type === 'l' ? 'link' : 'file', 16), h('span', null, e.name)),
        h('div', { class: 'meta' }, isDir(e) ? '' : formatBytes(e.size)),
        h('div', { class: 'meta' }, formatDate(e.mtime)),
        isLocal ? null : h('div', { class: 'meta left' }, formatMode(e.mode)));
      row.firstChild.firstChild.classList.add(isDir(e) ? 'folder' : 'file');
      table.append(row);
    }
    if (!list.length) table.append(h('div', { class: 'muted', style: { padding: '24px', textAlign: 'center' } }, 'Bu klasör boş'));
  };

  panel.select = (e, ev, list) => {
    if (ev.shiftKey && panel.anchor) {
      const a = list.findIndex((x) => x.name === panel.anchor);
      const b = list.findIndex((x) => x.name === e.name);
      panel.selected = new Set(list.slice(Math.min(a, b), Math.max(a, b) + 1).map((x) => x.name));
    } else if (ev.ctrlKey) {
      if (panel.selected.has(e.name)) panel.selected.delete(e.name);
      else panel.selected.add(e.name);
      panel.anchor = e.name;
    } else {
      panel.selected = new Set([e.name]);
      panel.anchor = e.name;
    }
    panel.render();
    table.focus();
  };

  panel.open = async (e) => {
    const full = await ops.join(panel.path, e.name);
    if (isDir(e)) return panel.go(full);
    if (isLocal) return window.api.local.open(full);
    if (hooks.openFile) hooks.openFile(e, full);
  };

  panel.sendSelected = () => {
    const sel = selectedEntries();
    if (!sel.length) return toast('Önce dosya seçin', 'info', 2000);
    hooks.transfer(panel, sel);
  };

  panel.newFolder = async () => {
    if (isLocal && !panel.path) return;
    const name = await promptDialog({ title: 'Yeni klasör', message: 'Klasör adı', placeholder: 'yeni-klasor', okLabel: 'Oluştur' });
    if (!name) return;
    try {
      await ops.mkdir(await ops.join(panel.path, name));
      panel.refresh();
    } catch (err) {
      toast('Klasör oluşturulamadı: ' + err.message, 'error');
    }
  };

  panel.rename = async (e) => {
    const name = await promptDialog({ title: 'Yeniden adlandır', value: e.name, okLabel: 'Kaydet' });
    if (!name || name === e.name) return;
    try {
      await ops.rename(await ops.join(panel.path, e.name), await ops.join(panel.path, name));
      panel.refresh();
    } catch (err) {
      toast('Yeniden adlandırılamadı: ' + err.message, 'error');
    }
  };

  panel.removeSelected = async () => {
    const sel = selectedEntries();
    if (!sel.length) return;
    const what = sel.length === 1 ? `"${sel[0].name}"` : `${sel.length} öğe`;
    const where = isLocal ? 'bilgisayarınızdan' : 'sunucudan';
    if (!(await confirmDialog(`${what} ${where} kalıcı olarak silinecek. Klasörlerin içindekiler de silinir.`, { title: 'Silinsin mi?', okLabel: 'Sil', danger: true }))) return;
    for (const e of sel) {
      try {
        await ops.remove(await ops.join(panel.path, e.name));
      } catch (err) {
        toast(`${e.name} silinemedi: ${err.message}`, 'error');
      }
    }
    panel.refresh();
  };

  panel.menu = (x, y, e) => {
    const multi = panel.selected.size > 1;
    contextMenu(x, y, [
      !multi ? { label: isDir(e) ? 'Aç' : isLocal ? 'Varsayılan uygulamayla aç' : 'Düzenle', icon: isDir(e) ? 'folder' : 'edit', onClick: () => panel.open(e) } : null,
      { label: isLocal ? 'Sunucuya yükle' : 'Bilgisayara indir', icon: isLocal ? 'upload' : 'download', onClick: () => panel.sendSelected() },
      '-',
      !multi ? { label: 'Yeniden adlandır', icon: 'edit', kbd: 'F2', onClick: () => panel.rename(e) } : null,
      !multi && !isLocal ? { label: 'İzinleri değiştir', icon: 'shield', onClick: async () => hooks.chmod(await ops.join(panel.path, e.name), e) } : null,
      { label: 'Yolu kopyala', icon: 'copy', onClick: async () => navigator.clipboard.writeText(await ops.join(panel.path, e.name)) },
      '-',
      { label: 'Yeni klasör', icon: 'folderPlus', onClick: () => panel.newFolder() },
      { label: 'Yenile', icon: 'refresh', onClick: () => panel.refresh() },
      '-',
      { label: 'Sil', icon: 'trash', danger: true, kbd: 'Del', onClick: () => panel.removeSelected() },
    ]);
  };

  table.addEventListener('contextmenu', (ev) => {
    if (ev.defaultPrevented) return;
    ev.preventDefault();
    contextMenu(ev.clientX, ev.clientY, [
      { label: 'Yeni klasör', icon: 'folderPlus', onClick: () => panel.newFolder() },
      { label: 'Yenile', icon: 'refresh', onClick: () => panel.refresh() },
    ]);
  });

  table.addEventListener('keydown', (ev) => {
    const list = visible();
    if (ev.key === 'Delete') panel.removeSelected();
    else if (ev.key === 'F2') {
      const s = selectedEntries();
      if (s.length === 1) panel.rename(s[0]);
    } else if (ev.key === 'Enter') {
      const s = selectedEntries();
      if (s.length === 1) panel.open(s[0]);
    } else if (ev.key === 'Backspace') panel.up();
    else if (ev.key === 'a' && ev.ctrlKey) {
      ev.preventDefault();
      panel.selected = new Set(list.map((x) => x.name));
      panel.render();
    } else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      if (!list.length) return;
      const i = list.findIndex((x) => x.name === panel.anchor);
      const next = list[Math.max(0, Math.min(list.length - 1, i + (ev.key === 'ArrowDown' ? 1 : -1)))];
      panel.select(next, { shiftKey: ev.shiftKey }, list);
      const rows = table.querySelectorAll('.frow.selected');
      if (rows.length) rows[rows.length - 1].scrollIntoView({ block: 'nearest' });
    }
  });

  // Sürükle-bırak: diğer panelden veya Windows Gezgini'nden
  panel.el.addEventListener('dragover', (ev) => {
    const types = [...ev.dataTransfer.types];
    const fromOther = types.includes(DRAG_TYPE) && dragSource && dragSource !== panel;
    const fromOs = types.includes('Files') && hooks.onOsDrop;
    if (fromOther || fromOs) {
      ev.preventDefault();
      panel.el.classList.add('drop');
    }
  });
  panel.el.addEventListener('dragleave', (ev) => {
    if (!panel.el.contains(ev.relatedTarget)) panel.el.classList.remove('drop');
  });
  panel.el.addEventListener('drop', (ev) => {
    ev.preventDefault();
    panel.el.classList.remove('drop');
    if ([...ev.dataTransfer.types].includes(DRAG_TYPE) && dragSource && dragSource !== panel) {
      const src = dragSource;
      dragSource = null;
      src.sendSelected();
    } else if (ev.dataTransfer.files.length && hooks.onOsDrop) {
      const paths = [...ev.dataTransfer.files].map((f) => window.api.pathForFile(f)).filter(Boolean);
      if (paths.length) hooks.onOsDrop(paths);
    }
  });

  return panel;
}

let dragSource = null;
document.addEventListener('dragend', () => setTimeout(() => (dragSource = null), 0));

async function editRemote(ctx, path, entry) {
  if (entry.size > 5 * 1024 * 1024) return toast('Dosya düzenlemek için çok büyük; indirerek açın', 'error');
  let text;
  try {
    text = await window.api.sftp.readText(ctx.sid, path);
  } catch (err) {
    return toast('Dosya okunamadı: ' + err.message, 'error');
  }
  if (/\u0000/.test(text)) return toast('Bu bir ikili (binary) dosya; düzenlenemez', 'error');
  const area = h('textarea', { class: 'input editor', spellcheck: 'false' });
  area.value = text;
  let dirty = false;
  area.addEventListener('input', () => (dirty = true));
  area.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      document.execCommand('insertText', false, '  ');
    }
    if (e.key === 's' && e.ctrlKey) {
      e.preventDefault();
      save();
    }
  });
  const save = async () => {
    try {
      await window.api.sftp.writeText(ctx.sid, path, area.value);
      dirty = false;
      toast('Kaydedildi: ' + path, 'success', 2000);
    } catch (err) {
      toast('Kaydedilemedi: ' + err.message, 'error');
    }
  };
  modal({
    title: path,
    wide: true,
    body: area,
    actions: [
      { label: 'Kapat', onClick: async (close) => {
        if (dirty && !(await confirmDialog('Kaydedilmemiş değişiklikler kaybolacak.', { okLabel: 'Kaydetmeden kapat', danger: true }))) return;
        close();
      } },
      { label: 'Kaydet (Ctrl+S)', primary: true, onClick: () => save() },
    ],
  });
}

export { closeTab };
