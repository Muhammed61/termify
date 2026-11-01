// Güncelleme şeridi (başlık çubuğunun altında) ve Ayarlar'daki güncelleme kartı için durum.
import { h, icon, confirmDialog, toast } from './ui.js';
import { terminalControllers } from './terminal.js';

// manual: macOS'ta kendiliğinden kurulamaz, yeni .dmg tarayıcıda indirilir
export const update = { version: '', manual: false, state: { status: 'idle' } };
const listeners = new Set();
let dismissed = null;

export function onUpdate(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function apply(state) {
  update.state = state;
  renderBanner();
  for (const fn of listeners) fn();
}

window.api.updates.info().then((i) => {
  update.version = i.version;
  update.manual = i.manual;
  apply(i.state);
});
window.api.updates.onState(apply);

export async function startUpdate() {
  if (update.manual) {
    await window.api.updates.download();
    toast("Kurulum dosyası tarayıcıda indiriliyor. Açıp Termify'yi Uygulamalar klasörüne sürükleyin; verileriniz korunur.", 'success', 8000);
    return;
  }
  const open = terminalControllers().reduce((n, c) => n + c.panes.filter((p) => p.status === 'open').length, 0);
  if (open && !(await confirmDialog(`${open} açık terminal bağlantısı var. Güncelleme kurulurken Termify kapanıp yeniden açılacak ve bu bağlantılar kesilecek.`, { title: 'Güncelleme kurulsun mu?', okLabel: 'Güncelle' }))) return;
  await window.api.updates.download();
}

export async function checkNow() {
  try {
    const r = await window.api.updates.check();
    if (r.message) toast(r.message, 'success');
  } catch (err) {
    toast(err.message, 'error', 6000);
  }
}

function renderBanner() {
  let el = document.getElementById('update-banner');
  if (!el) {
    el = h('div', { id: 'update-banner' });
    document.getElementById('titlebar').after(el);
  }
  const s = update.state;
  el.className = '';
  if (s.status === 'available' && dismissed !== s.version) {
    el.className = 'show';
    el.replaceChildren(
      icon('download', 17),
      h('span', { class: 'grow' }, h('b', null, `Yeni sürüm ${s.version} hazır.`), update.manual
        ? " Yeni kurulum dosyasını indirip Termify'yi Uygulamalar klasörüne sürükleyin. Verileriniz korunur."
        : ' Güncelleme yaklaşık bir dakika sürer; Termify kapanıp yeniden açılır.' + (window.api.platform === 'linux' ? ' Kurulum için parolanız istenebilir.' : '') + ' Verileriniz korunur.'),
      h('button', { class: 'btn sm light', onclick: startUpdate }, update.manual ? 'İndir' : 'Şimdi güncelle'),
      h('button', { class: 'btn sm ghost-light', title: 'Sonra hatırlat', onclick: () => { dismissed = s.version; renderBanner(); } }, 'Sonra'));
  } else if (s.status === 'downloading') {
    el.className = 'show';
    el.replaceChildren(
      icon('download', 17),
      h('span', { class: 'grow' }, h('b', null, `Sürüm ${s.version} indiriliyor…`)),
      h('span', { class: 'ubar' }, h('span', { style: { width: s.percent + '%' } })),
      h('span', { class: 'upct' }, `%${s.percent}`));
  } else if (s.status === 'installing') {
    el.className = 'show green';
    el.replaceChildren(
      icon('refresh', 17),
      h('span', { class: 'grow' }, h('b', null, `Sürüm ${s.version} kuruluyor, Termify birkaç saniye içinde yeniden açılacak…`)));
  } else {
    el.replaceChildren();
  }
}

// Ayarlar ekranındaki "Güncellemeler" kartının durum metni
export function statusText() {
  const s = update.state;
  return {
    dev: 'Geliştirme modunda çalışıyor; güncelleme yalnızca kurulu uygulamada denetlenir.',
    idle: 'Güncellemeler otomatik olarak denetlenir.',
    checking: 'Denetleniyor…',
    none: 'Termify güncel.',
    available: `Yeni sürüm ${s.version} hazır.`,
    downloading: `Sürüm ${s.version} indiriliyor… %${s.percent}`,
    installing: `Sürüm ${s.version} kuruluyor…`,
    error: s.message,
  }[s.status] || '';
}
