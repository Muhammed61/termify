// Terminal sekmeleri: xterm.js, bölünmüş paneller, yayın modu, arama, snippet çalıştırma.
import { h, icon, iconBtn, toast, contextMenu, isMac, kbd } from './ui.js';
import { store, onChange, hostLabel, getHost } from './state.js';
import { addTab, allTabs, activate, activeTab, closeTab } from './tabs.js';
import { termTheme } from './themes.js';
import { openSftp } from './sftp.js';

const panesBySession = new Map();
const pending = new Map(); // Paneli henüz kaydedilmemiş oturumların verisi
const controllers = new Set();

window.api.on('term:data', (id, data) => {
  const p = panesBySession.get(id);
  if (p) p.term.write(data);
  else {
    const buf = pending.get(id) || { data: [], exit: undefined };
    buf.data.push(data);
    pending.set(id, buf);
  }
});
window.api.on('term:exit', (id, reason) => {
  const p = panesBySession.get(id);
  if (p) p.onExit(reason);
  else {
    const buf = pending.get(id) || { data: [], exit: undefined };
    buf.exit = reason;
    pending.set(id, buf);
  }
});

function termOptions() {
  const s = store.data.settings;
  return {
    fontSize: Number(s.fontSize) || 14,
    fontFamily: s.fontFamily || 'Consolas, monospace',
    theme: termTheme(s.theme),
    cursorStyle: s.cursorStyle || 'block',
    cursorBlink: !!s.cursorBlink,
    scrollback: Number(s.scrollback) || 5000,
    allowProposedApi: true,
    macOptionIsMeta: true,
  };
}

// Ayarlar değişince açık terminallere uygula
onChange(() => {
  if (!store.data) return;
  const opts = termOptions();
  for (const c of controllers) {
    for (const p of c.panes) {
      for (const k of ['fontSize', 'fontFamily', 'theme', 'cursorStyle', 'cursorBlink', 'scrollback']) p.term.options[k] = opts[k];
      p.el.style.background = opts.theme.background;
      p.fitSoon();
    }
  }
});

function resolveHost(ref) {
  return (ref.id && getHost(ref.id)) || ref;
}

function pasteInto(term) {
  navigator.clipboard.readText().then((t) => t && term.paste(t));
}

