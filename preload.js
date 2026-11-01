// Renderer'a güvenli bir API sunar (Node erişimi olmadan).
const { contextBridge, ipcRenderer, webUtils } = require('electron');

async function invoke(channel, ...args) {
  const r = await ipcRenderer.invoke(channel, ...args);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

const call = (channel) => (...args) => invoke(channel, ...args);

function on(channel, fn) {
  const listener = (_e, ...args) => fn(...args);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('api', {
  on,
  replyAsk: (id, value) => ipcRenderer.send('ask:reply', id, value),
  pathForFile: (file) => webUtils.getPathForFile(file),
  vault: {
    status: call('vault:status'),
    create: call('vault:create'),
    unlock: call('vault:unlock'),
    lock: call('vault:lock'),
    changePassword: call('vault:changePassword'),
    exportBackup: call('vault:export'),
    importBackup: call('vault:import'),
  },
  data: {
    all: call('data:all'),
    upsert: call('data:upsert'),
    remove: call('data:remove'),
    saveSettings: call('settings:save'),
    removeKnownHost: call('knownHosts:remove'),
  },
  keys: {
    generate: call('keys:generate'),
    describe: call('keys:describe'),
    readFile: call('keys:readFile'),
    saveFile: call('keys:saveFile'),
    install: call('keys:install'),
  },
  term: {
    open: call('term:open'),
    write: (id, data) => ipcRenderer.send('term:write', id, data),
    resize: (id, cols, rows) => ipcRenderer.send('term:resize', id, cols, rows),
    close: (id) => ipcRenderer.send('term:close', id),
  },
  sftp: {
    open: call('sftp:open'),
    close: call('sftp:close'),
    list: call('sftp:list'),
    mkdir: call('sftp:mkdir'),
    rename: call('sftp:rename'),
    chmod: call('sftp:chmod'),
    remove: call('sftp:remove'),
    readText: call('sftp:readText'),
    writeText: call('sftp:writeText'),
    upload: call('sftp:upload'),
    download: call('sftp:download'),
  },
  local: {
    home: call('local:home'),
    list: call('local:list'),
    parent: call('local:parent'),
    join: call('local:join'),
    mkdir: call('local:mkdir'),
    rename: call('local:rename'),
    remove: call('local:remove'),
    open: call('local:open'),
  },
  forward: {
    start: call('forward:start'),
    stop: call('forward:stop'),
    active: call('forward:active'),
  },
  openExternal: call('app:openExternal'),
});
