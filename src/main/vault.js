// Şifreli kasa: tüm hostlar, anahtarlar, parolalar ve ayarlar tek bir dosyada
// AES-256-GCM ile şifrelenir.
//
// Sürüm 2 (zarf şifreleme): veriler rastgele bir veri anahtarıyla (DEK) şifrelenir.
// DEK iki kez sarılır: ana paroladan türetilen anahtarla ve kurtarma anahtarından
// türetilen anahtarla. Böylece parola unutulursa kurtarma anahtarıyla yeni parola
// belirlenebilir. Sürüm 1 dosyaları ilk açılışta sürüm 2'ye çevrilir.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const KDF = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const FORMATS = ['termify-vault', 'kabuk-vault'];
const MIN_PASSWORD = 4;
// Kurtarma anahtarı alfabesi: karışabilecek 0/O ve 1/I harfleri yok
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function emptyData() {
  return {
    hosts: [],
    keys: [],
    snippets: [],
    forwards: [],
    knownHosts: {},
    settings: {
      fontSize: 14,
      fontFamily: 'Cascadia Mono, Consolas, monospace',
      theme: 'termify',
      cursorStyle: 'block',
      cursorBlink: true,
      scrollback: 5000,
      autoLockMinutes: 15,
      keepAliveSeconds: 30,
      copyOnSelect: false,
    },
  };
}

function withDefaults(data) {
  const defaults = emptyData();
  return { ...defaults, ...data, settings: { ...defaults.settings, ...(data.settings || {}) } };
}

function checkPassword(pw) {
  if (typeof pw !== 'string' || pw.length < MIN_PASSWORD) throw new Error(`Parola en az ${MIN_PASSWORD} karakter olmalı`);
}

function deriveKey(secret, salt) {
  return crypto.scryptSync(secret, salt, 32, KDF);
}

function seal(buf, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(buf), cipher.final()]);
  return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ct: ct.toString('base64') };
}

function open(box, key) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(box.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(box.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(box.ct, 'base64')), decipher.final()]);
}

// DEK'i bir sırla (parola veya kurtarma anahtarı) sarar
function wrap(dek, secret) {
  const salt = crypto.randomBytes(16);
  return { salt: salt.toString('base64'), ...seal(dek, deriveKey(secret, salt)) };
}

function unwrap(w, secret) {
  if (!w) return null;
  try {
    return open(w, deriveKey(secret, Buffer.from(w.salt, 'base64')));
  } catch {
    return null;
  }
}

// "ABCD-EFGH-..." biçiminde 24 karakterlik (120 bit) kurtarma anahtarı
function newRecoveryKey() {
  const bytes = crypto.randomBytes(24);
  const chars = [...bytes].map((b) => ALPHABET[b % 32]).join('');
  return chars.match(/.{4}/g).join('-');
}

