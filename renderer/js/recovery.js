// Kurtarma anahtarı: gösterme, parolayı unutunca kurtarma, son çare olarak kasayı sıfırlama.
import { h, icon, modal, toast, confirmDialog, promptDialog, passwordInput, copyText } from './ui.js';

export const MIN_PASSWORD = 4;

/** Kurtarma anahtarını gösterir; kullanıcı kaydettiğini onaylayınca çözülür. */
export function showRecoveryKey(key, { title = 'Kurtarma anahtarınız' } = {}) {
  return new Promise((resolve) => {
    const check = h('input', { type: 'checkbox', id: 'rk-ok', onchange: () => (next.disabled = !check.checked) });
    const next = h('button', { type: 'button', class: 'btn primary', disabled: true, onclick: () => m.close() }, 'Devam');
    const m = modal({
      title,
      onClose: () => resolve(),
      body: [
        h('p', null, 'Ana parolanızı unutursanız kasanızı bu anahtarla açıp yeni parola belirleyebilirsiniz. Anahtar yalnızca şimdi gösterilir; kaydedin veya bir kâğıda yazın.'),
        h('div', { class: 'recovery-key' }, key),
        h('div', { style: { display: 'flex', gap: '8px', marginBottom: '14px' } },
          h('button', { type: 'button', class: 'btn', onclick: () => copyText(key, 'Kurtarma anahtarı kopyalandı') }, icon('copy', 14), 'Kopyala'),
          h('button', { type: 'button', class: 'btn', onclick: async () => {
            const p = await window.api.vault.saveRecoveryKey(key);
            if (p) toast('Kaydedildi: ' + p, 'success', 4000);
          } }, icon('download', 14), 'Dosyaya kaydet')),
        h('div', { class: 'warn-box', style: { fontSize: '12px' } }, 'Bu anahtarı bilen herkes kasanızı açabilir. Bilgisayarınızdan ayrı, güvenli bir yerde saklayın.'),
        h('div', { class: 'field check' }, check, h('label', { for: 'rk-ok' }, 'Kurtarma anahtarını güvenli bir yere kaydettim')),
        h('div', { class: 'modal-foot', style: { padding: '8px 0 4px' } }, next),
      ],
    });
  });
}

/**
 * "Parolamı unuttum" akışı.
 * @returns {Promise<'recovered'|'reset'|null>}
 */
export function forgotPassword() {
  return new Promise((resolve) => {
    let result = null;
    const keyInput = h('input', { class: 'input mono', placeholder: 'ABCD-EFGH-JKLM-NPQR-STUV-WXYZ', spellcheck: 'false', autocomplete: 'off', autofocus: true });
    const pw = passwordInput({ placeholder: 'Yeni ana parola veya PIN' });
    const pw2 = passwordInput({ placeholder: 'Yeni ana parola (tekrar)' });
    const err = h('div', { class: 'warn-box', style: { display: 'none' } });
    const fail = (msg) => {
      err.textContent = msg;
      err.style.display = '';
    };
    let busy = false;
    const m = modal({
      title: 'Parolamı unuttum',
      onClose: () => resolve(result),
      body: [
        h('p', null, 'Kasayı oluştururken verilen kurtarma anahtarını girin ve yeni bir ana parola belirleyin. Verileriniz korunur.'),
        err,
        h('div', { class: 'field' }, h('label', null, 'Kurtarma anahtarı'), keyInput),
        h('div', { class: 'field' }, h('label', null, 'Yeni ana parola'), pw, h('div', { class: 'hint' }, `En az ${MIN_PASSWORD} karakter; 4 haneli PIN de olur.`)),
        h('div', { class: 'field' }, h('label', null, 'Yeni ana parola (tekrar)'), pw2),
        h('button', { type: 'button', class: 'link-btn', onclick: async () => {
          if ((await resetVault()) === 'reset') {
            result = 'reset';
            m.close();
          }
        } }, 'Kurtarma anahtarım yok'),
      ],
      actions: [
        { label: 'Vazgeç', onClick: (close) => close() },
        { label: 'Parolayı sıfırla', primary: true, submit: true, onClick: async (close) => {
          if (busy) return;
          const a = pw.querySelector('input').value;
          if (!keyInput.value.trim()) return fail('Kurtarma anahtarını girin');
          if (a.length < MIN_PASSWORD) return fail(`Yeni parola en az ${MIN_PASSWORD} karakter olmalı`);
          if (a !== pw2.querySelector('input').value) return fail('Yeni parolalar eşleşmiyor');
          busy = true;
          try {
            await window.api.vault.recover(keyInput.value, a);
            result = 'recovered';
            toast('Yeni ana parolanız belirlendi', 'success');
            close();
          } catch (e) {
            fail(e.message);
            busy = false;
          }
        } },
      ],
    });
  });
}

// Son çare: kasayı silip baştan başlamak
async function resetVault() {
  const ok = await confirmDialog(
    'Kurtarma anahtarı olmadan şifreli verileriniz açılamaz. Tek seçenek kasayı sıfırlayıp baştan başlamak: tüm hostlar, parolalar, SSH anahtarları ve ayarlar silinir.\n\nDaha önce aldığınız bir yedek (.termify) varsa, yeni kasa oluşturduktan sonra Ayarlar > Yedekten geri yükle ile verilerinizi geri getirebilirsiniz (yedeğin parolası gerekir).',
    { title: 'Kasa sıfırlansın mı?', okLabel: 'Devam et', danger: true });
  if (!ok) return null;
  const typed = await promptDialog({ title: 'Son onay', message: 'Onaylamak için büyük harflerle SIFIRLA yazın.', placeholder: 'SIFIRLA', okLabel: 'Kasayı sıfırla' });
  if ((typed || '').trim() !== 'SIFIRLA') {
    if (typed != null) toast('Onay metni eşleşmedi; kasa sıfırlanmadı', 'error');
    return null;
  }
  await window.api.vault.reset();
  return 'reset';
}

/** Kurtarma anahtarı olmayan (eski) kasalar için açılıştan sonra öneri. */
export async function offerRecoveryKey() {
  const ok = await confirmDialog('Kasanız için henüz kurtarma anahtarı yok. Ana parolanızı unutursanız verilerinize ulaşamazsınız. Şimdi bir kurtarma anahtarı oluşturmanızı öneririz.', { title: 'Kurtarma anahtarı oluşturun', okLabel: 'Şimdi oluştur' });
  if (!ok) return;
  await showRecoveryKey(await window.api.vault.newRecoveryKey());
}

/** Ayarlar'dan yeni anahtar üretme (eskisi geçersiz olur). */
export async function regenerateRecoveryKey(hasOld) {
  if (hasOld && !(await confirmDialog('Yeni bir kurtarma anahtarı oluşturulacak. Eski anahtarınız artık çalışmaz.', { title: 'Yeni kurtarma anahtarı', okLabel: 'Oluştur' }))) return false;
  await showRecoveryKey(await window.api.vault.newRecoveryKey(), { title: 'Yeni kurtarma anahtarınız' });
  return true;
}
