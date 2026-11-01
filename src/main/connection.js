// SSH bağlantısı kurma: kimlik doğrulama, host anahtarı doğrulama, atlama sunucusu (jump host).
const crypto = require('crypto');
const { Client, utils } = require('ssh2');

function fingerprint(keyBuf) {
  return 'SHA256:' + crypto.createHash('sha256').update(keyBuf).digest('base64').replace(/=+$/, '');
}

function connectClient(cfg) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let settled = false;
    conn.once('ready', () => {
      settled = true;
      resolve(conn);
    });
    conn.once('error', (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
    conn.on('keyboard-interactive', (name, instructions, lang, prompts, finish) => {
      cfg.onKeyboard(name, instructions, prompts).then(finish, () => finish([]));
    });
    conn.connect(cfg);
  });
}

/**
 * Host kaydından bağlı bir ssh2 Client döndürür.
 * @param {object} opts
 * @param {object} opts.host     Host kaydı ({host, port, username, authType, password, keyId, jumpHostId})
 * @param {Vault}  opts.vault
 * @param {(req: object) => Promise<any>} opts.ask  Kullanıcıya soru sorar (host anahtarı, parola, passphrase)
 * @param {number} [depth]
 */
async function connect({ host, vault, ask }, depth = 0) {
  if (depth > 3) throw new Error('Atlama sunucusu zinciri çok uzun');
  const settings = vault.data.settings;
  const port = Number(host.port) || 22;
  const label = host.label || `${host.username}@${host.host}`;

  let sock;
  let jump = null;
  if (host.jumpHostId) {
    const jumpHost = vault.get('hosts', host.jumpHostId);
    if (!jumpHost) throw new Error('Atlama sunucusu bulunamadı');
    jump = await connect({ host: jumpHost, vault, ask }, depth + 1);
    sock = await new Promise((resolve, reject) => {
      jump.forwardOut('127.0.0.1', 0, host.host, port, (err, stream) => (err ? reject(err) : resolve(stream)));
    }).catch((err) => {
      jump.end();
      throw err;
    });
  }

  const base = {
    host: host.host,
    port,
    sock,
    username: host.username,
    readyTimeout: 20000,
    keepaliveInterval: (Number(settings.keepAliveSeconds) || 0) * 1000,
    keepaliveCountMax: 3,
    tryKeyboard: true,
    hostVerifier: (keyBuf, verify) => {
      const fp = fingerprint(keyBuf);
      const id = `${host.host}:${port}`;
      const known = vault.data.knownHosts[id];
      if (known === fp) return verify(true);
      ask({ type: 'hostkey', host: host.host, port, fingerprint: fp, oldFingerprint: known || null })
        .then((ok) => {
          if (ok) {
            vault.data.knownHosts[id] = fp;
            vault.save();
          }
          verify(!!ok);
        })
        .catch(() => verify(false));
    },
  };

  let password = host.authType === 'password' ? host.password || '' : undefined;
  if (host.authType === 'key') {
    const key = vault.get('keys', host.keyId);
    if (!key) throw new Error('Bu host için seçilen SSH anahtarı bulunamadı');
    base.privateKey = key.private;
    let passphrase = key.passphrase || undefined;
    let parsed = utils.parseKey(key.private, passphrase);
    while (parsed instanceof Error && /passphrase|encrypted/i.test(parsed.message)) {
      passphrase = await ask({ type: 'secret', title: 'Anahtar parolası', message: `"${key.name}" anahtarının parolasını girin` });
      if (passphrase == null) throw new Error('İptal edildi');
      parsed = utils.parseKey(key.private, passphrase);
    }
    if (parsed instanceof Error) throw new Error('Anahtar okunamadı: ' + parsed.message);
    base.passphrase = passphrase;
    if (host.password) password = host.password; // anahtar + parola isteyen sunucular için
  } else if (!password) {
    password = await ask({ type: 'secret', title: 'Parola', message: `${label} için parola girin` });
    if (password == null) throw new Error('İptal edildi');
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const cfg = {
      ...base,
      password,
      onKeyboard: async (name, instructions, prompts) => {
        if (prompts.length === 0) return [];
        if (password && prompts.length === 1 && !prompts[0].echo) return [password];
        const answers = [];
        for (const p of prompts) {
          const a = await ask({ type: p.echo ? 'text' : 'secret', title: name || 'Doğrulama', message: [instructions, p.prompt].filter(Boolean).join('\n') });
          answers.push(a == null ? '' : a);
        }
        return answers;
      },
    };
    try {
      const conn = await connectClient(cfg);
      if (jump) conn.once('close', () => jump.end());
      return conn;
    } catch (err) {
      const authFailed = err.level === 'client-authentication';
      if (!authFailed || host.authType === 'key' || attempt === 2) {
        if (jump) jump.end();
        throw friendlyError(err);
      }
      password = await ask({ type: 'secret', title: 'Parola hatalı', message: `${label} için parolayı tekrar girin` });
      if (password == null) {
        if (jump) jump.end();
        throw new Error('İptal edildi');
      }
      // Sunucu yeni soket ister; atlama sunucusu üzerinden yeni bir kanal aç
      if (jump) {
        base.sock = await new Promise((resolve, reject) => {
          jump.forwardOut('127.0.0.1', 0, host.host, port, (e, s) => (e ? reject(e) : resolve(s)));
        });
      }
    }
  }
  throw new Error('Bağlantı kurulamadı');
}

function friendlyError(err) {
  const map = {
    ECONNREFUSED: 'Bağlantı reddedildi (port kapalı veya SSH servisi çalışmıyor)',
    ENOTFOUND: 'Sunucu adresi bulunamadı',
    ETIMEDOUT: 'Bağlantı zaman aşımına uğradı',
    EHOSTUNREACH: 'Sunucuya ulaşılamıyor',
    ECONNRESET: 'Bağlantı sunucu tarafından kapatıldı',
  };
  if (map[err.code]) return new Error(map[err.code]);
  if (err.level === 'client-authentication') return new Error('Kimlik doğrulama başarısız (kullanıcı adı, parola veya anahtar hatalı)');
  if (err.level === 'client-timeout') return new Error('Bağlantı zaman aşımına uğradı');
  if (/host key verification failed|Host denied/i.test(err.message)) return new Error('Host anahtarı reddedildi');
  return err;
}

module.exports = { connect, fingerprint };