function normalizeRecoveryKey(key) {
  return String(key || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Sürüm 1: veriler doğrudan paroladan türetilen anahtarla şifreliydi
function decryptV1(file, password) {
  const key = deriveKey(password, Buffer.from(file.salt, 'base64'));
  try {
    return JSON.parse(open({ iv: file.iv, tag: file.tag, ct: file.data }, key).toString('utf8'));
  } catch {
    return null;
  }
}

function readFile(p) {
  let file;
  try {
    file = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    throw new Error('Kasa dosyası okunamadı');
  }
  if (!file || !FORMATS.includes(file.format)) throw new Error('Geçersiz kasa dosyası');
  return file;
}

class Vault {
  constructor(dir) {
    this.file = path.join(dir, 'kasa.json');
    this.data = null;
    this.dek = null;
    this.wraps = null; // { password, recovery }
    this.failures = 0;
    this.blockedUntil = 0;
  }

  exists() {
    return fs.existsSync(this.file);
  }

  isUnlocked() {
    return this.data !== null;
  }

  hasRecovery() {
    return !!(this.wraps && this.wraps.recovery);
  }

  // Hatalı denemelerden sonra artan bekleme (kısa PIN'leri deneme-yanılmaya karşı korur)
  throttle() {
    const wait = Math.ceil((this.blockedUntil - Date.now()) / 1000);
    if (wait > 0) throw new Error(`Çok fazla hatalı deneme. ${wait} saniye sonra tekrar deneyin.`);
  }

  failed(message) {
    this.failures++;
    if (this.failures >= 3) this.blockedUntil = Date.now() + Math.min(300, 5 * 2 ** (this.failures - 3)) * 1000;
    return new Error(message);
  }

  /** Yeni kasa oluşturur ve kurtarma anahtarını döndürür (yalnızca bir kez gösterilir). */
  create(password) {
    if (this.exists()) throw new Error('Kasa zaten mevcut');
    checkPassword(password);
    const recoveryKey = newRecoveryKey();
    this.dek = crypto.randomBytes(32);
    this.wraps = { password: wrap(this.dek, password), recovery: wrap(this.dek, normalizeRecoveryKey(recoveryKey)) };
    this.data = emptyData();
    this.save();
    return recoveryKey;
  }

  unlock(password) {
    this.throttle();
    const file = readFile(this.file);
    if ((file.version || 1) === 1) {
      const data = decryptV1(file, password);
      if (!data) throw this.failed('Ana parola hatalı');
      // Sürüm 2'ye çevir; kurtarma anahtarı kullanıcı onaylayınca oluşturulur
      this.dek = crypto.randomBytes(32);
      this.wraps = { password: wrap(this.dek, password), recovery: null };
      this.data = withDefaults(data);
      this.save();
    } else {
      const dek = unwrap(file.keys.password, password);
      if (!dek) throw this.failed('Ana parola hatalı');
      this.load(file, dek);
    }
    this.failures = 0;
    return { hasRecovery: this.hasRecovery() };
  }

  /** Parolayı unutan kullanıcı kurtarma anahtarıyla yeni parola belirler ve kasayı açar. */
  recover(recoveryKey, newPassword) {
    this.throttle();
    checkPassword(newPassword);
    const file = readFile(this.file);
    if ((file.version || 1) === 1 || !file.keys.recovery) throw new Error('Bu kasa için kurtarma anahtarı oluşturulmamış');
    const dek = unwrap(file.keys.recovery, normalizeRecoveryKey(recoveryKey));
    if (!dek) throw this.failed('Kurtarma anahtarı hatalı');
    this.load(file, dek);
    this.wraps.password = wrap(dek, newPassword);
    this.save();
    this.failures = 0;
  }

  load(file, dek) {
    this.dek = dek;
    this.wraps = { password: file.keys.password, recovery: file.keys.recovery || null };
    this.data = withDefaults(JSON.parse(open(file.data, dek).toString('utf8')));
  }

  /** Yeni kurtarma anahtarı üretir; eskisi geçersiz olur. */
  newRecoveryKey() {
    if (!this.isUnlocked()) throw new Error('Kasa kilitli');
    const key = newRecoveryKey();
    this.wraps.recovery = wrap(this.dek, normalizeRecoveryKey(key));
    this.save();
    return key;
  }

  lock() {
    this.data = null;
    this.dek = null;
    this.wraps = null;
  }

  /** Kasayı tamamen siler (parola ve kurtarma anahtarı kaybedildiğinde son çare). */
  reset() {
    this.lock();
    if (this.exists()) fs.renameSync(this.file, this.file.replace(/\.json$/, `-silinen-${Date.now()}.json`));
  }

  save() {
    if (!this.isUnlocked()) throw new Error('Kasa kilitli');
    const out = {
      format: 'termify-vault',
      version: 2,
      kdf: { name: 'scrypt', N: KDF.N, r: KDF.r, p: KDF.p },
      keys: this.wraps,
      data: seal(Buffer.from(JSON.stringify(this.data), 'utf8'), this.dek),
    };
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(out));
    fs.renameSync(tmp, this.file);
  }

  changePassword(oldPassword, newPassword) {
    checkPassword(newPassword);
    if (!unwrap(this.wraps.password, oldPassword)) throw new Error('Mevcut parola hatalı');
    this.wraps.password = wrap(this.dek, newPassword);
    this.save();
  }

  exportTo(target) {
    if (!this.isUnlocked()) throw new Error('Kasa kilitli');
    fs.copyFileSync(this.file, target);
  }

  /** Yedeği açar: yedeğin parolası veya kurtarma anahtarı kabul edilir. */
  importFrom(source, secret) {
    const file = readFile(source);
    let data;
    if ((file.version || 1) === 1) data = decryptV1(file, secret);
    else {
      const dek = unwrap(file.keys.password, secret) || unwrap(file.keys.recovery, normalizeRecoveryKey(secret));
      data = dek ? JSON.parse(open(file.data, dek).toString('utf8')) : null;
    }
    if (!data) throw new Error('Yedeğin parolası hatalı');
    this.data = withDefaults(data);
    this.save();
  }

  // Koleksiyon yardımcıları
  list(collection) {
    return this.data[collection];
  }

  upsert(collection, item) {
    const items = this.data[collection];
    if (!item.id) item.id = crypto.randomUUID();
    const i = items.findIndex((x) => x.id === item.id);
    if (i >= 0) items[i] = { ...items[i], ...item };
    else items.push(item);
    this.save();
    return item;
  }

  remove(collection, id) {
    this.data[collection] = this.data[collection].filter((x) => x.id !== id);
    this.save();
  }

  get(collection, id) {
    return this.data[collection].find((x) => x.id === id) || null;
  }
}

module.exports = { Vault, MIN_PASSWORD };
