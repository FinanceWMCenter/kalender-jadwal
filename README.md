# Calendar

Kalender interaktif bergaya Google Calendar untuk mengelola empat jenis jadwal:

| Kategori | Warna |
|---|---|
| Pembayaran Sewa Kantor | Coral pastel |
| Pembayaran Rutin | Kuning/gold pastel |
| Jadwal Meeting | Biru pastel |
| Task & Report | Ungu pastel |
| Status selesai/lunas | Sage green pastel |

Aplikasi ini murni HTML, CSS, dan JavaScript tanpa framework atau build step, sehingga bisa langsung di-hosting di GitHub Pages.

## Struktur proyek

```
kalender/
├── index.html        Struktur halaman, navbar, sidebar, dan modal
├── style.css         Tema pastel, layout, dan tampilan responsif
├── app.js            Logika kalender, CSV, pengingat, dan localStorage
├── contoh-data.csv   File contoh untuk mencoba fitur Upload CSV
└── README.md
```

## Menjalankan di VS Code

1. Buka folder `kalender` lewat **File → Open Folder**.
2. Pasang ekstensi **Live Server** (Ritwick Dey) dari panel Extensions.
3. Klik kanan `index.html` → **Open with Live Server**. Aplikasi terbuka di `http://127.0.0.1:5500`.

Membuka `index.html` langsung dengan klik dua kali juga bisa, tetapi notifikasi browser hanya berjalan di `http://localhost` atau `https://` (termasuk GitHub Pages).

## Fitur

- Tampilan **Month / Week / Day**, tombol **Today**, panah navigasi, dan pemilih bulan-tahun.
- Sidebar kiri yang bisa dilipat: tombol **Create** dan **Upload CSV**, kalender kecil, filter **My Calendars**, ringkasan tagihan bulan berjalan, dan menu kelola data.
- Sidebar kanan yang bisa dilipat: tab **Pengingat** (H-30 sampai Hari-H, termasuk yang terlambat) dan tab **Detail** event.
- Checkbox di setiap event. Saat dicentang, status menjadi Selesai/Lunas, teks tercoret, dan warna berubah ke sage green. Status tersimpan permanen di `localStorage`.
- Event berulang (mingguan, bulanan, tahunan). Tanggal 31 otomatis menyesuaikan ke akhir bulan pada bulan yang lebih pendek.
- Seret event untuk memindahkan tanggal atau jam. Seret file CSV ke halaman untuk mengimpor.
- Notifikasi browser opsional pada H-30, H-14, H-7, H-3, H-1, dan Hari-H.
- Ekspor semua data ke CSV sebagai cadangan, lalu impor kembali di browser atau perangkat lain.

Pintasan keyboard: `T` hari ini, `M` `W` `D` ganti tampilan, `←` `→` geser periode, `C` buat event, `Esc` tutup popover.

## Format CSV

Header yang dibaca (urutan bebas, huruf besar/kecil tidak berpengaruh):

| Kolom | Wajib | Contoh nilai yang diterima |
|---|---|---|
| `No` | Tidak | `1` (hanya untuk penanda baris di pratinjau) |
| `Kategori` | Ya | `Pembayaran Sewa Kantor`, `Pembayaran Rutin`, `Jadwal Meeting`, `Task & Report`, atau kata kunci seperti `sewa`, `rutin`, `rapat`, `laporan` |
| `Judul` | Ya | `Sewa Gedung Kantor Pusat` |
| `Tanggal_Jatuh_Tempo` | Ya | `2026-11-05`, `05/11/2026`, `05-11-2026`, `5 Nov 2026`, `5 November 2026`, bisa ditambah jam: `2026-11-05 14:00` |
| `Nominal_IDR` | Tidak | `25000000`, `Rp 25.000.000`, `25,000,000`, `1,5jt` |
| `Durasi` | Tidak | kosong atau `Sepanjang hari`, `10:00-11:30`, `09:00 (45 menit)`, `60 menit`, `1,5 jam`, `1 jam 30 menit` |
| `Catatan` | Tidak | teks bebas |
| `Status` | Tidak | `Lunas`, `Selesai`, `Belum` (dipakai saat impor ulang hasil ekspor) |

Pemisah koma, titik koma (format Excel Indonesia), dan tab dikenali otomatis. Tanggal berformat `DD/MM/YYYY` dibaca sebagai hari/bulan/tahun.

