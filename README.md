# POC — Sales Visit & Due Invoice Tracker

Demo untuk mempertemukan jadwal kunjungan salesman (PJP) dengan piutang toko (ROVI), supaya
salesman tahu toko mana di rute hari ini yang punya faktur **jatuh tempo hari ini** atau **overdue**.

POC ini tanpa backend, database, dan login. Semua berjalan di browser; data disimpan di memory + `localStorage`.
Spesifikasi: [docs/PRD_Sales_Visit_Due_Invoice.md](docs/PRD_Sales_Visit_Due_Invoice.md).

## Menjalankan

Butuh Node.js 18+.

```bash
npm install
npm run dev
```

Buka URL yang muncul (biasanya http://localhost:5173):

- **/sales**: tampilan salesman (mobile-first). Pilih salesman dari dropdown (pengganti login).
- **/admin**: upload data, tabel Toko & Faktur, Rute Salesman.

Saat pertama dibuka, aplikasi otomatis memuat `public/Dummy_ROVI_PJP.xlsx` sebagai data awal.
Tanggal default = **9 Nov 2026** (data dummy berisi PJP 9–14 Nov 2026); ganti dengan tombol ‹ › atau date picker.
Tombol **Reset ke data dummy** ada di halaman Admin.

Perintah lain:

```bash
npm test          # unit test + test regresi (Vitest)
npm run build     # typecheck + build produksi ke dist/
```

## Upload data (Admin)

Upload XLSX/CSV per jenis data. Upload **mengganti seluruh** data jenis tersebut.
Header tidak peka huruf besar/kecil. Bila file punya beberapa sheet, sheet yang dipakai adalah yang bernamanya sesuai
(`Master_Toko`, `ROVI`, `PJP`), atau sheet pertama. Jadi file `Dummy_ROVI_PJP.xlsx` bisa langsung diupload ke ketiganya.

| Data | Kolom wajib | Opsional |
|---|---|---|
| Master Toko | kode_salesman, nama_salesman, kode_toko, nama_toko | salesman_bw, area |
| ROVI | kode_toko, nama_toko, no_faktur, tanggal_faktur, tanggal_jatuh_tempo, nilai_faktur, sisa_tagihan | |
| PJP | kode_salesman, nama_salesman, tanggal_kunjungan, kode_toko | hari, nama_toko, urutan |

- Tanggal: tanggal Excel, `YYYY-MM-DD`, atau `D/M/YYYY`. Uang: bilangan bulat rupiah (`1250000` / `1.250.000`).
- Kolom wajib hilang → file ditolak. Baris tidak valid ditampilkan (nomor baris Excel + alasan);
  pilih **Simpan baris valid saja** atau **Batal**. `no_faktur` duplikat dianggap error.
- Warning (tidak memblokir): kode toko PJP yang tidak ada di ROVI atau Master, dan kode toko ROVI yang tidak ada di Master.

## Aturan bisnis

Semua logika ada di satu tempat: [src/lib/billing.ts](src/lib/billing.ts). Untuk tanggal kunjungan D:

- Faktur aktif hanya jika `sisa_tagihan > 0`.
- **Overdue** jika jatuh tempo < D (hari terlambat = D − jatuh tempo); **Jatuh Tempo Hari Ini** jika = D; **Belum JT** jika > D.
- Toko **Perlu Ditagih** jika punya ≥1 faktur Overdue / JT hari ini. Total harus ditagih = jumlah `sisa_tagihan` keduanya.
- Join PJP ↔ ROVI memakai `kode_toko` (trim + huruf besar), **tidak** memakai nama toko.
- Urutan default: perlu ditagih → hari overdue terbesar → punya JT hari ini → urutan rute. Toggle "Urutan rute" = murni urutan.

Tanggal bisnis disimpan sebagai string `YYYY-MM-DD` (tanpa jam/timezone). "Hari ini" = tanggal Asia/Jakarta.

## Struktur

```
src/lib/       logika murni + test (billing, dates, parse, upload, format)
src/components tampilan bersama (KunjunganPanel, DetailTokoView, ui)
src/pages      SalesPage, AdminPage
docs/          PRD + Dummy_ROVI_PJP.xlsx (dipakai test regresi)
public/        Dummy_ROVI_PJP.xlsx (data awal aplikasi)
```

Test regresi ([src/lib/regression.test.ts](src/lib/regression.test.ts)) membaca `docs/Dummy_ROVI_PJP.xlsx` dan memastikan
hasil untuk SLS01 pada 2026-11-09 sama persis dengan sheet `Contoh_Output_Sales` dan `Contoh_Detail_Toko`.
