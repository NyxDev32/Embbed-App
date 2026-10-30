# Update Announcer untuk Discord

Aplikasi web (Flask + HTML/CSS/JS) untuk mengumumkan update script/source code ke Discord sebagai embed lengkap dengan changelog dan video.

## Struktur
```
index.html        # tampilan
style.css         # dark theme
script.js         # preview, validasi, kirim, history
app.py            # backend Flask
requirements.txt
history.json      # dibuat otomatis setelah pesan pertama terkirim
```

## Cara menjalankan
```bash
python -m venv venv
venv\Scripts\activate        # Windows  (Linux/Mac: source venv/bin/activate)
pip install -r requirements.txt
python app.py
```
Buka http://127.0.0.1:5000

## Fitur embed
- Changelog berkelompok otomatis lewat prefix: `+` Added, `!` Fixed, `*` Changed, `-` Removed (tanpa prefix = Changes). Bisa dimatikan.
- Info tambahan format `Kunci: nilai` tampil sejajar (Game, Status, Platform, dst).
- Author + icon, thumbnail, gambar besar, footer, warna, timestamp, link download, dan link/upload video.
- Preview dirender dari backend yang sama dengan pengiriman, jadi hasilnya sama persis. Ada penghitung batas 6000 karakter.

## Tampilan
- Font (Orbitron, Exo 2, JetBrains Mono) dimuat dari Google Fonts, jadi butuh internet. Untuk offline/APK, unduh fontnya dan ganti `@font-face`.
- Latar berupa video anime. Sumbernya `bg.mp4` di folder ini kalau ada, kalau tidak dipakai link catbox. Untuk hasil terbaik dan jalan offline (termasuk APK), unduh videonya lalu simpan sebagai `bg.mp4`.
- Gambar `bg.jpg` dipakai sebagai latar cadangan bila video gagal dimuat.

## Cara pakai
1. **Webhook** (paling mudah): Server Settings → Integrations → Webhooks → New Webhook → Copy Webhook URL.
   **Bot**: buat bot di Developer Portal, undang ke server (izin *Send Messages*, *Embed Links*, *Attach Files*), lalu isi token dan Channel ID.
2. Isi judul, versi, deskripsi, changelog (satu perubahan per baris), dan link video atau upload file.
3. Cek preview di kanan, lalu klik **Kirim ke Discord**.

## Catatan
- Link YouTube otomatis tampil sebagai player karena ditaruh di luar embed. Embed Discord tidak bisa memutar video langsung.
- Link Google Drive hanya tampil sebagai link (pastikan akses "Anyone with the link").
- Upload file dibatasi 10 MB (batas default Discord). Ubah dengan `MAX_UPLOAD_MB=25 python app.py` hanya jika server Anda mengizinkan.
- Token/webhook tidak disimpan di server dan tidak masuk history. Opsi "Ingat" menyimpannya di localStorage browser Anda saja.
- Jangan membagikan webhook URL atau token bot ke siapa pun.
