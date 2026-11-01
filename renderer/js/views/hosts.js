// Hostlar ekranı: hızlı bağlan, gruplar, arama, host kartları.
import { h, icon, iconBtn, toast, modal, confirmDialog, formDialog, contextMenu, avatar, copyText, COLORS } from '../ui.js';
import { store, save, remove, hostLabel, hostAddress, parseQuick } from '../state.js';
import { openTerminal } from '../terminal.js';
import { openSftp } from '../sftp.js';

const COLOR_NAMES = ['Mavi', 'Yeşil', 'Sarı', 'Kırmızı', 'Mor', 'Turkuaz', 'Pembe', 'Gri'];
const ui = { group: null, query: '' };

export function renderHosts(header, body) {
  const hosts = store.data.hosts;
  const search = h('input', { class: 'input', placeholder: 'Hostlarda ara…', value: ui.query, spellcheck: 'false' });
  search.addEventListener('input', () => {
    ui.query = search.value;
    drawList();
  });
  header.append(
    h('h1', null, 'Hostlar'),
    h('div', { class: 'search' }, icon('search', 15), search),
    h('button', { class: 'btn primary', onclick: () => editHost() }, icon('plus', 15), 'Yeni host'));

  const quick = h('input', { class: 'input', placeholder: 'Hızlı bağlan: kullanıcı@sunucu:port  (ör. root@192.168.1.10)', spellcheck: 'false' });
  const quickGo = (sftp) => {
    const ref = parseQuick(quick.value);
    if (!ref) return toast('Geçersiz adres. Örnek: root@192.168.1.10:22', 'error');
    sftp ? openSftp(ref) : openTerminal(ref);
    quick.value = '';
  };
  quick.addEventListener('keydown', (e) => e.key === 'Enter' && quickGo(false));
  body.append(h('div', { class: 'quick' },
    h('span', { class: 'muted', style: { display: 'grid', paddingLeft: '6px' } }, icon('bolt', 16)),
    quick,
    h('button', { class: 'btn ghost', onclick: () => quickGo(true) }, icon('folder', 15), 'SFTP'),
    h('button', { class: 'btn primary', onclick: () => quickGo(false) }, icon('terminal', 15), 'Bağlan')));

  const groups = [...new Set(hosts.map((x) => x.group).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
  if (ui.group && !groups.includes(ui.group)) ui.group = null;
  const chips = h('div', { class: 'chips' });
  const drawChips = () => {
    chips.replaceChildren(
      h('button', { class: `chip ${ui.group === null ? 'active' : ''}`, onclick: () => { ui.group = null; drawChips(); drawList(); } }, `Tümü (${hosts.length})`),
      ...groups.map((g) => h('button', { class: `chip ${ui.group === g ? 'active' : ''}`, onclick: () => { ui.group = g; drawChips(); drawList(); } },
        `${g} (${hosts.filter((x) => x.group === g).length})`)));
  };
  if (groups.length) {
    drawChips();
    body.append(chips);
  }

  const listEl = h('div');
  body.append(listEl);

  function drawList() {
    listEl.replaceChildren();
    if (!hosts.length) {
      listEl.append(h('div', { class: 'empty' },
        icon('server', 32),
        h('h3', null, 'Henüz host eklemediniz'),
        h('p', null, 'Sunucularınızı kaydedin, tek tıkla bağlanın. Ya da yukarıdaki hızlı bağlan kutusunu kullanın.'),
        h('button', { class: 'btn primary', onclick: () => editHost() }, icon('plus', 15), 'İlk hostu ekle')));
      return;
    }
    const q = ui.query.trim().toLocaleLowerCase('tr-TR');
    const match = (x) => !q || [x.label, x.host, x.username, x.group, ...(x.tags || [])].some((v) => v && String(v).toLocaleLowerCase('tr-TR').includes(q));
    const filtered = hosts.filter((x) => (ui.group === null || x.group === ui.group) && match(x));
    if (!filtered.length) {
      listEl.append(h('p', { class: 'muted', style: { marginTop: '20px' } }, 'Aramayla eşleşen host yok.'));
      return;
    }
    const byGroup = new Map();
    for (const x of filtered) {
      const g = x.group || '';
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g).push(x);
    }
    const keys = [...byGroup.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'tr')));
    for (const g of keys) {
      listEl.append(h('div', { class: 'section-title' }, g || (groups.length ? 'Grupsuz' : 'Tüm hostlar')));
      listEl.append(h('div', { class: 'grid' }, byGroup.get(g).sort((a, b) => hostLabel(a).localeCompare(hostLabel(b), 'tr')).map(hostCard)));
    }
  }
  drawList();
}

