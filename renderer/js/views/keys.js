// Anahtarlar (Keychain): SSH anahtarı oluşturma, içe aktarma, sunucuya yükleme.
import { h, icon, iconBtn, toast, confirmDialog, promptDialog, formDialog, contextMenu, copyText } from '../ui.js';
import { store, save, remove, hostLabel } from '../state.js';
import { pickHost } from './hosts.js';

export function renderKeys(header, body) {
  header.append(
    h('h1', null, 'Anahtarlar'),
    h('button', { class: 'btn', onclick: importKey }, icon('download', 15), 'İçe aktar'),
    h('button', { class: 'btn primary', onclick: generateKey }, icon('plus', 15), 'Anahtar oluştur'));

  const keys = store.data.keys;
  if (!keys.length) {
    body.append(h('div', { class: 'empty' },
      icon('key', 32),
      h('h3', null, 'SSH anahtarı yok'),
      h('p', null, 'Parola yerine anahtarla giriş daha güvenlidir. Yeni bir Ed25519 anahtarı oluşturun veya mevcut anahtarınızı içe aktarın.'),
      h('div', { style: { display: 'flex', gap: '8px', justifyContent: 'center' } },
        h('button', { class: 'btn', onclick: importKey }, 'İçe aktar'),
        h('button', { class: 'btn primary', onclick: generateKey }, 'Anahtar oluştur'))));
    return;
  }
  body.append(h('div', { class: 'list' }, keys.map(keyItem)));
}

function keyItem(k) {
  const used = store.data.hosts.filter((x) => x.authType === 'key' && x.keyId === k.id);
  const menu = (x, y) => contextMenu(x, y, [
    { label: 'Genel anahtarı kopyala', icon: 'copy', onClick: () => copyText(k.public, 'Genel anahtar kopyalandı') },
    { label: 'Sunucuya yükle…', icon: 'upload', onClick: () => installKey(k) },
    '-',
    { label: 'Yeniden adlandır', icon: 'edit', onClick: async () => {
      const name = await promptDialog({ title: 'Yeniden adlandır', value: k.name });
      if (name) await save('keys', { ...k, name });
    } },
    { label: 'Genel anahtarı dosyaya kaydet', icon: 'download', onClick: () => window.api.keys.saveFile(`${slug(k.name)}.pub`, k.public + '\n') },
    { label: 'Özel anahtarı dosyaya kaydet', icon: 'download', onClick: () => window.api.keys.saveFile(slug(k.name), k.private) },
    '-',
    { label: 'Sil', icon: 'trash', danger: true, onClick: async () => {
      const msg = used.length ? `"${k.name}" silinecek. Bu anahtarı ${used.length} host kullanıyor: ${used.map(hostLabel).join(', ')}. Bu hostlar parolaya geçirilecek.` : `"${k.name}" silinecek. Bu işlem geri alınamaz.`;
      if (!(await confirmDialog(msg, { title: 'Anahtar silinsin mi?', okLabel: 'Sil', danger: true }))) return;
      for (const x of used) await save('hosts', { ...x, authType: 'password', keyId: '' });
      await remove('keys', k.id);
    } },
  ]);
  return h('div', { class: 'list-item', oncontextmenu: (e) => { e.preventDefault(); menu(e.clientX, e.clientY); } },
    h('div', { class: 'icon-box' }, icon('key', 18)),
    h('div', { class: 'grow' },
      h('div', { style: { fontWeight: 600 } }, k.name, ' ', h('span', { class: 'badge' }, k.type)),
      h('div', { class: 'mono muted ellipsis' }, k.fingerprint),
      used.length ? h('div', { class: 'muted', style: { fontSize: '12px' } }, `Kullanan: ${used.map(hostLabel).join(', ')}`) : null),
    h('button', { class: 'btn sm', onclick: () => copyText(k.public, 'Genel anahtar kopyalandı') }, icon('copy', 14), 'Genel anahtar'),
    h('button', { class: 'btn sm', onclick: () => installKey(k) }, icon('upload', 14), 'Sunucuya yükle'),
    iconBtn('more', 'Diğer', (e) => { const r = e.currentTarget.getBoundingClientRect(); menu(r.left - 150, r.bottom + 4); }, 'btn ghost sm icon-btn'));
}

