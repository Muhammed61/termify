<p align="center">
  <img src="renderer/assets/logo.svg" width="120" alt="Termify logosu" />
</p>

<h1 align="center">Termify</h1>

<p align="center">
  Türkçe arayüzlü, modern bir masaüstü SSH istemcisi.<br />
  Terminal, SFTP, port yönlendirme ve anahtar yönetimi tek uygulamada.
</p>

<p align="center">
  <a href="https://github.com/Muhammed61/termify-releases/releases/latest"><b>⬇ Windows için indir (Setup .exe)</b></a>
</p>

![Hostlar](docs/hostlar.png)

## Kurulum

[Releases](https://github.com/Muhammed61/termify-releases/releases/latest) sayfasından `Termify-Setup-x.y.z.exe` dosyasını indirip çalıştırın. Kurulum dosyası imzasız olduğu için Windows SmartScreen uyarı verebilir: **Ek bilgi → Yine de çalıştır** deyin.

İlk açılışta bir **ana parola** belirlersiniz. Tüm hostlarınız, parolalarınız ve anahtarlarınız bu parolayla şifrelenir.

## Özellikler

- **Şifreli kasa:** Her şey ana parolayla AES-256-GCM (scrypt) ile şifrelenir. Belirlenen süre boşta kalınca otomatik kilitlenir.
- **Hostlar:** Gruplar, etiketler, renkler, arama. Hızlı bağlan (`kullanici@sunucu:port`), atlama sunucusu (ProxyJump) ve başlangıç komutu desteklenir.
- **Terminal:** Sekmeler, dikey/yatay bölme (4 panele kadar), yayın modu (tüm panellere aynı anda yazma), arama, 8 renk teması. Bağlantı koparsa Enter ile yeniden bağlanır.
- **SFTP:** Çift panel (bilgisayar ↔ sunucu), sürükle-bırak (Windows Gezgini'nden de), klasör aktarımı, ilerleme çubuğu, uzak dosya düzenleme, izin değiştirme.
- **Anahtarlar:** Ed25519/RSA/ECDSA anahtar üretme, içe aktarma, tek tıkla sunucuya yükleme (`ssh-copy-id` gibi).
- **Port yönlendirme:** Yerel (-L), uzak (-R) ve dinamik SOCKS5 (-D) tüneller.
- **Snippet'ler:** Sık kullanılan komutları kaydedip terminalde tek tıkla çalıştırma.
- **Bilinen hostlar:** Sunucu parmak izi doğrulama; parmak izi değişirse uyarı.
- **Yedekleme ve eşitleme:** Şifreli `.termify` yedek dosyası. Dosyayı Google Drive/OneDrive klasörüne koyup başka bilgisayarda içe aktarabilirsiniz.

| Terminal (bölünmüş ekran) | Port yönlendirme |
|---|---|
| ![Terminal](docs/terminal.png) | ![Tüneller](docs/tuneller.png) |

| Anahtarlar | Ayarlar ve temalar |
|---|---|
| ![Anahtarlar](docs/anahtarlar.png) | ![Ayarlar](docs/ayarlar.png) |

## Geliştirme

```
npm install
npm start
```

Ya da `baslat.bat` dosyasına çift tıklayın. Kurulum dosyası üretmek için `npm run dist` çalıştırın (çıktı `dist/` klasörüne gelir).

Sürüm yayınlamak için `package.json` içindeki sürümü artırıp aynı adla etiket gönderin (ör. `v1.0.2`). GitHub Actions kurulum dosyasını derleyip public [termify-releases](https://github.com/Muhammed61/termify-releases) deposuna yükler; kurulu uygulamalar yeni sürümü kendiliğinden bulur. Bunun için bu depoda `RELEASES_TOKEN` secret tanımlı olmalı (termify-releases için Contents: Read and write).

### Klasör yapısı

- `main.js`: Electron ana süreç ve IPC
- `preload.js`: Arayüze açılan güvenli API
- `src/main/`: Kasa, SSH bağlantısı, oturumlar/SFTP, port yönlendirme, anahtarlar
- `renderer/`: Arayüz (HTML/CSS/JS modülleri)

Veriler `%APPDATA%\Termify\kasa.json` dosyasında şifreli olarak saklanır.

Electron, xterm.js ve ssh2 ile geliştirildi.
