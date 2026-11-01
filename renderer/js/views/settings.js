// Bilinen hostlar ve Ayarlar ekranları.
import { h, icon, iconBtn, toast, confirmDialog, formDialog, promptDialog, passwordInput, isMac, kbd } from '../ui.js';
import { store, saveSettings, reload } from '../state.js';
import { THEMES } from '../themes.js';
import { update, statusText, checkNow, startUpdate } from '../updates.js';
import { MIN_PASSWORD, regenerateRecoveryKey } from '../recovery.js';

export function renderKnownHosts(header, body) {
  header.append(h('h1', null, 'Bilinen Hostlar'));
  body.append(h('p', { class: 'muted', style: { marginTop: 0 } },
    'İlk bağlantıda onayladığınız sunucu parmak izleri burada saklanır. Parmak izi değişirse uygulama sizi uyarır (olası ortadaki adam saldırısı). Sunucuyu yeniden kurduysanız kaydı silip tekrar onaylayabilirsiniz.'));
  const entries = Object.entries(store.data.knownHosts);
  if (!entries.length) {
    body.append(h('div', { class: 'empty' }, icon('shield', 32), h('h3', null, 'Kayıt yok'), h('p', null, 'Bir sunucuya bağlandığınızda parmak izi burada görünecek.')));
    return;
  }
  body.append(h('div', { class: 'list' }, entries.map(([id, fp]) => h('div', { class: 'list-item' },
    h('div', { class: 'icon-box' }, icon('shield', 18)),
    h('div', { class: 'grow' }, h('div', { style: { fontWeight: 600 } }, id), h('div', { class: 'mono muted ellipsis' }, fp)),
    iconBtn('trash', 'Kaydı sil', async () => {
      if (!(await confirmDialog(`${id} için kayıtlı parmak izi silinecek. Bir sonraki bağlantıda yeniden onay istenir.`, { okLabel: 'Sil', danger: true }))) return;
      await window.api.data.removeKnownHost(id);
      await reload();
    })))));
}

function row(label, hint, control) {
  return h('div', { class: 'setting-row' },
    h('div', { class: 'label' }, label, hint ? h('small', null, hint) : null),
    h('div', { class: 'control' }, control));
}

function numberInput(key, min, max) {
  const el = h('input', { class: 'input', type: 'number', min, max, value: store.data.settings[key], style: { width: '110px' } });
  el.addEventListener('change', () => {
    const n = Math.max(min, Math.min(max, Number(el.value) || min));
    el.value = n;
    saveSettings({ [key]: n });
  });
  return el;
}

function selectInput(key, options) {
  const el = h('select', { class: 'input', style: { width: '200px' } }, options.map(([v, l]) => h('option', { value: v }, l)));
  el.value = store.data.settings[key];
  el.addEventListener('change', () => saveSettings({ [key]: el.value }));
  return el;
}

function checkInput(key) {
  const el = h('input', { type: 'checkbox', checked: store.data.settings[key] });
  el.addEventListener('change', () => saveSettings({ [key]: el.checked }));
  return el;
}

