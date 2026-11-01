// Şifreli kasa: tüm hostlar, anahtarlar, parolalar ve ayarlar tek bir dosyada
// AES-256-GCM ile şifrelenir. Anahtar, ana paroladan scrypt ile türetilir.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const KDF = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

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

function deriveKey(password, salt) {
  return crypto.scryptSync(password, salt, 32, KDF);
}

function encrypt(obj, key, salt) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
  return {
    format: 'termify-vault',
    version: 1,
    kdf: { name: 'scrypt', N: KDF.N, r: KDF.r, p: KDF.p },
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  };
}

function decrypt(file, password) {
  if (!file || !['termify-vault', 'kabuk-vault'].includes(file.format)) throw new Error('Geçersiz kasa dosyası');
  const salt = Buffer.from(file.salt, 'base64');
  const key = deriveKey(password, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(file.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(file.tag, 'base64'));
  let text;
  try {
    text = Buffer.concat([decipher.update(Buffer.from(file.data, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('Ana parola hatalı');
  }
  return { data: JSON.parse(text), key, salt };
}

class Vault {
  constructor(dir) {
    this.file = path.join(dir, 'kasa.json');
    this.data = null;
    this.key = null;
    this.salt = null;
  }

  exists() {
    return fs.existsSync(this.file);
  }

  isUnlocked() {
    return this.data !== null;
  }

  create(password) {
    if (this.exists()) throw new Error('Kasa zaten mevcut');
    this.salt = crypto.randomBytes(16);
    this.key = deriveKey(password, this.salt);
    this.data = emptyData();
    this.save();
  }

  unlock(password) {
    const file = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    const { data, key, salt } = decrypt(file, password);
    const defaults = emptyData();
    this.data = { ...defaults, ...data, settings: { ...defaults.settings, ...(data.settings || {}) } };
    this.key = key;
    this.salt = salt;
  }

  lock() {
    this.data = null;
    this.key = null;
    this.salt = null;
  }

  save() {
    if (!this.isUnlocked()) throw new Error('Kasa kilitli');
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(encrypt(this.data, this.key, this.salt)));
    fs.renameSync(tmp, this.file);
  }

  changePassword(oldPassword, newPassword) {
    const file = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    decrypt(file, oldPassword); // eski parolayı doğrula
    this.salt = crypto.randomBytes(16);
    this.key = deriveKey(newPassword, this.salt);
    this.save();
  }

  exportTo(target) {
    if (!this.isUnlocked()) throw new Error('Kasa kilitli');
    fs.copyFileSync(this.file, target);
  }

  importFrom(source, password) {
    const file = JSON.parse(fs.readFileSync(source, 'utf8'));
    const { data } = decrypt(file, password);
    const defaults = emptyData();
    this.data = { ...defaults, ...data, settings: { ...defaults.settings, ...(data.settings || {}) } };
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

module.exports = { Vault };
