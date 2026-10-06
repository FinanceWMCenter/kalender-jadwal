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
├── contoh-data.csv   Contoh jadwal sewa (data fiktif) untuk mencoba Upload CSV
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

## Kategori

Empat kategori bawaan selalu tersedia: Pembayaran Sewa Kantor, Pembayaran Rutin, Jadwal Meeting, dan Task & Report. Kategori lain bisa ditambah tanpa batas:

- Klik **+ Tambah kategori** di bawah **My Calendars**, atau **+ Kategori baru** langsung di form **Create**.
- Isi nama, pilih warna, dan centang **Kategori pembayaran** jika kategori itu punya nominal, PPN/PPh, dan status Lunas (misalnya "Pembayaran Vendor"). Tanpa centang, statusnya Selesai seperti meeting.
- Kategori tambahan bisa diedit atau dihapus lewat ikon pensil di sampingnya. Kategori bawaan tidak bisa dihapus.
- Saat impor CSV, kolom `Kategori` yang isinya sama dengan nama kategori tambahan otomatis masuk ke kategori tersebut.

Isian form menyesuaikan kategori: cabang, sub unit, tahap, dan masa sewa hanya muncul untuk Pembayaran Sewa Kantor; PPN/PPh hanya untuk kategori pembayaran.

## Format CSV (bebas)

Tidak ada format khusus. Aplikasi mengenali kolom dari nama header-nya, dan **hanya kolom tanggal yang wajib**. Pemisah koma, titik koma (Excel Indonesia), dan tab dikenali otomatis. Contoh file jadwal sewa yang langsung bisa diunggah:

```
No;Cabang;Sub_Unit;Term_Tahap;Tanggal_Jatuh_Tempo;Nominal_IDR;Durasi_Sewa;Catatan
1;Kantor Pusat;Gedung A;Tahap 1;15/01/2027;120,000,000;01/03/2027 - 29/02/2028;PPN: 13200000 | PPh: 0
2;Kantor Pusat;;Tahap 2;01/12/2027;132,000,000;01/03/2028 - 28/02/2029;PPN: 14520000 | PPh: 0
```

| Isi | Nama kolom yang dikenali | Keterangan |
|---|---|---|
| Tanggal jatuh tempo (wajib) | `Tanggal_Jatuh_Tempo`, `Jatuh_Tempo`, `Tanggal`, `Tgl` | `15/01/2026`, `2026-01-15`, `15 Jan 2026`. Jika nama kolom lain, kolom berisi tanggal tetap dideteksi otomatis. |
| Cabang | `Cabang`, `Lokasi`, `Outlet` | Sel kosong mengikuti baris di atasnya. |
| Sub unit | `Sub_Unit`, `Unit`, `Gedung`, `Entitas` | Sel kosong mengikuti baris di atasnya selama cabangnya sama. |
| Tahap pembayaran | `Term_Tahap`, `Term`, `Tahap`, `Termin` | Mis. `Tahap 1`, `Deposit`, `Periode 2`. |
| Nominal | `Nominal_IDR`, `Nominal`, `Jumlah`, `DPP` | `134,000,000`, `134.000.000`, `Rp 4.750.000,00`, `1,5jt`. |
| Masa sewa | `Durasi_Sewa`, `Masa_Sewa`, `Periode` | Rentang tanggal: `01/03/2026 - 28/02/2027`. |
| PPN / PPh | kolom `PPN`, `PPh`, atau ditulis di Catatan | `PPN: 14740000 \| PPh: 0` di Catatan otomatis dipisah. |
| Kategori | `Kategori` | Opsional. Jika tidak ada, kategori dipilih di layar pratinjau (file berkolom cabang/tahap/masa sewa otomatis menjadi Pembayaran Sewa Kantor). |
| Judul | `Judul` | Opsional. Jika tidak ada, dibuat otomatis: `Sewa Pemuda Gedung A – Tahap 1`. |
| Waktu | `Waktu`, `Jam` | Untuk meeting: `10:00-11:30`, `60 menit`. |
| Catatan, Status | `Catatan`, `Status` | Status `Lunas`/`Selesai`/`Belum`. |

Kolom lain yang tidak dikenali tetap disimpan dan tampil sebagai info tambahan di panel detail.

### Pratinjau sebelum impor

- **Baru**: akan diimpor.
- **Mirip**: tanggal dan nominal sama dengan baris lain di cabang yang sama (mis. baris rekap per entitas). Tidak diimpor kecuali dicentang "Impor juga baris yang mirip".
- **Duplikat**: sudah ada di kalender atau sama persis dengan baris lain, selalu dilewati.
- **Perlu dicek**: tetap diimpor, tetapi ada kejanggalan, misalnya dua jatuh tempo pada tanggal yang sama untuk lokasi dan tahap yang sama dengan nominal berbeda.
- Jika file tidak punya kolom status, jatuh tempo yang sudah lewat otomatis ditandai lunas (bisa dimatikan di pratinjau) agar tidak memenuhi daftar "Terlambat".

### Ekspor

**Ekspor semua ke CSV** menghasilkan file berpemisah titik koma dengan kolom `No;Kategori;Judul;Cabang;Sub_Unit;Term_Tahap;Tanggal_Jatuh_Tempo;Nominal_IDR;PPN;PPh;Masa_Sewa;Waktu;Catatan;Status`, yang bisa langsung diimpor kembali.

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