export function openTerminal(hostRef) {
  const host = resolveHost(hostRef);
  const ctrl = {
    panes: [],
    focused: null,
    broadcast: false,
    direction: 'row',
    hostRef,
  };
  controllers.add(ctrl);

  const titleDot = h('span', { class: 'dot connecting' });
  const panesEl = h('div', { class: 'panes' });
  const searchInput = h('input', { class: 'input', placeholder: 'Terminalde ara…', spellcheck: 'false' });
  const searchBox = h('div', { class: 'term-search' },
    searchInput,
    iconBtn('up', 'Önceki (Shift+Enter)', () => ctrl.find(true), 'btn ghost sm icon-btn'),
    iconBtn('chevronDown', 'Sonraki (Enter)', () => ctrl.find(false), 'btn ghost sm icon-btn'),
    iconBtn('x', 'Kapat (Esc)', () => ctrl.closeSearch(), 'btn ghost sm icon-btn'));
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      ctrl.find(e.shiftKey);
    } else if (e.key === 'Escape') ctrl.closeSearch();
  });
  searchInput.addEventListener('input', () => ctrl.find(false, true));

  const broadcastBtn = h('button', { type: 'button', class: 'btn ghost sm', title: 'Yazdıklarınızı bu sekmedeki tüm panellere gönderir', onclick: () => ctrl.toggleBroadcast() }, icon('broadcast', 15), 'Yayın');
  const snippetBtn = h('button', { type: 'button', class: 'btn ghost sm', title: 'Snippet çalıştır', onclick: (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    ctrl.snippetMenu(r.left, r.bottom + 4);
  } }, icon('snippet', 15), "Snippet'ler", icon('chevronDown', 13));

  const toolbar = h('div', { class: 'toolbar' },
    h('div', { class: 'title' }, titleDot, hostLabel(host)),
    h('div', { class: 'sep' }),
    iconBtn('splitV', 'Dikey böl', () => ctrl.split('row'), 'btn ghost sm icon-btn'),
    iconBtn('splitH', 'Yatay böl', () => ctrl.split('column'), 'btn ghost sm icon-btn'),
    broadcastBtn,
    snippetBtn,
    h('button', { type: 'button', class: 'btn ghost sm', title: 'Bu host için SFTP aç', onclick: () => openSftp(ctrl.focused ? ctrl.focused.hostRef : hostRef) }, icon('folder', 15), 'SFTP'),
    iconBtn('search', kbd('Ara (Ctrl+Shift+F)'), () => ctrl.openSearch(), 'btn ghost sm icon-btn'),
    h('div', { class: 'spacer' }),
    searchBox);

  const view = h('div', { class: 'term-view' }, toolbar, panesEl);

  ctrl.updateStatus = () => {
    const st = ctrl.panes.some((p) => p.status === 'open') ? 'open' : ctrl.panes.some((p) => p.status === 'connecting') ? 'connecting' : 'closed';
    titleDot.className = `dot ${st}`;
    ctrl.tab.setStatus(st);
  };
  ctrl.focus = (pane) => {
    ctrl.focused = pane;
    for (const p of ctrl.panes) p.el.classList.toggle('focused', p === pane);
  };
  ctrl.layout = () => {
    panesEl.className = `panes ${ctrl.direction === 'column' ? 'column' : ''} ${ctrl.panes.length > 1 ? 'multi' : ''}`;
    for (const p of ctrl.panes) p.fitSoon();
  };
  ctrl.split = (direction) => {
    if (ctrl.panes.length >= 4) return toast('Bir sekmede en fazla 4 panel açılabilir', 'error');
    ctrl.direction = direction;
    const p = createPane(ctrl, ctrl.focused ? ctrl.focused.hostRef : hostRef);
    ctrl.layout();
    p.connect();
  };
  ctrl.removePane = (pane) => {
    pane.dispose();
    ctrl.panes = ctrl.panes.filter((p) => p !== pane);
    pane.el.remove();
    if (!ctrl.panes.length) return closeTab(ctrl.tab.id);
    ctrl.focus(ctrl.panes[0]);
    ctrl.panes[0].term.focus();
    ctrl.layout();
    ctrl.updateStatus();
  };
  ctrl.input = (pane, data) => {
    if (pane.status === 'closed') {
      if (data === '\r') pane.connect();
      return;
    }
    const targets = ctrl.broadcast ? ctrl.panes : [pane];
    for (const p of targets) if (p.status === 'open') window.api.term.write(p.sessionId, data);
  };
  ctrl.send = (text) => {
    const targets = ctrl.broadcast ? ctrl.panes : [ctrl.focused || ctrl.panes[0]];
    const open = targets.filter((p) => p && p.status === 'open');
    if (!open.length) return toast('Açık bir bağlantı yok', 'error');
    for (const p of open) window.api.term.write(p.sessionId, text);
    (ctrl.focused || ctrl.panes[0]).term.focus();
  };
  ctrl.toggleBroadcast = () => {
    ctrl.broadcast = !ctrl.broadcast;
    broadcastBtn.classList.toggle('on', ctrl.broadcast);
    view.classList.toggle('broadcast-on', ctrl.broadcast);
    toast(ctrl.broadcast ? 'Yayın modu açık: yazdıklarınız tüm panellere gider' : 'Yayın modu kapandı', 'info', 2000);
  };
  ctrl.openSearch = () => {
    searchBox.classList.add('open');
    searchInput.focus();
    searchInput.select();
  };
  ctrl.closeSearch = () => {
    searchBox.classList.remove('open');
    const p = ctrl.focused || ctrl.panes[0];
    if (p) {
      p.search.clearDecorations();
      p.term.focus();
    }
  };
  ctrl.find = (prev, incremental = false) => {
    const p = ctrl.focused || ctrl.panes[0];
    const q = searchInput.value;
    if (!p || !q) return;
    const opts = { incremental, decorations: { matchBackground: '#5c4a12', activeMatchBackground: '#c8941f', matchOverviewRuler: '#c8941f', activeMatchColorOverviewRuler: '#ffcc00' } };
    const found = prev ? p.search.findPrevious(q, opts) : p.search.findNext(q, opts);
    searchInput.style.borderColor = found ? '' : 'var(--danger)';
  };
  ctrl.snippetMenu = (x, y) => {
    const snippets = store.data.snippets;
    if (!snippets.length) return toast("Henüz snippet yok. Kasa > Snippet'ler bölümünden ekleyebilirsiniz.", 'info');
    contextMenu(x, y, [
      { label: ctrl.broadcast ? 'Tüm panellere gönder' : 'Aktif panele gönder', header: true },
      ...snippets.map((s) => ({ label: s.name, icon: 'snippet', onClick: () => ctrl.send(snippetText(s)) })),
    ]);
  };

  ctrl.tab = addTab({
    title: hostLabel(host),
    view,
    onActivate: () => {
      for (const p of ctrl.panes) p.fitSoon();
      if (ctrl.focused) ctrl.focused.term.focus();
    },
    onClose: () => {
      for (const p of ctrl.panes) p.dispose();
      controllers.delete(ctrl);
    },
  });

  const first = createPane(ctrl, hostRef);
  ctrl.layout();
  first.connect();
  return ctrl;
}

