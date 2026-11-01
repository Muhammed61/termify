// SSH anahtarı oluşturma ve içe aktarma.
const crypto = require('crypto');
const { utils } = require('ssh2');

function describe(privateKey, passphrase, comment = '') {
  const parsed = utils.parseKey(privateKey, passphrase || undefined);
  if (parsed instanceof Error) {
    if (/passphrase|encrypted/i.test(parsed.message)) throw new Error('Anahtar şifreli, doğru parolayı girin');
    throw new Error('Geçersiz özel anahtar: ' + parsed.message);
  }
  const key = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!key.isPrivateKey()) throw new Error('Bu bir özel anahtar değil (genel anahtar yapıştırılmış olabilir)');
  const blob = key.getPublicSSH();
  const fp = 'SHA256:' + crypto.createHash('sha256').update(blob).digest('base64').replace(/=+$/, '');
  const pub = `${key.type} ${blob.toString('base64')}${comment || key.comment ? ' ' + (comment || key.comment) : ''}`;
  return { type: key.type, public: pub, fingerprint: fp };
}

function generate({ type = 'ed25519', bits, comment = '', passphrase = '' }) {
  const opts = { comment };
  if (type === 'rsa') opts.bits = Number(bits) || 4096;
  if (type === 'ecdsa') opts.bits = Number(bits) || 256;
  if (passphrase) {
    opts.passphrase = passphrase;
    opts.cipher = 'aes256-ctr';
  }
  const pair = utils.generateKeyPairSync(type, opts);
  return { private: pair.private, ...describe(pair.private, passphrase, comment) };
}

module.exports = { generate, describe };
