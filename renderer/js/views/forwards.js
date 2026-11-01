// Port yönlendirme kuralları: yerel, uzak ve dinamik (SOCKS) tüneller.
import { h, icon, iconBtn, toast, confirmDialog, formDialog, contextMenu } from '../ui.js';
import { store, save, remove, getHost, hostLabel } from '../state.js';

const TYPES = {
  local: { label: 'Yerel', desc: 'Bilgisayarınızdaki bir porta gelen bağlantıları sunucu üzerinden hedefe iletir (ssh -L). Örn. uzak MySQL\'e 127.0.0.1:3306 ile bağlanmak.' },
  remote: { label: 'Uzak', desc: 'Sunucudaki bir porta gelen bağlantıları bilgisayarınızdaki bir hedefe iletir (ssh -R). Örn. yerel geliştirme sunucunuzu dışarı açmak.' },
  dynamic: { label: 'Dinamik', desc: 'Bilgisayarınızda bir SOCKS5 proxy açar; tarayıcı trafiğini sunucu üzerinden geçirir (ssh -D).' },
};

export function describeRule(r) {
  const bind = `${r.bindAddress || '127.0.0.1'}:${r.bindPort}`;
  if (r.type === 'dynamic') return `SOCKS5 proxy → ${bind}`;
  if (r.type === 'remote') return `sunucu ${bind} → bu bilgisayar ${r.destHost}:${r.destPort}`;
  return `${bind} → ${r.destHost}:${r.destPort}`;
}

export function renderForwards(header, body) {
  header.append(
    h('h1', null, 'Port Yönlendirme'),
    h('button', { class: 'btn primary', onclick: () => editRule() }, icon('plus', 15), 'Yeni kural'));

  const rules = store.data.forwards;
  if (!rules.length) {
    body.append(h('div', { class: 'empty' },
      icon('forward', 32),
      h('h3', null, 'Port yönlendirme kuralı yok'),
      h('p', null, 'SSH tünelleriyle uzak veritabanlarına, iç ağ servislerine güvenli şekilde erişin.'),
      h('button', { class: 'btn primary', onclick: () => editRule() }, icon('plus', 15), 'İlk kuralı ekle')));
    return;
  }
  body.append(h('div', { class: 'list' }, rules.map(ruleItem)));
}

function ruleItem(r) {
  const st = store.forwardStatus[r.id] || { state: 'stopped' };
  const host = getHost(r.hostId);
  const running = st.state === 'active' || st.state === 'connecting';
  const stateText = { active: 'Çalışıyor', connecting: 'Bağlanıyor…', error: 'Hata', stopped: 'Durduruldu' }[st.state];
  const toggle = async () => {
    try {
      if (running) await window.api.forward.stop(r.id);
      else {
        await window.api.forward.start(r.id);
        toast(`Tünel açıldı: ${describeRule(r)}`, 'success');
      }
    } catch (err) {
      toast('Tünel açılamadı: ' + err.message, 'error', 6000);
    }
  };
  const menu = (x, y) => contextMenu(x, y, [
    { label: running ? 'Durdur' : 'Başlat', icon: running ? 'stop' : 'play', onClick: toggle },
    { label: 'Düzenle', icon: 'edit', onClick: () => editRule(r) },
    '-',
    { label: 'Sil', icon: 'trash', danger: true, onClick: async () => {
      if (await confirmDialog(`"${r.label || describeRule(r)}" kuralı silinecek.`, { okLabel: 'Sil', danger: true })) await remove('forwards', r.id);
    } },
  ]);
  return h('div', { class: 'list-item', oncontextmenu: (e) => { e.preventDefault(); menu(e.clientX, e.clientY); } },
    h('span', { class: `dot ${st.state}`, title: stateText }),
    h('div', { class: 'grow' },
      h('div', { style: { fontWeight: 600, display: 'flex', gap: '8px', alignItems: 'center' } },
        r.label || describeRule(r), h('span', { class: `badge ${r.type}` }, TYPES[r.type].label)),
      h('div', { class: 'mono muted ellipsis' }, `${describeRule(r)}  ·  üzerinden: ${host ? hostLabel(host) : 'silinmiş host'}`),
      st.state === 'error' && st.error ? h('div', { style: { color: 'var(--danger)', fontSize: '12px' } }, st.error) : null),
    h('span', { class: 'muted', style: { fontSize: '12px', width: '90px', textAlign: 'right' } }, stateText),
    h('button', { class: `btn sm ${running ? '' : 'primary'}`, onclick: toggle }, icon(running ? 'stop' : 'play', 13), running ? 'Durdur' : 'Başlat'),
    iconBtn('edit', 'Düzenle', () => editRule(r), 'btn ghost sm icon-btn'),
    iconBtn('more', 'Diğer', (e) => { const b = e.currentTarget.getBoundingClientRect(); menu(b.left - 150, b.bottom + 4); }, 'btn ghost sm icon-btn'));
}

