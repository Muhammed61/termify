// Port yönlendirme: yerel (-L), uzak (-R) ve dinamik/SOCKS5 (-D) tüneller.
const net = require('net');
const { connect } = require('./connection');

class ForwardManager {
  constructor({ vault, ask, emit }) {
    this.vault = vault;
    this.ask = ask;
    this.emit = emit;
    this.active = new Map(); // ruleId -> { conn, server }
  }

  status(id, state, error = null) {
    this.emit('forward:status', id, { state, error });
  }

  activeIds() {
    return [...this.active.keys()];
  }

  async start(ruleId) {
    if (this.active.has(ruleId)) return;
    const rule = this.vault.get('forwards', ruleId);
    if (!rule) throw new Error('Kural bulunamadı');
    const host = this.vault.get('hosts', rule.hostId);
    if (!host) throw new Error('Kuralın hostu bulunamadı');

    this.status(ruleId, 'connecting');
    let conn;
    try {
      conn = await connect({ host, vault: this.vault, ask: this.ask });
      const entry = { conn, server: null };
      const bindAddr = rule.bindAddress || '127.0.0.1';
      const bindPort = Number(rule.bindPort);

      if (rule.type === 'remote') {
        await new Promise((resolve, reject) => conn.forwardIn(bindAddr, bindPort, (err) => (err ? reject(err) : resolve())));
        conn.on('tcp connection', (info, accept) => {
          const channel = accept();
          const socket = net.connect(Number(rule.destPort), rule.destHost || '127.0.0.1');
          socket.on('error', () => channel.close());
          channel.on('error', () => socket.destroy());
          socket.pipe(channel).pipe(socket);
        });
      } else {
        const handler = rule.type === 'dynamic' ? (s) => this.socks(conn, s) : (s) => this.local(conn, s, rule);
        entry.server = net.createServer(handler);
        await new Promise((resolve, reject) => {
          entry.server.once('error', reject);
          entry.server.listen(bindPort, bindAddr, resolve);
        });
        entry.server.on('error', (err) => this.fail(ruleId, err));
      }

      conn.on('close', () => this.fail(ruleId, new Error('Bağlantı kapandı')));
      conn.on('error', (err) => this.fail(ruleId, err));
      this.active.set(ruleId, entry);
      this.status(ruleId, 'active');
    } catch (err) {
      if (conn) conn.end();
      const msg = err.code === 'EADDRINUSE' ? `Port ${rule.bindPort} zaten kullanımda` : err.message;
      this.status(ruleId, 'error', msg);
      throw new Error(msg);
    }
  }

  fail(ruleId, err) {
    if (!this.active.has(ruleId)) return;
    this.stop(ruleId);
    this.status(ruleId, 'error', err.message);
  }

  stop(ruleId) {
    const entry = this.active.get(ruleId);
    if (!entry) return;
    this.active.delete(ruleId);
    if (entry.server) entry.server.close();
    entry.conn.end();
    this.status(ruleId, 'stopped');
  }

  stopAll() {
    for (const id of [...this.active.keys()]) this.stop(id);
  }

  local(conn, socket, rule) {
    conn.forwardOut(socket.remoteAddress || '127.0.0.1', socket.remotePort || 0, rule.destHost, Number(rule.destPort), (err, stream) => {
      if (err) return socket.destroy();
      socket.on('error', () => stream.close());
      stream.on('error', () => socket.destroy());
      socket.pipe(stream).pipe(socket);
    });
  }

  // Asgari SOCKS5 sunucusu (kimlik doğrulamasız, yalnızca CONNECT)
  socks(conn, socket) {
    socket.on('error', () => {});
    socket.once('data', (greet) => {
      if (greet[0] !== 0x05) return socket.destroy();
      socket.write(Buffer.from([0x05, 0x00]));
      socket.once('data', (req) => {
        const fail = (code) => socket.end(Buffer.from([0x05, code, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
        if (req[0] !== 0x05 || req[1] !== 0x01) return fail(0x07);
        let host;
        let offset;
        if (req[3] === 0x01) {
          host = [...req.subarray(4, 8)].join('.');
          offset = 8;
        } else if (req[3] === 0x03) {
          const len = req[4];
          host = req.subarray(5, 5 + len).toString();
          offset = 5 + len;
        } else if (req[3] === 0x04) {
          const parts = [];
          for (let i = 0; i < 16; i += 2) parts.push(req.readUInt16BE(4 + i).toString(16));
          host = parts.join(':');
          offset = 20;
        } else {
          return fail(0x08);
        }
        const port = req.readUInt16BE(offset);
        const rest = req.subarray(offset + 2);
        conn.forwardOut('127.0.0.1', 0, host, port, (err, stream) => {
          if (err) return fail(0x05);
          socket.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
          if (rest.length) stream.write(rest);
          stream.on('error', () => socket.destroy());
          socket.on('close', () => stream.close());
          socket.pipe(stream).pipe(socket);
        });
      });
    });
  }
}

module.exports = { ForwardManager };
