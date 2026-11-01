// Ortak arayüz yardımcıları: DOM oluşturma, simgeler, modal, menü, bildirim.

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : String(c));
  }
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

const ICONS = {
  server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 8.2-8.2M17 6l2 2M15 8l2 2"/>',
  forward: '<path d="M4 12h12M12 6l6 6-6 6"/><path d="M20 5v14"/>',
  snippet: '<path d="m8 9-3 3 3 3M16 9l3 3-3 3M13.5 6l-3 12"/>',
  shield: '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  terminal: '<path d="m5 8 4 4-4 4M12 16h7"/><rect x="2" y="3" width="20" height="18" rx="3"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"/><path d="M14 3v5h5"/>',
  link: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  more: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
  play: '<path d="M7 4v16l13-8Z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  folderPlus: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/><path d="M12 10v6M9 13h6"/>',
  upload: '<path d="M12 16V4M6 10l6-6 6 6"/><path d="M4 20h16"/>',
  download: '<path d="M12 4v12M6 10l6 6 6-6"/><path d="M4 20h16"/>',
  splitV: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/>',
  splitH: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 12h18"/>',
  broadcast: '<circle cx="12" cy="12" r="2"/><path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19 5a10 10 0 0 1 0 14M5 19A10 10 0 0 1 5 5"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
  monitor: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  alert: '<path d="M12 3 2 21h20L12 3Z"/><path d="M12 10v4M12 18h.01"/>',
  cloud: '<path d="M7 18a5 5 0 0 1-.5-10A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9Z"/>',
};

export function icon(name, size = 16) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.innerHTML = ICONS[name] || '';
  return svg;
}

export function iconBtn(name, title, onClick, cls = 'btn ghost icon-btn') {
  return h('button', { type: 'button', class: cls, title, onclick: (e) => { e.stopPropagation(); onClick(e); } }, icon(name));
}

// ---------- Bildirim ----------
export function toast(message, type = 'info', ms = 3500) {
  const el = h('div', { class: `toast ${type}` }, message);
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), ms);
}

// ---------- Modal ----------
export function modal({ title, body, actions = [], wide = false, onClose }) {
  const close = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey, true);
    if (onClose) onClose();
  };
  const foot = h('div', { class: 'modal-foot' });
  for (const a of actions) {
    foot.append(h('button', {
      class: `btn ${a.primary ? 'primary' : ''} ${a.danger ? 'danger solid' : ''}`,
      type: a.submit ? 'submit' : 'button',
      onclick: a.submit ? null : () => a.onClick(close),
    }, a.label));
  }
  const box = h('form', { class: `modal ${wide ? 'wide' : ''}`, onsubmit: (e) => {
    e.preventDefault();
    const s = actions.find((a) => a.submit);
    if (s) s.onClick(close);
  } },
    h('div', { class: 'modal-head' }, h('h2', null, title), iconBtn('x', 'Kapat', () => close())),
    h('div', { class: 'modal-body' }, body),
    actions.length ? foot : null);
  const backdrop = h('div', { class: 'backdrop', onmousedown: (e) => { if (e.target === backdrop) close(); } }, box);
  const onKey = (e) => {
    if (e.key === 'Escape' && document.querySelector('.backdrop:last-of-type') === backdrop) {
      e.stopPropagation();
      close();
    }
  };
  document.addEventListener('keydown', onKey, true);
  document.getElementById('overlays').append(backdrop);
  setTimeout(() => {
    const f = box.querySelector('[autofocus]') || box.querySelector('input:not([type=checkbox]), textarea, select');
    if (f) f.focus();
  }, 30);
  return { close, el: box };
}

export function confirmDialog(message, { title = 'Emin misiniz?', okLabel = 'Evet', danger = false } = {}) {
  return new Promise((resolve) => {
    let result = false;
    modal({
      title,
      body: h('p', null, message),
      onClose: () => resolve(result),
      actions: [
        { label: 'Vazgeç', onClick: (close) => close() },
        { label: okLabel, primary: !danger, danger, submit: true, onClick: (close) => { result = true; close(); } },
      ],
    });
  });
}

export function promptDialog({ title, message, value = '', secret = false, placeholder = '', okLabel = 'Tamam' }) {
  return new Promise((resolve) => {
    let result = null;
    const input = secret ? passwordInput({ value, placeholder, autofocus: true }) : h('input', { class: 'input', value, placeholder, autofocus: true });
    const field = secret ? input.querySelector('input') : input;
    modal({
      title,
      body: [message ? h('p', null, message) : null, input],
      onClose: () => resolve(result),
      actions: [
        { label: 'Vazgeç', onClick: (close) => close() },
        { label: okLabel, primary: true, submit: true, onClick: (close) => { result = field.value; close(); } },
      ],
    });
    if (!secret) setTimeout(() => field.select(), 40);
  });
}

export function passwordInput(attrs = {}) {
  const input = h('input', { class: 'input', type: 'password', autocomplete: 'off', ...attrs });
  const toggle = h('button', { type: 'button', class: 'btn ghost sm icon-btn', title: 'Göster/gizle', onclick: () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    toggle.replaceChildren(icon(show ? 'eyeOff' : 'eye', 14));
  } }, icon('eye', 14));
  return h('div', { class: 'pw-wrap' }, input, toggle);
}

/**
 * Alan tanımlarından form oluşturur.
 * field: {name, label, type, value, options:[{value,label}], placeholder, hint, required, showIf(values), list, rows, extra}
 */
