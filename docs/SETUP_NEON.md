# Setup database (Neon) + deploy Netlify + seed data

Panduan ini membuat aplikasi memakai **database server**. Upload dan edit data di Admin lalu tersimpan di Neon dan otomatis dipakai aplikasi sales di semua HP. Semua layanan memakai paket **gratis**.

Waktu: ±10 menit. Yang dibutuhkan: akun Netlify (situs ini sudah ter-deploy dari GitHub) dan email untuk daftar Neon. Tidak perlu PIN/token admin.

---

## 1. Buat database di Neon

1. Buka **https://neon.tech** → **Sign up** (bisa pakai akun GitHub/Google). Paket *Free* sudah cukup.
2. Klik **Create project**:
   - **Project name**: `sales-poc`
   - **Postgres version**: biarkan default
   - **Region**: **AWS Asia Pacific (Singapore)**, karena paling dekat ke Indonesia
   - **Database name**: `neondb` (default)
3. Setelah project jadi, di **Dashboard → Connect**:
   - Pilih **Branch** `main` dan **Database** `neondb`.
   - Aktifkan **Connection pooling** (pooled).
   - Salin **connection string**. Bentuknya:
     ```
     postgresql://neondb_owner:xxxxxxxx@ep-xxxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
     ```
   - Simpan string ini dan **jangan di-commit ke git** (anggap seperti password).
4. *(Opsional)* Buka **SQL Editor** di Neon, tempel isi [`db/schema.sql`](../db/schema.sql), lalu klik **Run**. Langkah ini boleh dilewati, karena tabel `dataset` juga dibuat otomatis saat API pertama kali dipakai.

> **Alternatif lebih cepat:** di Netlify buka **Extensions → Neon → Install**, lalu hubungkan ke site ini. Netlify membuat database dan mengisi env `NETLIFY_DATABASE_URL` secara otomatis, sehingga langkah 1 di atas dan pengisian `DATABASE_URL` di langkah 2 tidak perlu.

## 2. Isi environment variable di Netlify

Netlify → pilih site → **Site configuration → Environment variables → Add a variable**:

| Key | Value | Keterangan |
|---|---|---|
| `DATABASE_URL` | connection string dari langkah 1.3 | Tidak perlu bila memakai Extension Neon (`NETLIFY_DATABASE_URL`). |
| `SUPERADMIN_EMAIL` | email Super Admin | Akun dibuat otomatis bila belum ada. |
| `SUPERADMIN_PASSWORD` | password Super Admin | Disamakan dengan env setiap deploy/start (kunci login juga dibuka) **selama belum diganti/di-reset dari aplikasi**. Setelah diganti di aplikasi, env tidak menimpa lagi. |

Scope: *All scopes*. Context: *All deploy contexts* (atau minimal *Production*).

## 3. Deploy

- Push ke branch yang terhubung ke Netlify (`git push origin main`). Netlify otomatis membangun web dan **function** `netlify/functions/data.mts`.
- Bila env diubah setelah deploy terakhir: **Deploys → Trigger deploy → Deploy site**, karena env baru berlaku setelah deploy ulang.

Cek API: buka `https://<site-anda>.netlify.app/api/data/meta`

- `{"ok":true,"data":{}}` → tersambung, DB masih kosong. Lanjut ke langkah 4.
- `503 … Database belum dikonfigurasi` → `DATABASE_URL`/`NETLIFY_DATABASE_URL` belum terbaca. Cek langkah 2, lalu deploy ulang.
- Halaman HTML (bukan JSON) → function belum ter-deploy. Cek log build: harus ada bagian *Functions bundling* yang menyebut `data`.

## 3b. Login pertama & akun pengguna

1. Buka `https://<site>/` → halaman **Login** → tab **Admin** → masuk dengan `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` (persis seperti di env, boleh berisi `#`/`$`).
2. **Pengguna & Peran** (sidebar → Pengguna):
   - **Peran & Akses**: pilih peran, centang Tambah/Lihat/Ubah/Hapus per menu, lalu Simpan. Peran bawaan: Super Admin (terkunci, semua akses), Admin, Supervisor, Sales GT, Sales MT. Peran baru bisa ditambah.
   - **Pengguna → Buat akun N salesman**: membuat akun untuk semua SR di Master Store (PIN awal acak). **Unduh daftar PIN** (hanya tampil sekali) lalu bagikan ke tiap SR. SR login dengan **kode SR + PIN** dan wajib mengganti PIN saat login pertama.
   - **Tambah pengguna**: akun admin/supervisor (email + password). Atur **lingkup salesman** bila hanya boleh melihat SR tertentu.
3. Semua API sekarang wajib login. Izin dicek di server (bukan hanya disembunyikan di layar). Perubahan data, login, dan pengelolaan pengguna tercatat di **Log aktivitas admin** (halaman Pengguna).

Tabel `peran`, `pengguna`, `sesi`, `batas_login`, `audit` dibuat otomatis.

## 4. Seed data awal (supaya tidak kosong)

Seed mengisi DB dengan data yang sekarang dipakai aplikasi (`docs/Dummy_ROVI_PJP.xlsx`):
- Customer Master, PJP, dan DI AWAL asli MD DC Bandung
- SKU dan MOQ dari Min SKU NEFOKAM
- MT, histori, dan price list dummy

Secara **default seed hanya mengisi jenis data yang belum ada di server**, jadi data hasil upload atau edit admin tidak tertimpa.