function hostCard(x) {
  const menu = (cx, cy) => contextMenu(cx, cy, [
    { label: 'Terminalde bağlan', icon: 'terminal', onClick: () => openTerminal({ id: x.id }) },
    { label: 'SFTP aç', icon: 'folder', onClick: () => openSftp({ id: x.id }) },
    '-',
    { label: 'Düzenle', icon: 'edit', onClick: () => editHost(x) },
    { label: 'Çoğalt', icon: 'copy', onClick: () => { const { id, ...rest } = x; save('hosts', { ...rest, label: hostLabel(x) + ' (kopya)' }); } },
    { label: 'Adresi kopyala', icon: 'link', onClick: () => copyText(`ssh ${x.username}@${x.host}${Number(x.port) !== 22 ? ' -p ' + x.port : ''}`) },
    '-',
    { label: 'Sil', icon: 'trash', danger: true, onClick: () => deleteHost(x) },
  ]);
  return h('div', {
    class: 'card',
    title: 'Bağlanmak için çift tıklayın',
    ondblclick: () => openTerminal({ id: x.id }),
    oncontextmenu: (e) => { e.preventDefault(); menu(e.clientX, e.clientY); },
  },
    avatar(hostLabel(x), x.color),
    h('div', { class: 'card-main' },
      h('div', { class: 'card-title' }, hostLabel(x)),
      h('div', { class: 'card-sub' }, hostAddress(x)),
      (x.tags && x.tags.length) || x.jumpHostId || x.authType === 'key'
        ? h('div', { class: 'tags' },
          x.authType === 'key' ? h('span', { class: 'tag' }, 'anahtar') : null,
          x.jumpHostId ? h('span', { class: 'tag' }, 'atlamalı') : null,
          (x.tags || []).map((t) => h('span', { class: 'tag' }, t)))
        : null),
    h('div', { class: 'card-actions' },
      iconBtn('terminal', 'Terminal', () => openTerminal({ id: x.id }), 'btn ghost sm icon-btn'),
      iconBtn('folder', 'SFTP', () => openSftp({ id: x.id }), 'btn ghost sm icon-btn'),
      iconBtn('more', 'Diğer', (e) => { const r = e.currentTarget.getBoundingClientRect(); menu(r.left, r.bottom + 4); }, 'btn ghost sm icon-btn')));
}

async function deleteHost(x) {
  const users = store.data.hosts.filter((o) => o.jumpHostId === x.id);
  const fwd = store.data.forwards.filter((f) => f.hostId === x.id);
  let msg = `"${hostLabel(x)}" silinecek.`;
  if (users.length) msg += `\n${users.length} host bunu atlama sunucusu olarak kullanıyor; bu ayar kaldırılacak.`;
  if (fwd.length) msg += `\n${fwd.length} port yönlendirme kuralı da silinecek.`;
  if (!(await confirmDialog(msg, { title: 'Host silinsin mi?', okLabel: 'Sil', danger: true }))) return;
  for (const u of users) await save('hosts', { ...u, jumpHostId: '' });
  for (const f of fwd) await remove('forwards', f.id);
  await remove('hosts', x.id);
  toast('Host silindi', 'success', 2000);
}