export function formDialog({ title, fields, submitLabel = 'Kaydet', validate, onSubmit, wide = false, intro }) {
  return new Promise((resolve) => {
    let result = null;
    const inputs = {};
    const wrappers = [];
    const values = () => {
      const v = {};
      for (const [name, el] of Object.entries(inputs)) v[name] = el.type === 'checkbox' ? el.checked : el.value;
      return v;
    };
    const refresh = () => {
      const v = values();
      for (const { field, el } of wrappers) el.style.display = !field.showIf || field.showIf(v) ? '' : 'none';
    };
    const buildField = (f) => {
      let control;
      let input;
      if (f.type === 'select') {
        input = h('select', { class: 'input', onchange: refresh }, f.options.map((o) => h('option', { value: o.value }, o.label)));
        input.value = f.value ?? (f.options[0] && f.options[0].value);
        control = input;
      } else if (f.type === 'textarea') {
        input = h('textarea', { class: 'input', rows: f.rows || 5, placeholder: f.placeholder || '', spellcheck: 'false' });
        input.value = f.value ?? '';
        control = input;
      } else if (f.type === 'checkbox') {
        input = h('input', { type: 'checkbox', id: 'f-' + f.name, checked: !!f.value, onchange: refresh });
        const el = h('div', { class: 'field check' }, input, h('label', { for: 'f-' + f.name }, f.label));
        inputs[f.name] = input;
        return el;
      } else if (f.type === 'password') {
        control = passwordInput({ value: f.value ?? '', placeholder: f.placeholder || '' });
        input = control.querySelector('input');
      } else {
        input = h('input', { class: 'input', type: f.type || 'text', value: f.value ?? '', placeholder: f.placeholder || '', list: f.list ? 'dl-' + f.name : null, spellcheck: 'false', oninput: refresh });
        control = f.list ? [input, h('datalist', { id: 'dl-' + f.name }, f.list.map((x) => h('option', { value: x })))] : input;
      }
      inputs[f.name] = input;
      return h('div', { class: 'field' },
        h('label', null, f.label, f.required ? ' *' : ''),
        f.extra ? h('div', { class: 'row', style: { alignItems: 'center' } }, control, f.extra(input)) : control,
        f.hint ? h('div', { class: 'hint' }, f.hint) : null);
    };
    const body = h('div', null, intro || null);
    for (const f of fields) {
      if (Array.isArray(f)) {
        const row = h('div', { class: 'row' });
        for (const sub of f) {
          const el = buildField(sub);
          wrappers.push({ field: sub, el });
          row.append(el);
        }
        body.append(row);
      } else {
        const el = buildField(f);
        wrappers.push({ field: f, el });
        body.append(el);
      }
    }
    const errBox = h('div', { class: 'warn-box', style: { display: 'none' } });
    body.prepend(errBox);
    refresh();
    let busy = false;
    modal({
      title,
      body,
      wide,
      onClose: () => resolve(result),
      actions: [
        { label: 'Vazgeç', onClick: (close) => close() },
        { label: submitLabel, primary: true, submit: true, onClick: async (close) => {
          if (busy) return;
          const v = values();
          for (const { field } of wrappers) {
            if (field.required && (!field.showIf || field.showIf(v)) && !String(v[field.name]).trim()) {
              errBox.textContent = `"${field.label}" alanı zorunlu`;
              errBox.style.display = '';
              return;
            }
          }
          const err = validate && validate(v);
          if (err) {
            errBox.textContent = err;
            errBox.style.display = '';
            return;
          }
          if (onSubmit) {
            busy = true;
            try {
              await onSubmit(v);
            } catch (e) {
              errBox.textContent = e.message;
              errBox.style.display = '';
              busy = false;
              return;
            }
          }
          result = v;
          close();
        } },
      ],
    });
    return inputs;
  });
}

// ---------- Bağlam menüsü ----------
let openMenu = null;
export function contextMenu(x, y, items) {
  closeMenu();
  const menu = h('div', { class: 'menu' });
  for (const it of items) {
    if (!it) continue;
    if (it === '-') menu.append(h('div', { class: 'menu-sep' }));
    else if (it.label && it.header) menu.append(h('div', { class: 'menu-label' }, it.label));
    else menu.append(h('div', {
      class: `menu-item ${it.danger ? 'danger' : ''} ${it.disabled ? 'disabled' : ''}`,
      onclick: () => { closeMenu(); it.onClick(); },
    }, it.icon ? icon(it.icon, 15) : null, it.label, it.kbd ? h('span', { class: 'kbd' }, it.kbd) : null));
  }
  document.body.append(menu);
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
  menu.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
  openMenu = menu;
}
export function closeMenu() {
  if (openMenu) openMenu.remove();
  openMenu = null;
}
document.addEventListener('mousedown', (e) => {
  if (openMenu && !openMenu.contains(e.target)) closeMenu();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
window.addEventListener('blur', closeMenu);

// ---------- Biçimlendirme ----------
export function formatBytes(n) {
  if (n == null) return '';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return (i === 0 ? n : n.toFixed(1)) + ' ' + u[i];
}

export function formatDate(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatMode(mode) {
  if (mode == null) return '';
  const chars = 'rwxrwxrwx';
  let s = '';
  for (let i = 0; i < 9; i++) s += mode & (1 << (8 - i)) ? chars[i] : '-';
  return s;
}

export const COLORS = ['#4c8dff', '#3fbf7f', '#f0b44c', '#f05d5e', '#a77bf3', '#22b8cf', '#ec6fb4', '#8b93a1'];

export function avatar(label, color) {
  const letter = (label || '?').trim().charAt(0).toLocaleUpperCase('tr-TR') || '?';
  return h('div', { class: 'avatar', style: { background: color || COLORS[0] } }, letter);
}

export async function copyText(text, msg = 'Panoya kopyalandı') {
  await navigator.clipboard.writeText(text);
  toast(msg, 'success', 2000);
}
