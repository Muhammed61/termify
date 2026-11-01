// Snippet'ler: sık kullanılan komutlar.
import { h, icon, iconBtn, toast, confirmDialog, formDialog, contextMenu, copyText } from '../ui.js';
import { store, save, remove } from '../state.js';
import { runSnippet } from '../terminal.js';
import { pickHost } from './hosts.js';

const ui = { query: '' };

export function renderSnippets(header, body) {
  const search = h('input', { class: 'input', placeholder: "Snippet'lerde ara…", value: ui.query, spellcheck: 'false' });
  header.append(
    h('h1', null, "Snippet'ler"),
    h('div', { class: 'search' }, icon('search', 15), search),
    h('button', { class: 'btn primary', onclick: () => editSnippet() }, icon('plus', 15), 'Yeni snippet'));

  const all = store.data.snippets;
  if (!all.length) {
    body.append(h('div', { class: 'empty' },
      icon('snippet', 32),
      h('h3', null, 'Henüz snippet yok'),
      h('p', null, 'Sık kullandığınız komutları kaydedin, terminalde tek tıkla çalıştırın.'),
      h('button', { class: 'btn primary', onclick: () => editSnippet() }, icon('plus', 15), 'İlk snippet\'i ekle')));
    return;
  }
  const listEl = h('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' } });
  body.append(listEl);
  const draw = () => {
    const q = ui.query.trim().toLocaleLowerCase('tr-TR');
    const items = all.filter((s) => !q || [s.name, s.command, ...(s.tags || [])].some((v) => v && v.toLocaleLowerCase('tr-TR').includes(q)));
    listEl.replaceChildren(...items.map(snippetCard));
  };
  search.addEventListener('input', () => {
    ui.query = search.value;
    draw();
  });
  draw();
}

function snippetCard(s) {
  const run = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    runSnippet(s, r.left, r.bottom + 4, () => pickHost('Snippet hangi hostta çalışsın?'));
  };
  const menu = (x, y) => contextMenu(x, y, [
    { label: 'Komutu kopyala', icon: 'copy', onClick: () => copyText(s.command) },
    { label: 'Düzenle', icon: 'edit', onClick: () => editSnippet(s) },
    '-',
    { label: 'Sil', icon: 'trash', danger: true, onClick: async () => {
      if (await confirmDialog(`"${s.name}" silinecek.`, { okLabel: 'Sil', danger: true })) await remove('snippets', s.id);
    } },
  ]);
  return h('div', { class: 'card', style: { alignItems: 'flex-start', cursor: 'default' }, oncontextmenu: (e) => { e.preventDefault(); menu(e.clientX, e.clientY); } },
    h('div', { class: 'card-main' },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
        h('div', { class: 'card-title', style: { flex: 1 } }, s.name),
        s.autoRun ? h('span', { class: 'tag', title: 'Gönderildiğinde Enter ile çalıştırılır' }, 'otomatik') : null,
        h('button', { class: 'btn sm primary', onclick: run }, icon('play', 12), 'Çalıştır'),
        iconBtn('more', 'Diğer', (e) => { const r = e.currentTarget.getBoundingClientRect(); menu(r.left - 150, r.bottom + 4); }, 'btn ghost sm icon-btn')),
      h('pre', { class: 'code' }, s.command),
      s.tags && s.tags.length ? h('div', { class: 'tags' }, s.tags.map((t) => h('span', { class: 'tag' }, t))) : null));
}

export async function editSnippet(s = null) {
  const v = await formDialog({
    title: s ? "Snippet'i düzenle" : 'Yeni snippet',
    fields: [
      { name: 'name', label: 'Ad', value: s?.name, required: true, placeholder: 'Disk kullanımı' },
      { name: 'command', label: 'Komut', type: 'textarea', rows: 6, value: s?.command, required: true, placeholder: 'df -h && free -m', hint: 'Birden fazla satır yazabilirsiniz; her satır ayrı komut olarak gönderilir.' },
      { name: 'tags', label: 'Etiketler', value: (s?.tags || []).join(', '), placeholder: 'sistem, izleme' },
      { name: 'autoRun', label: 'Gönderince otomatik çalıştır (Enter bas)', type: 'checkbox', value: s ? s.autoRun : true },
    ],
    onSubmit: async (x) => {
      await save('snippets', { ...(s || {}), name: x.name.trim(), command: x.command, tags: x.tags.split(',').map((t) => t.trim()).filter(Boolean), autoRun: x.autoRun });
    },
  });
  if (v) toast(s ? 'Snippet güncellendi' : 'Snippet eklendi', 'success', 2000);
}