export async function editHost(host = null) {
  const hosts = store.data.hosts;
  const keys = store.data.keys;
  const groups = [...new Set(hosts.map((x) => x.group).filter(Boolean))];
  const v = await formDialog({
    title: host ? 'Hostu düzenle' : 'Yeni host',
    submitLabel: host ? 'Kaydet' : 'Ekle',
    fields: [
      [{ name: 'label', label: 'Etiket', value: host?.label, placeholder: 'Web sunucum' },
        { name: 'group', label: 'Grup', value: host?.group, placeholder: 'Üretim', list: groups }],
      [{ name: 'host', label: 'Adres (IP veya alan adı)', value: host?.host, placeholder: '192.168.1.10', required: true },
        { name: 'port', label: 'Port', type: 'number', value: host?.port ?? 22 }],
      { name: 'username', label: 'Kullanıcı adı', value: host?.username ?? 'root', required: true },
      { name: 'authType', label: 'Kimlik doğrulama', type: 'select', value: host?.authType || 'password', options: [{ value: 'password', label: 'Parola' }, { value: 'key', label: 'SSH anahtarı' }] },
      { name: 'password', label: 'Parola', type: 'password', value: host?.password, hint: 'Boş bırakırsanız her bağlantıda sorulur. Parola şifreli kasada saklanır.', showIf: (x) => x.authType === 'password' },
      { name: 'keyId', label: 'SSH anahtarı', type: 'select', value: host?.keyId, showIf: (x) => x.authType === 'key',
        options: keys.length ? keys.map((k) => ({ value: k.id, label: `${k.name} (${k.type})` })) : [{ value: '', label: "— Önce Anahtarlar bölümünden anahtar ekleyin —" }] },
      { name: 'jumpHostId', label: 'Atlama sunucusu (isteğe bağlı)', type: 'select', value: host?.jumpHostId || '',
        options: [{ value: '', label: 'Yok (doğrudan bağlan)' }, ...hosts.filter((x) => !host || x.id !== host.id).map((x) => ({ value: x.id, label: hostLabel(x) }))],
        hint: 'Bu sunucuya önce seçilen sunucu üzerinden bağlanılır (ProxyJump).' },
      { name: 'startupCommand', label: 'Başlangıç komutu (isteğe bağlı)', value: host?.startupCommand, placeholder: 'cd /var/www && ls -la' },
      [{ name: 'tags', label: 'Etiketler', value: (host?.tags || []).join(', '), placeholder: 'web, nginx' },
        { name: 'color', label: 'Renk', type: 'select', value: host?.color || COLORS[0], options: COLORS.map((c, i) => ({ value: c, label: COLOR_NAMES[i] })) }],
    ],
    validate: (x) => {
      const p = Number(x.port);
      if (!Number.isInteger(p) || p < 1 || p > 65535) return 'Port 1 ile 65535 arasında olmalı';
      if (x.authType === 'key' && !x.keyId) return 'Bir SSH anahtarı seçin (yoksa önce Anahtarlar bölümünden oluşturun)';
      return null;
    },
    onSubmit: async (x) => {
      await save('hosts', {
        ...(host || {}),
        label: x.label.trim(),
        group: x.group.trim(),
        host: x.host.trim(),
        port: Number(x.port),
        username: x.username.trim(),
        authType: x.authType,
        password: x.authType === 'password' ? x.password : host?.password || '',
        keyId: x.authType === 'key' ? x.keyId : '',
        jumpHostId: x.jumpHostId,
        startupCommand: x.startupCommand.trim(),
        tags: x.tags.split(',').map((t) => t.trim()).filter(Boolean),
        color: x.color,
      });
    },
  });
  if (v) toast(host ? 'Host güncellendi' : 'Host eklendi', 'success', 2000);
}

// Kayıtlı hostlardan birini seçtirir
export function pickHost(title = 'Host seçin') {
  return new Promise((resolve) => {
    const hosts = store.data.hosts;
    let result = null;
    const m = modal({
      title,
      onClose: () => resolve(result),
      body: hosts.length
        ? h('div', { class: 'list' }, hosts.map((x) => h('div', { class: 'card', onclick: () => { result = x; m.close(); } },
          avatar(hostLabel(x), x.color),
          h('div', { class: 'card-main' }, h('div', { class: 'card-title' }, hostLabel(x)), h('div', { class: 'card-sub' }, hostAddress(x))))))
        : h('p', null, 'Kayıtlı host yok. Önce Hostlar bölümünden bir host ekleyin.'),
    });
  });
}
