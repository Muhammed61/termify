// Uygulama girişi: kilit ekranı, Kasa sekmesi, kenar menü, kısayollar, sorular.
import { h, icon, clear, modal, toast, promptDialog, passwordInput, closeMenu } from './ui.js';
import { store, onChange, reload, notify } from './state.js';
import { addTab, activate, activeTab, closeTab, cycle } from './tabs.js';
import { terminalControllers } from './terminal.js';
import { openSftp } from './sftp.js';
import { renderHosts } from './views/hosts.js';
import { renderKeys } from './views/keys.js';
import { renderForwards } from './views/forwards.js';
import { renderSnippets } from './views/snippets.js';
import { renderKnownHosts, renderSettings } from './views/settings.js';
import { onUpdate } from './updates.js';

const SECTIONS = [
  { id: 'hosts', label: 'Hostlar', icon: 'server', render: renderHosts, count: () => store.data.hosts.length },
  { id: 'keys', label: 'Anahtarlar', icon: 'key', render: renderKeys, count: () => store.data.keys.length },
  { id: 'forwards', label: 'Port Yönlendirme', icon: 'forward', render: renderForwards, count: () => store.data.forwards.length },
  { id: 'snippets', label: "Snippet'ler", icon: 'snippet', render: renderSnippets, count: () => store.data.snippets.length },
  { id: 'known', label: 'Bilinen Hostlar', icon: 'shield', render: renderKnownHosts, count: () => Object.keys(store.data.knownHosts).length },
  { id: 'settings', label: 'Ayarlar', icon: 'settings', render: renderSettings },
];

let section = 'hosts';
let homeTab = null;
let navEl;
let contentEl;

function buildHome() {
  navEl = h('div', { class: 'nav' });
  contentEl = h('div', { class: 'content' });
  const sidebar = h('div', { class: 'sidebar' },
    navEl,
    h('div', { class: 'spacer' }),
    h('button', { class: 'nav-item', onclick: () => openSftp(null) }, icon('folder', 17), 'Yeni SFTP'),
    h('button', { class: 'nav-item', onclick: lock, title: 'Ctrl+Shift+L' }, icon('lock', 17), 'Kasayı kilitle'));
  const view = h('div', { class: 'home' }, sidebar, contentEl);
  homeTab = addTab({ title: 'Kasa', icon: 'server', view, closable: false, home: true });
  renderSection();
}

export function showSection(id) {
  section = id;
  renderSection(true);
  if (homeTab) activate(homeTab.id);
}

function renderSection(resetScroll = false) {
  if (!store.data || !contentEl) return;
  const prevBody = contentEl.querySelector('.content-body');
  const scroll = !resetScroll && prevBody ? prevBody.scrollTop : 0;
  const focusedId = document.activeElement && contentEl.contains(document.activeElement) && document.activeElement.placeholder;

  clear(navEl);
  for (const s of SECTIONS) {
    navEl.append(h('button', { class: `nav-item ${s.id === section ? 'active' : ''}`, onclick: () => showSection(s.id) },
      icon(s.icon, 17), s.label, s.count ? h('span', { class: 'count' }, s.count() || '') : null));
  }
  clear(contentEl);
  const header = h('div', { class: 'content-header' });
  const body = h('div', { class: 'content-body' });
  contentEl.append(header, body);
  SECTIONS.find((s) => s.id === section).render(header, body);
  body.scrollTop = scroll;
  // Arama kutusundayken yeniden çizimde odağı koru
  if (focusedId) {
    const el = [...contentEl.querySelectorAll('input')].find((i) => i.placeholder === focusedId);
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }
}

onChange(() => renderSection());
// Ayarlar açıkken güncelleme durumu değişirse kartı yenile
onUpdate(() => section === 'settings' && renderSection());

// ---------- Kilit ekranı ----------
async function showLock() {
  const st = await window.api.vault.status();
  const creating = !st.exists;
  const pw = passwordInput({ placeholder: creating ? 'Yeni ana parola' : 'Ana parola', autofocus: true });
  const pw2 = creating ? passwordInput({ placeholder: 'Ana parola (tekrar)' }) : null;
  const err = h('div', { class: 'err' });
  const btn = h('button', { class: 'btn primary', type: 'submit' }, creating ? 'Kasayı oluştur' : 'Kilidi aç');
  const overlay = h('div', { class: 'lock' },
    h('div', { class: 'lock-box' },
      h('img', { class: 'lock-logo', src: 'assets/logo.svg', alt: '' }),
      h('h1', null, creating ? "Termify'a hoş geldiniz" : 'Kasa kilitli'),
      h('p', null, creating
        ? 'Hostlarınız, parolalarınız ve anahtarlarınız bu ana parolayla şifrelenecek.'
        : 'Devam etmek için ana parolanızı girin.'),
      h('form', {
        onsubmit: async (e) => {
          e.preventDefault();
          const a = pw.querySelector('input').value;
          err.textContent = '';
          if (creating) {
            if (a.length < 8) return (err.textContent = 'Parola en az 8 karakter olmalı');
            if (a !== pw2.querySelector('input').value) return (err.textContent = 'Parolalar eşleşmiyor');
          }
          btn.disabled = true;
          btn.textContent = creating ? 'Oluşturuluyor…' : 'Açılıyor…';
          try {
            if (creating) await window.api.vault.create(a);
            else await window.api.vault.unlock(a);
            overlay.remove();
            await afterUnlock();
          } catch (ex) {
            err.textContent = ex.message;
            btn.disabled = false;
            btn.textContent = creating ? 'Kasayı oluştur' : 'Kilidi aç';
            pw.querySelector('input').select();
          }
        },
      },
        pw, pw2,
        creating ? h('div', { class: 'warn-box', style: { margin: 0, fontSize: '12px' } }, 'Bu parolayı unutursanız verileriniz kurtarılamaz. Güvenli bir yere not edin.') : null,
        err, btn)));
  document.body.append(overlay);
  setTimeout(() => pw.querySelector('input').focus(), 50);
}

