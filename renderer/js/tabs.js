// Başlık çubuğundaki sekmeler ve bunlara bağlı görünümler.
import { h, icon, contextMenu } from './ui.js';

const tabs = [];
let activeId = null;
const bar = () => document.getElementById('tabs');
const main = () => document.getElementById('main');

/**
 * @param {{id?:string, title:string, icon?:string, view:HTMLElement, closable?:boolean, onActivate?:Function, onClose?:Function, home?:boolean}} opts
 */
export function addTab(opts) {
  const tab = {
    id: opts.id || crypto.randomUUID(),
    closable: opts.closable !== false,
    ...opts,
  };
  const dot = h('span', { class: 'dot' });
  const title = h('span', { class: 'tab-title' }, opts.title);
  tab.el = h('div', {
    class: `tab ${opts.home ? 'home' : ''}`,
    title: opts.title,
    onmousedown: (e) => {
      if (e.button === 1 && tab.closable) {
        e.preventDefault();
        closeTab(tab.id);
      } else if (e.button === 0) activate(tab.id);
    },
    oncontextmenu: (e) => {
      if (!tab.closable) return;
      contextMenu(e.clientX, e.clientY, [
        { label: 'Sekmeyi kapat', icon: 'x', onClick: () => closeTab(tab.id) },
        { label: 'Diğer sekmeleri kapat', onClick: () => tabs.filter((t) => t.closable && t.id !== tab.id).forEach((t) => closeTab(t.id)) },
      ]);
    },
  },
    opts.icon ? icon(opts.icon, 15) : dot,
    title,
    tab.closable ? h('button', { class: 'tab-close', title: 'Kapat', onmousedown: (e) => e.stopPropagation(), onclick: () => closeTab(tab.id) }, icon('x', 13)) : null);
  tab.setTitle = (t) => {
    title.textContent = t;
    tab.el.title = t;
    tab.title = t;
  };
  tab.setStatus = (s) => {
    dot.className = `dot ${s}`;
  };
  tab.view.classList.add('view');
  tabs.push(tab);
  bar().append(tab.el);
  main().append(tab.view);
  activate(tab.id);
  return tab;
}

export function activate(id) {
  const tab = tabs.find((t) => t.id === id);
  if (!tab) return;
  activeId = id;
  for (const t of tabs) {
    t.el.classList.toggle('active', t.id === id);
    t.view.classList.toggle('active', t.id === id);
  }
  tab.el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  if (tab.onActivate) requestAnimationFrame(() => tab.onActivate());
}

export function closeTab(id) {
  const i = tabs.findIndex((t) => t.id === id);
  if (i < 0) return;
  const [tab] = tabs.splice(i, 1);
  if (tab.onClose) tab.onClose();
  tab.el.remove();
  tab.view.remove();
  if (activeId === id) activate((tabs[i] || tabs[i - 1] || tabs[0]).id);
}

export function activeTab() {
  return tabs.find((t) => t.id === activeId) || null;
}

export function allTabs() {
  return tabs;
}

export function cycle(dir) {
  const i = tabs.findIndex((t) => t.id === activeId);
  const next = tabs[(i + dir + tabs.length) % tabs.length];
  if (next) activate(next.id);
}
