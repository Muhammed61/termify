// Kasa verisinin renderer tarafındaki kopyası ve değişiklik bildirimi.
const listeners = new Set();

export const store = {
  data: null,
  forwardStatus: {}, // kuralId -> { state, error }
};

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notify() {
  for (const fn of listeners) fn();
}

export async function reload() {
  store.data = await window.api.data.all();
  notify();
}

export async function save(collection, item) {
  const saved = await window.api.data.upsert(collection, item);
  await reload();
  return saved;
}

export async function remove(collection, id) {
  await window.api.data.remove(collection, id);
  await reload();
}

export async function saveSettings(patch) {
  store.data.settings = await window.api.data.saveSettings(patch);
  notify();
}

export function getHost(id) {
  return store.data.hosts.find((h) => h.id === id) || null;
}

export function hostLabel(host) {
  if (!host) return 'Bilinmeyen host';
  return host.label || `${host.username ? host.username + '@' : ''}${host.host}`;
}

export function hostAddress(host) {
  const port = Number(host.port) || 22;
  return `${host.username ? host.username + '@' : ''}${host.host}${port !== 22 ? ':' + port : ''}`;
}

// "kullanici@sunucu:port" biçimini çözer
export function parseQuick(text) {
  const m = /^\s*(?:ssh\s+)?(?:([^@\s]+)@)?([^\s:@]+|\[[^\]]+\])(?::(\d+))?(?:\s+-p\s*(\d+))?\s*$/.exec(text);
  if (!m) return null;
  return { username: m[1] || 'root', host: m[2].replace(/^\[|\]$/g, ''), port: Number(m[3] || m[4] || 22), authType: 'password' };
}