async function afterUnlock() {
  await reload();
  for (const id of await window.api.forward.active()) store.forwardStatus[id] = { state: 'active' };
  if (!homeTab) buildHome();
  else notify();
  lastActivity = Date.now();
}

async function lock() {
  closeMenu();
  for (const b of document.querySelectorAll('.backdrop')) b.remove();
  if (document.activeElement) document.activeElement.blur();
  await window.api.vault.lock();
  store.data = null;
  showLock();
}

// ---------- Ana süreçten gelen sorular ----------
window.api.on('ask', async (req) => {
  let value = null;
  if (req.type === 'hostkey') value = await hostKeyDialog(req);
  else value = await promptDialog({ title: req.title || 'Giriş', message: req.message, secret: req.type === 'secret', okLabel: 'Gönder' });
  window.api.replyAsk(req.id, value);
});

function hostKeyDialog(req) {
  return new Promise((resolve) => {
    let ok = false;
    const changed = !!req.oldFingerprint;
    modal({
      title: changed ? 'UYARI: Host anahtarı değişti!' : 'Yeni sunucu',
      onClose: () => resolve(ok),
      body: [
        changed
          ? h('div', { class: 'warn-box' }, `${req.host}:${req.port} sunucusunun kimliği daha önce kaydedilenden farklı. Sunucu yeniden kurulmuş olabilir; ama birisi bağlantınızı dinliyor da olabilir (ortadaki adam saldırısı). Emin değilseniz bağlanmayın.`)
          : h('p', null, `${req.host}:${req.port} sunucusuna ilk kez bağlanıyorsunuz. Parmak izinin sunucunuza ait olduğunu doğrulayın.`),
        changed ? [h('div', { class: 'muted', style: { fontSize: '12px', marginBottom: '4px' } }, 'Eski parmak izi'), h('div', { class: 'fp' }, req.oldFingerprint)] : null,
        h('div', { class: 'muted', style: { fontSize: '12px', marginBottom: '4px' } }, changed ? 'Yeni parmak izi' : 'Parmak izi (SHA256)'),
        h('div', { class: 'fp' }, req.fingerprint),
      ],
      actions: [
        { label: 'Bağlanma', onClick: (close) => close() },
        { label: changed ? 'Yine de güven ve bağlan' : 'Güven ve bağlan', primary: !changed, danger: changed, submit: !changed, onClick: (close) => { ok = true; close(); } },
      ],
    });
  });
}

window.api.on('forward:status', (id, st) => {
  store.forwardStatus[id] = st;
  if (st.state === 'error' && st.error && store.data) {
    const r = store.data.forwards.find((f) => f.id === id);
    toast(`Tünel durdu${r && r.label ? ' (' + r.label + ')' : ''}: ${st.error}`, 'error', 6000);
  }
  if (store.data) notify();
});

// ---------- Otomatik kilit ----------
let lastActivity = Date.now();
for (const ev of ['keydown', 'mousedown', 'wheel']) document.addEventListener(ev, () => (lastActivity = Date.now()), true);
setInterval(() => {
  if (!store.data) return;
  const min = Number(store.data.settings.autoLockMinutes) || 0;
  if (min > 0 && Date.now() - lastActivity > min * 60000) lock();
}, 15000);

// ---------- Klavye kısayolları ----------
document.addEventListener('keydown', (e) => {
  if (!store.data) return;
  const k = e.key.toLowerCase();
  const ctrlFor = () => terminalControllers().find((c) => c.tab === activeTab());
  if (e.ctrlKey && k === 'tab') {
    e.preventDefault();
    cycle(e.shiftKey ? -1 : 1);
  } else if (e.ctrlKey && e.shiftKey) {
    if (k === 't') {
      e.preventDefault();
      showSection('hosts');
      setTimeout(() => contentEl.querySelector('.quick input')?.focus(), 30);
    } else if (k === 'w') {
      e.preventDefault();
      const t = activeTab();
      if (t && t.closable) closeTab(t.id);
    } else if (k === 'd' || k === 'e') {
      const c = ctrlFor();
      if (c) {
        e.preventDefault();
        c.split(k === 'd' ? 'row' : 'column');
      }
    } else if (k === 'l') {
      e.preventDefault();
      lock();
    }
  }
});

// Pencereye bırakılan dosyalar uygulamayı terk etmesin
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => e.preventDefault());

showLock();