function createPane(ctrl, hostRef) {
  const host = resolveHost(hostRef);
  const pane = { hostRef, sessionId: null, status: 'connecting' };
  const dot = h('span', { class: 'dot connecting' });
  const xhost = h('div', { class: 'xterm-host' });
  pane.el = h('div', { class: 'pane', onmousedown: () => ctrl.focus(pane) },
    h('div', { class: 'pane-head' }, dot, h('span', { class: 'ptitle' }, hostLabel(host)),
      h('button', { type: 'button', title: 'Paneli kapat', onclick: () => ctrl.removePane(pane) }, icon('x', 13))),
    xhost);
  ctrl.tab.view.querySelector('.panes').append(pane.el);
  ctrl.panes.push(pane);
  ctrl.focus(pane);

  const term = new Terminal(termOptions());
  pane.el.style.background = term.options.theme.background;
  const fit = new FitAddon.FitAddon();
  const search = new SearchAddon.SearchAddon();
  term.loadAddon(fit);
  term.loadAddon(search);
  term.loadAddon(new WebLinksAddon.WebLinksAddon((e, uri) => window.api.openExternal(uri)));
  term.open(xhost);
  pane.term = term;
  pane.search = search;

  let raf = 0;
  pane.fitSoon = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      if (xhost.offsetParent && xhost.clientWidth > 0) {
        try {
          fit.fit();
        } catch {
          /* görünmüyor */
        }
      }
    });
  };
  const ro = new ResizeObserver(() => pane.fitSoon());
  ro.observe(xhost);
  pane.fitSoon();

  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== 'keydown') return true;
    const k = e.key.toLowerCase();
    // Windows: Ctrl+Shift+harf; macOS: Cmd+harf (Ctrl tuşları terminale gider)
    if (isMac ? e.metaKey : e.ctrlKey && e.shiftKey) {
      if (k === 'c') {
        if (term.hasSelection()) navigator.clipboard.writeText(term.getSelection());
        return false;
      }
      if (k === 'v') return false; // tarayıcının yapıştırma olayı xterm'e gider
      if (k === 'f') {
        ctrl.openSearch();
        return false;
      }
      if (['w', 't', 'd', 'e', 'l', 'tab'].includes(k)) return false; // genel kısayollar
    }
    if (!isMac && e.ctrlKey && !e.shiftKey && !e.altKey) {
      if (k === 'c' && term.hasSelection()) {
        navigator.clipboard.writeText(term.getSelection());
        term.clearSelection();
        return false;
      }
      if (k === 'v') return false;
      if (k === 'tab') return false;
    }
    return true;
  });

  term.onData((d) => ctrl.input(pane, d));
  term.onResize(({ cols, rows }) => {
    if (pane.status === 'open') window.api.term.resize(pane.sessionId, cols, rows);
  });
  term.onSelectionChange(() => {
    if (store.data?.settings.copyOnSelect && term.hasSelection()) navigator.clipboard.writeText(term.getSelection());
  });
  xhost.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    ctrl.focus(pane);
    contextMenu(e.clientX, e.clientY, [
      { label: 'Kopyala', icon: 'copy', kbd: kbd('Ctrl+Shift+C'), disabled: !term.hasSelection(), onClick: () => navigator.clipboard.writeText(term.getSelection()) },
      { label: 'Yapıştır', kbd: kbd('Ctrl+V'), onClick: () => pasteInto(term) },
      { label: 'Tümünü seç', onClick: () => term.selectAll() },
      { label: 'Ekranı temizle', onClick: () => term.clear() },
      { label: 'Ara', icon: 'search', kbd: kbd('Ctrl+Shift+F'), onClick: () => ctrl.openSearch() },
      '-',
      { label: 'Dikey böl', icon: 'splitV', onClick: () => ctrl.split('row') },
      { label: 'Yatay böl', icon: 'splitH', onClick: () => ctrl.split('column') },
      pane.status === 'closed' ? { label: 'Yeniden bağlan', icon: 'refresh', onClick: () => pane.connect() } : null,
      ctrl.panes.length > 1 ? { label: 'Paneli kapat', icon: 'x', onClick: () => ctrl.removePane(pane) } : null,
    ]);
  });

  const setStatus = (s) => {
    pane.status = s;
    dot.className = `dot ${s}`;
    ctrl.updateStatus();
  };

  pane.connect = async () => {
    if (pane.status === 'open') return;
    setStatus('connecting');
    const h2 = resolveHost(hostRef);
    term.write(`\x1b[90m${hostLabel(h2)} (${h2.host}:${Number(h2.port) || 22}) bağlanılıyor…\x1b[0m\r\n`);
    try {
      try {
        fit.fit();
      } catch {
        /* boyut yok */
      }
      const id = await window.api.term.open(hostRef, { cols: term.cols, rows: term.rows });
      if (pane.disposed) return window.api.term.close(id);
      pane.sessionId = id;
      panesBySession.set(id, pane);
      setStatus('open');
      window.api.term.resize(id, term.cols, term.rows);
      const buf = pending.get(id);
      if (buf) {
        pending.delete(id);
        for (const d of buf.data) term.write(d);
        if (buf.exit !== undefined) pane.onExit(buf.exit);
      }
      term.focus();
    } catch (err) {
      if (pane.disposed) return;
      term.write(`\x1b[31m✖ ${err.message}\x1b[0m\r\n\x1b[90mYeniden denemek için Enter'a basın.\x1b[0m\r\n`);
      setStatus('closed');
    }
  };

  pane.onExit = (reason) => {
    panesBySession.delete(pane.sessionId);
    pane.sessionId = null;
    if (pane.disposed) return;
    setStatus('closed');
    term.write(`\r\n\x1b[90m── Bağlantı kapandı${reason ? ': ' + reason : ''}. Yeniden bağlanmak için Enter'a basın ──\x1b[0m\r\n`);
  };

  pane.dispose = () => {
    pane.disposed = true;
    if (pane.sessionId) {
      window.api.term.close(pane.sessionId);
      panesBySession.delete(pane.sessionId);
    }
    ro.disconnect();
    term.dispose();
  };

  return pane;
}

