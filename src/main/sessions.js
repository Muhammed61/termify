// Terminal ve SFTP oturumlarını yönetir. Electron'dan bağımsızdır:
// olayları emit(kanal, ...argümanlar) ile, soruları ask(istek) ile iletir.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { StringDecoder } = require('string_decoder');
const { connect } = require('./connection');

const posix = path.posix;

class SessionManager {
  constructor({ vault, ask, emit }) {
    this.vault = vault;
    this.ask = ask;
    this.emit = emit;
    this.shells = new Map(); // id -> { conn, stream }
    this.sftps = new Map(); // id -> { conn, sftp }
  }

  resolveHost(ref) {
    if (ref && ref.id) {
      const saved = this.vault.get('hosts', ref.id);
      if (saved) return saved;
    }
    if (!ref || !ref.host) throw new Error('Host bulunamadı');
    return { authType: 'password', port: 22, ...ref };
  }

  async connectHost(ref) {
    const host = this.resolveHost(ref);
    const conn = await connect({ host, vault: this.vault, ask: this.ask });
    return { conn, host };
  }

  // Tek seferlik komut çalıştırır (ör. anahtarı sunucuya yükleme)
  async exec(ref, command) {
    const { conn } = await this.connectHost(ref);
    try {
      return await new Promise((resolve, reject) => {
        conn.exec(command, (err, stream) => {
          if (err) return reject(err);
          let stdout = '';
          let stderr = '';
          stream.on('data', (d) => (stdout += d));
          stream.stderr.on('data', (d) => (stderr += d));
          stream.on('close', (code) => resolve({ code, stdout, stderr }));
        });
      });
    } finally {
      conn.end();
    }
  }

  // ---------- Terminal ----------

  async openShell(ref, { cols = 80, rows = 24 } = {}) {
    const { conn, host } = await this.connectHost(ref);
    const id = crypto.randomUUID();
    const stream = await new Promise((resolve, reject) => {
      conn.shell({ term: 'xterm-256color', cols, rows }, (err, s) => (err ? reject(err) : resolve(s)));
    }).catch((err) => {
      conn.end();
      throw err;
    });

    const out = new StringDecoder('utf8');
    const errOut = new StringDecoder('utf8');
    stream.on('data', (d) => this.emit('term:data', id, out.write(d)));
    stream.stderr.on('data', (d) => this.emit('term:data', id, errOut.write(d)));

    let closed = false;
    const finish = (reason) => {
      if (closed) return;
      closed = true;
      this.shells.delete(id);
      this.emit('term:exit', id, reason || null);
      conn.end();
    };
    stream.on('close', () => finish());
    conn.on('error', (err) => finish(err.message));
    conn.on('close', () => finish());

    this.shells.set(id, { conn, stream });
    if (host.startupCommand) stream.write(host.startupCommand + '\n');
    return id;
  }

  write(id, data) {
    const s = this.shells.get(id);
    if (s) s.stream.write(data);
  }

  resize(id, cols, rows) {
    const s = this.shells.get(id);
    if (s) s.stream.setWindow(rows, cols, 0, 0);
  }

  closeShell(id) {
    const s = this.shells.get(id);
    if (s) {
      s.stream.end();
      s.conn.end();
    }
  }

  // ---------- SFTP ----------

  async openSftp(ref) {
    const { conn } = await this.connectHost(ref);
    const sftp = await new Promise((resolve, reject) => conn.sftp((err, s) => (err ? reject(err) : resolve(s)))).catch((err) => {
      conn.end();
      throw err;
    });
    const id = crypto.randomUUID();
    this.sftps.set(id, { conn, sftp });
    const onClose = () => {
      if (this.sftps.delete(id)) this.emit('sftp:closed', id);
    };
    conn.on('close', onClose);
    conn.on('error', onClose);
    const home = await this.call(id, 'realpath', '.');
    return { id, home };
  }

  sftpOf(id) {
    const s = this.sftps.get(id);
    if (!s) throw new Error('SFTP oturumu kapalı');
    return s.sftp;
  }

  call(id, method, ...args) {
    const sftp = this.sftpOf(id);
    return new Promise((resolve, reject) => sftp[method](...args, (err, res) => (err ? reject(err) : resolve(res))));
  }

  closeSftp(id) {
    const s = this.sftps.get(id);
    if (s) s.conn.end();
    this.sftps.delete(id);
  }