### Anti-duplikasi

Sebuah baris dianggap duplikat jika **kategori + judul + tanggal + jam mulai + nominal** sama persis dengan event yang sudah ada, atau dengan baris lain di file yang sama. Perbedaan huruf besar/kecil dan spasi ganda pada judul diabaikan. Sebelum impor, aplikasi menampilkan pratinjau berisi status setiap baris: **Baru**, **Duplikat** (dilewati otomatis), atau **Error** (beserta alasannya). Pemeriksaan yang sama juga berjalan saat menambah event lewat form.

## Tentang penyimpanan data

Data disimpan di `localStorage` browser masing-masing pengguna. Artinya:

- Kode di repository bersifat publik, tetapi **data jadwal dan nominal Anda tidak ikut terunggah** dan tidak bisa dilihat orang lain yang membuka link GitHub Pages.
- Setiap browser dan perangkat punya datanya sendiri. Gunakan **Ekspor semua ke CSV** lalu **Upload CSV** untuk memindahkan data.
- Menghapus data situs atau cache browser akan menghapus jadwal. Ekspor CSV secara berkala sebagai cadangan.

## Publikasi ke GitHub Pages

### Persiapan sekali saja

1. Buat akun di [github.com](https://github.com) jika belum punya.
2. Pasang Git dari [git-scm.com](https://git-scm.com/downloads), lalu buka ulang VS Code.
3. Atur identitas Git di Terminal VS Code (**Terminal → New Terminal**):

```bash
git config --global user.name "Nama Anda"
git config --global user.email "email@anda.com"
```

### Cara A: lewat tombol di VS Code (paling mudah)

1. Buka panel **Source Control** (ikon cabang di sidebar kiri, atau `Ctrl+Shift+G`).
2. Klik **Publish to GitHub**.
3. Masuk ke akun GitHub saat diminta, lalu pilih **Publish to GitHub public repository**.
4. Beri nama repository, misalnya `kalender-jadwal`, dan pastikan semua file tercentang.
5. VS Code membuat repository dan mengunggah semua file secara otomatis.

### Cara B: lewat terminal

1. Buat repository kosong di GitHub: klik **+ → New repository**, isi nama `kalender-jadwal`, pilih **Public**, lalu **jangan** centang "Add a README".
2. Jalankan perintah ini di Terminal VS Code dari dalam folder proyek (ganti `USERNAME` dengan username GitHub Anda):

```bash
git init
git add .
git commit -m "Kalender interaktif: versi awal"
git branch -M main
git remote add origin https://github.com/USERNAME/kalender-jadwal.git
git push -u origin main
```

Saat `git push` pertama kali, VS Code akan meminta login GitHub lewat browser.

### Mengaktifkan GitHub Pages

1. Buka repository di GitHub, lalu klik **Settings**.
2. Pilih **Pages** di menu kiri.
3. Pada **Build and deployment → Source**, pilih **Deploy from a branch**.
4. Pada **Branch**, pilih `main` dan folder `/ (root)`, lalu klik **Save**.
5. Tunggu 1 sampai 2 menit, lalu muat ulang halaman Settings → Pages. Link aplikasi muncul di bagian atas:

```
https://USERNAME.github.io/kalender-jadwal/
```

Link ini bisa dibuka siapa saja.

### Memperbarui aplikasi

Setelah mengubah kode:

```bash
git add .
git commit -m "Jelaskan perubahan di sini"
git push
```

Atau lewat panel Source Control: tulis pesan, klik **Commit**, lalu **Sync Changes**. GitHub Pages memperbarui situs dalam 1 sampai 2 menit.

## Kustomisasi cepat

- **Awal minggu**: ubah `WEEK_START` di bagian atas `app.js` (`0` = Minggu, `1` = Senin).
- **Rentang pengingat**: ubah `REMINDER_DAYS` dan `NOTIFY_MILESTONES` di `app.js`.
- **Nama dan warna kategori**: label ada di objek `CATEGORIES` di `app.js`, warna ada di kelas `.cat-sewa`, `.cat-rutin`, `.cat-meeting`, `.cat-task` di `style.css`.
- **Data contoh**: saat pertama dibuka, aplikasi memuat data contoh. Hapus lewat **Hapus semua data**, atau kosongkan isi fungsi `sampleEvents()` jika tidak ingin ada data contoh sama sekali.