export async function editRule(rule = null) {
  const hosts = store.data.hosts;
  if (!hosts.length) return toast('Önce bir host ekleyin; tünel bir SSH sunucusu üzerinden açılır', 'error');
  const info = h('div', { class: 'info-box' }, TYPES[rule?.type || 'local'].desc);
  const v = await formDialog({
    title: rule ? 'Kuralı düzenle' : 'Yeni port yönlendirme kuralı',
    intro: info,
    fields: [
      { name: 'label', label: 'Etiket', value: rule?.label, placeholder: 'Üretim veritabanı' },
      [{ name: 'type', label: 'Tür', type: 'select', value: rule?.type || 'local', options: Object.entries(TYPES).map(([value, t]) => ({ value, label: t.label })) },
        { name: 'hostId', label: 'SSH sunucusu', type: 'select', value: rule?.hostId, options: hosts.map((x) => ({ value: x.id, label: hostLabel(x) })) }],
      [{ name: 'bindAddress', label: 'Dinlenecek adres', value: rule?.bindAddress || '127.0.0.1' },
        { name: 'bindPort', label: 'Dinlenecek port', type: 'number', value: rule?.bindPort, placeholder: '8080', required: true }],
      [{ name: 'destHost', label: 'Hedef adres', value: rule?.destHost || '127.0.0.1', showIf: (x) => x.type !== 'dynamic', required: true },
        { name: 'destPort', label: 'Hedef port', type: 'number', value: rule?.destPort, placeholder: '3306', showIf: (x) => x.type !== 'dynamic', required: true }],
    ],
    validate: (x) => {
      const ports = x.type === 'dynamic' ? [x.bindPort] : [x.bindPort, x.destPort];
      if (ports.some((p) => !(Number(p) >= 1 && Number(p) <= 65535))) return 'Portlar 1 ile 65535 arasında olmalı';
      return null;
    },
    onSubmit: async (x) => {
      const wasActive = rule && store.forwardStatus[rule.id]?.state === 'active';
      if (wasActive) await window.api.forward.stop(rule.id);
      const saved = await save('forwards', {
        ...(rule || {}),
        label: x.label.trim(),
        type: x.type,
        hostId: x.hostId,
        bindAddress: x.bindAddress.trim() || '127.0.0.1',
        bindPort: Number(x.bindPort),
        destHost: x.type === 'dynamic' ? '' : x.destHost.trim(),
        destPort: x.type === 'dynamic' ? 0 : Number(x.destPort),
      });
      if (wasActive) window.api.forward.start(saved.id).catch((e) => toast(e.message, 'error'));
    },
  });
  return v;
}

// Form açıkken tür açıklamasını canlı güncelle
document.addEventListener('change', (e) => {
  if (e.target.tagName !== 'SELECT') return;
  const modalEl = e.target.closest('.modal');
  const box = modalEl && modalEl.querySelector('.info-box');
  if (box && TYPES[e.target.value]) box.textContent = TYPES[e.target.value].desc;
});