export function renderSettings(header, body) {
  header.append(h('h1', null, 'Ayarlar'));
  const s = store.data.settings;
  const fontInput = h('input', { class: 'input', value: s.fontFamily, style: { width: '240px' }, spellcheck: 'false' });
  fontInput.addEventListener('change', () => saveSettings({ fontFamily: fontInput.value.trim() || 'Consolas, monospace' }));

  const themes = h('div', { class: 'themes' }, Object.entries(THEMES).map(([key, t]) => h('div', {
    class: `theme-swatch ${s.theme === key ? 'active' : ''}`,
    style: { background: t.background, color: t.foreground },
    onclick: () => saveSettings({ theme: key }), // kaydedince ekran yeniden çizilir
  },
    h('div', { class: 'name' }, t.label),
    h('div', null, h('span', { style: { color: t.green } }, 'ali@sunucu'), ':', h('span', { style: { color: t.blue } }, '~'), '$ ls'),
    h('div', { class: 'colors' }, ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan'].map((c) => h('span', { style: { background: t[c] } }))))));

  body.append(h('div', { class: 'settings' },
    h('div', { class: 'settings-card' },
      h('h2', null, 'Terminal'),
      h('p', null, 'Değişiklikler açık terminallere anında uygulanır.'),
      row('Yazı boyutu', null, numberInput('fontSize', 8, 32)),
      row('Yazı tipi', 'Virgülle birden fazla yazı tipi verebilirsiniz', fontInput),
      row('İmleç stili', null, selectInput('cursorStyle', [['block', 'Blok'], ['bar', 'Çizgi'], ['underline', 'Alt çizgi']])),
      row('İmleç yanıp sönsün', null, checkInput('cursorBlink')),
      row('Geri kaydırma satırı', 'Terminal geçmişinde tutulacak satır sayısı', numberInput('scrollback', 500, 100000)),
      row('Seçince kopyala', 'Fareyle seçilen metin otomatik panoya kopyalanır', checkInput('copyOnSelect')),
      h('div', { class: 'setting-row', style: { display: 'block' } }, h('div', { class: 'label' }, 'Renk teması'), themes)),

    h('div', { class: 'settings-card' },
      h('h2', null, 'Bağlantı'),
      row('Canlı tutma aralığı (saniye)', 'Boşta kalan bağlantıların kopmaması için sunucuya sinyal gönderir. 0 = kapalı', numberInput('keepAliveSeconds', 0, 600))),

    h('div', { class: 'settings-card' },
      h('h2', null, 'Güvenlik'),
      h('p', null, 'Tüm hostlar, parolalar ve anahtarlar ana parolanızla AES-256-GCM kullanılarak şifrelenir.'),
      row('Otomatik kilit (dakika)', 'Bu süre boyunca işlem yapılmazsa kasa kilitlenir. 0 = kapalı', numberInput('autoLockMinutes', 0, 1440)),
      row('Ana parola', 'Parola veya en az 4 haneli PIN', h('button', { class: 'btn', onclick: changePassword }, icon('lock', 14), 'Ana parolayı değiştir')),
      recoveryRow()),

    h('div', { class: 'settings-card' },
      h('h2', null, 'Yedekleme ve senkronizasyon'),
      h('p', null, 'Yedek dosyası şifrelidir; ana parolanız veya kurtarma anahtarınız olmadan açılamaz. Dosyayı Google Drive, OneDrive veya Dropbox klasörüne koyarak başka bir bilgisayarda "İçe aktar" ile aynı verilere ulaşabilirsiniz.'),
      row('Dışa aktar', 'Tüm verileri şifreli bir .termify dosyasına kaydeder', h('button', { class: 'btn', onclick: exportBackup }, icon('upload', 14), 'Yedeği kaydet')),
      row('İçe aktar', 'Mevcut verilerin yerine yedekteki veriler gelir', h('button', { class: 'btn', onclick: importBackup }, icon('download', 14), 'Yedekten geri yükle'))),

    h('div', { class: 'settings-card' },
      h('h2', null, 'Klavye kısayolları'),
      ...[
        ['Yeni bağlantı / Kasa sekmesi', 'Ctrl+Shift+T'],
        ['Sekmeyi kapat', 'Ctrl+Shift+W'],
        ['Sonraki / önceki sekme', 'Ctrl+Tab / Ctrl+Shift+Tab'],
        ['Dikey / yatay böl', 'Ctrl+Shift+D / Ctrl+Shift+E'],
        ['Kopyala / Yapıştır', isMac ? 'Cmd+C / Cmd+V' : 'Ctrl+Shift+C (veya seçiliyken Ctrl+C) / Ctrl+V'],
        ['Terminalde ara', 'Ctrl+Shift+F'],
        ['Kasayı kilitle', 'Ctrl+Shift+L'],
      ].map(([a, k]) => row(a, null, h('span', { class: 'mono muted' }, kbd(k))))),

    h('div', { class: 'settings-card' },
      h('h2', null, 'Güncellemeler'),
      h('p', null, 'Termify yeni sürümleri kendisi denetler; yeni sürüm çıkınca ekranın üstünde bildirim görünür.'),
      row(`Sürüm ${update.version || ''}`, statusText(),
        update.state.status === 'available'
          ? h('button', { class: 'btn primary', onclick: startUpdate }, icon('download', 14), update.manual ? 'İndir' : 'Şimdi güncelle')
          : h('button', { class: 'btn', disabled: ['checking', 'downloading', 'installing', 'dev'].includes(update.state.status), onclick: checkNow }, icon('refresh', 14), 'Güncellemeleri denetle'))),

    h('div', { class: 'settings-card' },
      h('h2', null, 'Hakkında'),
      h('p', { style: { margin: 0 } }, `Termify ${update.version || ''} · Electron, xterm.js ve ssh2 ile geliştirildi.`))));
}

// Kurtarma anahtarı satırı: durum bilgisi ana süreçten sonradan gelir
function recoveryRow() {
  const hint = h('small', null, 'Kontrol ediliyor…');
  const btn = h('button', { class: 'btn' }, icon('key', 14), 'Kurtarma anahtarı oluştur');
  let has = false;
  const refresh = () => window.api.vault.hasRecovery().then((v) => {
    has = v;
    hint.textContent = v ? 'Oluşturuldu. Parolanızı unutursanız kilit ekranında "Parolamı unuttum" deyip bu anahtarı girin.' : 'Oluşturulmadı! Parolanızı unutursanız verilerinize ulaşamazsınız.';
    hint.style.color = v ? '' : 'var(--danger)';
    btn.lastChild.textContent = v ? 'Yeni anahtar oluştur' : 'Kurtarma anahtarı oluştur';
    btn.classList.toggle('primary', !v);
  });
  btn.addEventListener('click', async () => {
    if (await regenerateRecoveryKey(has)) refresh();
  });
  refresh();
  return h('div', { class: 'setting-row' }, h('div', { class: 'label' }, 'Kurtarma anahtarı', hint), h('div', { class: 'control' }, btn));
}

async function changePassword() {
  const v = await formDialog({
    title: 'Ana parolayı değiştir',
    submitLabel: 'Değiştir',
    fields: [
      { name: 'old', label: 'Mevcut parola', type: 'password', required: true },
      { name: 'pw', label: 'Yeni parola', type: 'password', required: true, hint: 'En az ' + MIN_PASSWORD + ' karakter; 4 haneli PIN de olur' },
      { name: 'pw2', label: 'Yeni parola (tekrar)', type: 'password', required: true },
    ],
    validate: (x) => (x.pw.length < MIN_PASSWORD ? 'Yeni parola en az ' + MIN_PASSWORD + ' karakter olmalı' : x.pw !== x.pw2 ? 'Yeni parolalar eşleşmiyor' : null),
    onSubmit: (x) => window.api.vault.changePassword(x.old, x.pw),
  });
  if (v) toast('Ana parola değiştirildi', 'success');
}

async function exportBackup() {
  try {
    const p = await window.api.vault.exportBackup();
    if (p) toast('Yedek kaydedildi: ' + p, 'success', 5000);
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function importBackup() {
  if (!(await confirmDialog('Mevcut tüm hostlar, anahtarlar ve ayarlar yedekteki verilerle değiştirilecek.', { title: 'Yedekten geri yükle', okLabel: 'Devam et', danger: true }))) return;
  const pw = await promptDialog({ title: 'Yedeğin parolası', message: 'Yedeği oluştururken kullanılan ana parolayı veya kurtarma anahtarını girin.', secret: true });
  if (pw == null) return;
  try {
    const ok = await window.api.vault.importBackup(pw);
    if (ok) {
      await reload();
      toast('Yedek geri yüklendi', 'success');
    }
  } catch (err) {
    toast('Geri yüklenemedi: ' + err.message, 'error', 6000);
  }
}

export { passwordInput };