export function snippetText(s) {
  const cmd = s.command.replace(/\r?\n/g, '\r');
  return s.autoRun ? cmd.replace(/\r?$/, '\r') : cmd;
}

export function terminalControllers() {
  return [...controllers];
}

// Snippet'i açık bir terminalde çalıştırır; yoksa host seçtirip yeni terminal açar
export function runSnippet(snippet, x, y, pickHost) {
  const ctrls = [...controllers];
  const runIn = (c) => {
    activate(c.tab.id);
    c.send(snippetText(snippet));
  };
  const items = [];
  if (ctrls.length) {
    items.push({ label: 'Açık terminalde çalıştır', header: true });
    for (const c of ctrls) items.push({ label: c.tab.title, icon: 'terminal', onClick: () => runIn(c) });
    items.push('-');
  }
  items.push({ label: 'Yeni bağlantıda çalıştır…', icon: 'plus', onClick: async () => {
    const host = await pickHost();
    if (!host) return;
    const c = openTerminal({ id: host.id });
    const wait = setInterval(() => {
      const p = c.panes[0];
      if (!p || p.disposed || p.status === 'closed') return clearInterval(wait);
      if (p.status === 'open') {
        clearInterval(wait);
        setTimeout(() => c.send(snippetText(snippet)), 400);
      }
    }, 150);
  } });
  contextMenu(x, y, items);
}

export function focusActiveTerminal() {
  const t = activeTab();
  const c = [...controllers].find((x) => x.tab === t);
  if (c && c.focused) c.focused.term.focus();
}

export { allTabs };
