// SFTP ekranının yerel (bilgisayar) paneli için dosya işlemleri.
const fs = require('fs');
const os = require('os');
const path = require('path');

const isWin = process.platform === 'win32';

function drives() {
  const list = [];
  for (let c = 65; c <= 90; c++) {
    const d = String.fromCharCode(c) + ':\\';
    try {
      fs.accessSync(d);
      list.push({ name: d, type: 'd', size: 0, mtime: 0 });
    } catch {
      /* sürücü yok */
    }
  }
  return list;
}

// Asenkron: büyük klasörler (OneDrive vb.) ana süreci kilitlemesin
async function list(dir) {
  if (isWin && !dir) return drives();
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  const stats = await Promise.all(
    entries.map(async (ent) => {
      try {
        const st = await fs.promises.stat(path.join(dir, ent.name));
        return { name: ent.name, type: st.isDirectory() ? 'd' : 'f', size: st.size, mtime: st.mtimeMs, mode: st.mode };
      } catch {
        return null; // erişilemeyen dosya (sistem dosyası vb.)
      }
    }),
  );
  return stats.filter(Boolean);
}

function parent(dir) {
  if (!dir) return '';
  const up = path.dirname(dir);
  if (up === dir) return isWin ? '' : '/';
  return up;
}

module.exports = {
  home: () => os.homedir(),
  list,
  parent,
  join: (...p) => path.join(...p),
  mkdir: (p) => fs.mkdirSync(p),
  rename: (a, b) => fs.renameSync(a, b),
  remove: (p) => fs.rmSync(p, { recursive: true, force: true }),
};