Pilih salah satu cara:

**A. Dari dashboard (paling mudah)**
1. Buka `https://<site>/admin/data`. Banner hijau harus berbunyi **"Tersambung ke server"**.
2. (Login sebagai Super Admin/Admin dulu.) Klik **Seed server (8 jenis)**, lalu konfirmasi. Tunggu toast *"Seed selesai"*. Setiap kartu kemudian berlabel **Server · v1**.


**C. Dari terminal, langsung ke Neon** (tanpa perlu deploy dulu)
```bash
# buat file .env (sudah di-.gitignore):
#   DATABASE_URL=postgresql://...neon.tech/neondb?sslmode=require
npm run seed
```

Opsi tambahan:
- `--only=rules,produk`: hanya jenis tertentu (`master, rovi, pjp, produk, rules, histori, msl, price`).
- `--force`: **timpa** data yang sudah ada di server.
- `--file=path.xlsx`: seed dari file lain dengan format sheet yang sama.

Contoh output:
```
Sumber: docs/Dummy_ROVI_PJP.xlsx → Neon (DATABASE_URL)
  ✓ master     1.434 baris → v1
  ✓ rovi         573 baris → v1
  ✓ pjp        2.243 baris → v1
  ✓ produk        62 baris → v1
  ✓ rules         62 baris → v1
  ✓ histori   20.243 baris → v1
  ✓ msl        1.212 baris → v1
  ✓ price        124 baris → v1
Seed selesai.
```

Cek di Neon SQL Editor:
```sql
SELECT tipe, jumlah, version, updated_at FROM dataset ORDER BY tipe;
SELECT jenis, count(*) FROM aktivitas GROUP BY jenis;   -- PO, penagihan, stok, kunjungan dari HP sales
```

## 5. Pakai sehari-hari

- **Admin → Master Data → (submenu)**: lihat list, cari, **tambah, edit, atau hapus per baris** (langsung tersimpan, tanpa PIN).
- **Admin → Data & Upload**: ganti satu jenis data sekaligus dari file Excel. Store/PJP GT dan MT dipisah.
- HP sales mengambil pembaruan **tiap 60 detik** dan setiap kali aplikasi dibuka, lalu menampilkan toast *"Data diperbarui admin"*.
- **Aktivitas sales** (PO, penagihan, cek stok, status kunjungan) juga tersimpan di database (tabel `aktivitas`, dibuat otomatis lewat `/api/aktivitas`). Dashboard admin di perangkat mana pun ikut terbarui ±15 detik. Saat HP offline, data disimpan di HP lalu dikirim otomatis begitu online.
- Nomor PO: `PO/YYYY/MM/<kode SR>-NNNN`, unik lintas perangkat.
- **Reset aktivitas** (Data & Upload) menghapus semua aktivitas di database, dan semua perangkat ikut kosong.
- **Reset ke data dummy** (Data & Upload) menghapus semua data di server. Untuk mengisinya lagi, jalankan seed ulang.

## Troubleshooting

| Gejala | Penyebab & solusi |
|---|---|
| **Lupa password/PIN** | Admin → Pengguna → ikon kunci (Reset). Password/PIN sementara tampil sekali; wajib diganti saat login. |
| **"Terlalu banyak percobaan"** | 5× salah dalam 15 menit → akun dikunci 15 menit. Reset PIN oleh admin juga membuka kunci. |
| **"Tidak punya akses ke menu ini"** | Peran pengguna belum diberi izin Lihat. Atur di Peran & Akses. |
| Super Admin tidak bisa login / terkunci | Pastikan `SUPERADMIN_*` terisi, lalu deploy ulang (lokal: restart `npm run dev`) — password disamakan dengan env & kunci dibuka. Bila password sudah pernah diganti di aplikasi, env tidak berlaku lagi: minta Super Admin lain reset, atau hapus barisnya di tabel `pengguna` lalu deploy ulang. |
| Banner kuning **"Mode lokal"** | API tidak terjangkau atau DB belum diset. Cek `/api/data/meta` (langkah 3). |
| **"Gagal menyimpan, perubahan dibatalkan"** | Baris itu sudah diubah/dihapus admin lain. List dimuat ulang otomatis; ulangi edit. |
| **"Body bukan JSON yang valid"** saat upload | Sudah diperbaiki di v11 (body gzip kini dikirim sebagai biner, dan bila ditolak otomatis diulang tanpa gzip). Pastikan versi terbaru sudah di-deploy. |
| Upload file besar gagal | Batas body Netlify ±6 MB setelah gzip per jenis data. Pecah file atau kurangi kolom. |
| Neon "compute suspended" | Normal di paket gratis (tidur saat idle). Request pertama sedikit lebih lambat. |

## Dev lokal

Isi `DATABASE_URL` (dan `SUPERADMIN_EMAIL`/`SUPERADMIN_PASSWORD` untuk akun pertama) di file `.env` (lihat `.env.example`), lalu:
```bash
npm run dev        # http://localhost:5173 — API /api/data ikut jalan & tersambung ke Neon
```
API dijalankan sebagai middleware Vite (handler yang sama dengan Netlify Function), jadi **tidak perlu netlify CLI**.
`vite preview` juga sama. Tanpa DB: `STORE=memory SUPERADMIN_EMAIL=a@b.c SUPERADMIN_PASSWORD=rahasia-123 npm run dev` (data & akun di memori, hilang saat server restart).