const slug = (s) => s.replace(/[^\w.-]+/g, '_') || 'anahtar';

async function installKey(k) {
  const host = await pickHost(`"${k.name}" anahtarını hangi sunucuya yükleyelim?`);
  if (!host) return;
  toast(`${hostLabel(host)} sunucusuna yükleniyor…`, 'info', 2000);
  try {
    await window.api.keys.install(host.id, k.id);
    toast(`Anahtar ${hostLabel(host)} sunucusundaki ~/.ssh/authorized_keys dosyasına eklendi`, 'success', 5000);
    if (host.authType !== 'key' && (await confirmDialog(`"${hostLabel(host)}" hostu artık bu anahtarla bağlansın mı?`, { title: 'Hostu güncelle', okLabel: 'Evet, anahtara geç' }))) {
      await save('hosts', { ...host, authType: 'key', keyId: k.id });
    }
  } catch (err) {
    toast('Yüklenemedi: ' + err.message, 'error', 6000);
  }
}

async function generateKey() {
  const v = await formDialog({
    title: 'Yeni SSH anahtarı oluştur',
    submitLabel: 'Oluştur',
    fields: [
      { name: 'name', label: 'Ad', required: true, placeholder: 'Kişisel anahtarım', value: 'Anahtar ' + (store.data.keys.length + 1) },
      [{ name: 'type', label: 'Tür', type: 'select', value: 'ed25519', options: [{ value: 'ed25519', label: 'Ed25519 (önerilen)' }, { value: 'rsa', label: 'RSA' }, { value: 'ecdsa', label: 'ECDSA' }] },
        { name: 'bits', label: 'Uzunluk', type: 'select', value: '4096', options: ['2048', '3072', '4096'].map((b) => ({ value: b, label: b + ' bit' })), showIf: (x) => x.type === 'rsa' }],
      { name: 'comment', label: 'Yorum', placeholder: 'kullanici@bilgisayar', value: 'termify' },
      { name: 'passphrase', label: 'Anahtar parolası (isteğe bağlı)', type: 'password', hint: 'Anahtar dosyası dışa aktarıldığında bu parolayla korunur. Kasada saklanır, bağlanırken sorulmaz.' },
    ],
    onSubmit: async (x) => {
      const k = await window.api.keys.generate({ type: x.type, bits: x.bits, comment: x.comment.trim(), passphrase: x.passphrase });
      await save('keys', { name: x.name.trim(), ...k, passphrase: x.passphrase, createdAt: Date.now() });
    },
  });
  if (v) toast('Anahtar oluşturuldu. "Sunucuya yükle" ile sunucularınıza ekleyebilirsiniz.', 'success', 4500);
}

async function importKey() {
  const fileBtn = h('button', { type: 'button', class: 'btn sm', onclick: async () => {
    try {
      const f = await window.api.keys.readFile();
      if (!f) return;
      const modalEl = fileBtn.closest('.modal');
      modalEl.querySelector('textarea').value = f.content;
      const nameInput = modalEl.querySelector('input');
      if (!nameInput.value) nameInput.value = f.name;
    } catch (err) {
      toast(err.message, 'error');
    }
  } }, icon('file', 14), 'Dosyadan seç (ör. ~/.ssh/id_ed25519)');
  const v = await formDialog({
    title: 'SSH anahtarını içe aktar',
    submitLabel: 'İçe aktar',
    intro: h('div', { style: { marginBottom: '12px' } }, fileBtn),
    fields: [
      { name: 'name', label: 'Ad', required: true, placeholder: 'id_ed25519' },
      { name: 'private', label: 'Özel anahtar', type: 'textarea', rows: 8, required: true, placeholder: '-----BEGIN OPENSSH PRIVATE KEY-----\n…' },
      { name: 'passphrase', label: 'Anahtar parolası (varsa)', type: 'password' },
    ],
    onSubmit: async (x) => {
      const priv = x.private.trim() + '\n';
      const info = await window.api.keys.describe(priv, x.passphrase);
      await save('keys', { name: x.name.trim(), private: priv, ...info, passphrase: x.passphrase, createdAt: Date.now() });
    },
  });
  if (v) toast('Anahtar içe aktarıldı', 'success', 2000);
}