  async list(id, dir) {
    const items = await this.call(id, 'readdir', dir);
    const result = [];
    for (const it of items) {
      const a = it.attrs;
      let type = a.isDirectory() ? 'd' : a.isSymbolicLink() ? 'l' : 'f';
      if (type === 'l') {
        try {
          const st = await this.call(id, 'stat', posix.join(dir, it.filename));
          type = st.isDirectory() ? 'ld' : 'l';
        } catch {
          /* kırık bağlantı */
        }
      }
      result.push({ name: it.filename, type, size: a.size, mtime: a.mtime * 1000, mode: a.mode });
    }
    return result;
  }

  mkdir(id, p) {
    return this.call(id, 'mkdir', p);
  }

  rename(id, from, to) {
    return this.call(id, 'rename', from, to);
  }

  chmod(id, p, mode) {
    return this.call(id, 'chmod', p, parseInt(mode, 8));
  }

  async remove(id, p) {
    const st = await this.call(id, 'lstat', p);
    if (st.isDirectory()) {
      const items = await this.call(id, 'readdir', p);
      for (const it of items) await this.remove(id, posix.join(p, it.filename));
      await this.call(id, 'rmdir', p);
    } else {
      await this.call(id, 'unlink', p);
    }
  }

  async readText(id, p) {
    const st = await this.call(id, 'stat', p);
    if (st.size > 5 * 1024 * 1024) throw new Error('Dosya düzenlemek için çok büyük (5 MB üstü)');
    const sftp = this.sftpOf(id);
    return new Promise((resolve, reject) => {
      const chunks = [];
      sftp.createReadStream(p).on('data', (c) => chunks.push(c)).on('error', reject).on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
  }

  writeText(id, p, text) {
    const sftp = this.sftpOf(id);
    return new Promise((resolve, reject) => {
      const ws = sftp.createWriteStream(p);
      ws.on('error', reject).on('close', resolve);
      ws.end(Buffer.from(text, 'utf8'));
    });
  }

  // Yerel dosya/klasörleri uzak klasöre yükler (klasörler özyinelemeli)
  async upload(id, localPaths, remoteDir, transferId) {
    const jobs = [];
    const dirs = [];
    const walk = (local, remote) => {
      const st = fs.statSync(local);
      if (st.isDirectory()) {
        dirs.push(remote);
        for (const name of fs.readdirSync(local)) walk(path.join(local, name), posix.join(remote, name));
      } else {
        jobs.push({ local, remote, size: st.size });
      }
    };
    for (const lp of localPaths) walk(lp, posix.join(remoteDir, path.basename(lp)));
    for (const d of dirs) {
      try {
        await this.call(id, 'mkdir', d);
      } catch {
        /* zaten var */
      }
    }
    await this.runTransfers(jobs, transferId, (job, step) => this.call(id, 'fastPut', job.local, job.remote, { step }));
  }

  // Uzak dosya/klasörleri yerel klasöre indirir
  async download(id, remotePaths, localDir, transferId) {
    const jobs = [];
    const walk = async (remote, local) => {
      const st = await this.call(id, 'stat', remote);
      if (st.isDirectory()) {
        fs.mkdirSync(local, { recursive: true });
        const items = await this.call(id, 'readdir', remote);
        for (const it of items) await walk(posix.join(remote, it.filename), path.join(local, it.filename));
      } else {
        jobs.push({ local, remote, size: st.size });
      }
    };
    for (const rp of remotePaths) await walk(rp, path.join(localDir, posix.basename(rp)));
    await this.runTransfers(jobs, transferId, (job, step) => this.call(id, 'fastGet', job.remote, job.local, { step }));
  }

  async runTransfers(jobs, transferId, run) {
    const total = jobs.reduce((s, j) => s + j.size, 0);
    let done = 0;
    let last = 0;
    this.emit('sftp:progress', transferId, { done: 0, total, file: jobs[0] ? path.basename(jobs[0].local) : '' });
    for (const job of jobs) {
      const name = path.basename(job.local);
      await run(job, (transferred) => {
        const now = Date.now();
        if (now - last > 100) {
          last = now;
          this.emit('sftp:progress', transferId, { done: done + transferred, total, file: name });
        }
      });
      done += job.size;
      this.emit('sftp:progress', transferId, { done, total, file: name });
    }
  }

  closeAll() {
    for (const s of this.shells.values()) s.conn.end();
    for (const s of this.sftps.values()) s.conn.end();
    this.shells.clear();
    this.sftps.clear();
  }
}

module.exports = { SessionManager };
