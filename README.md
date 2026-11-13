# POC — Sales Visit (GT) + MSL Tracker (MT)

Satu repo, tiga aplikasi (beda route, berbagi data master, modul PO, UI kit, dan admin):

| Aplikasi | Route | Untuk |
|---|---|---|
| **Sales GT** | `/sales` | SR General Trade: rute PJP → **Collection → Cek Stok → PO → Selesai** |
| **Sales MT** | `/mt` | SR Modern Trade: **Input PO → Cek MSL** (warning SKU listed yang belum ditransaksikan > 30 hari, memperhitungkan PO yang sedang dibuat) **→ Summary & Submit PO** |
| **Web Admin** | `/admin` | Supervisor GT & MT (filter channel) |

`/` = halaman pilih aplikasi. Channel ditentukan kolom `channel` (GT/MT) di Master Outlet.

POC ini tanpa backend, database, dan login. Semua berjalan di browser. Input SR disimpan di `localStorage` per perangkat,
dan pengiriman ke ERP disimulasikan dengan export CSV.
Spesifikasi: [docs/PRD_Sales_Visit_Due_Invoice.md](docs/PRD_Sales_Visit_Due_Invoice.md) + dokumen "BISMILLAH PROJECT DEV".

## Menjalankan

Butuh Node.js 18+.

```bash
npm install
npm run dev
```

Buka URL yang muncul (biasanya http://localhost:5173):

| URL | Untuk | Isi |
|---|---|---|
| `/sales` | SR (mobile-first, 360px) | Bottom nav: **Rute** · **Tagihan** · **Toko** · **Aktivitas** |
| `/sales/kunjungan/:kode_toko` | SR | Stepper kunjungan Collection → Stok → PO → Selesai |
| `/mt` | SR MT (mobile) | Bottom nav: **Rute** · **Toko** · **Order** · **Aktivitas** |
| `/mt/toko/:kode?step=po\|msl\|summary` | SR MT | Stepper: Input PO (cari SKU) → Cek MSL (grid principal + SKU warning) → Summary (MSL sebelum→sesudah) & Submit PO |
| `/admin` | Admin / supervisor (responsive) | Dashboard · Rute Salesman · Toko & Faktur · Penagihan · Purchase Order · Cek Stok · **MSL Compliance (MT)** · Data & Upload |

Saat pertama dibuka, data dimuat dari `public/Dummy_ROVI_PJP.xlsx`. Tanggal default **9 Nov 2026** (Senin, PJP Minggu 2). PJP GT berisi siklus 4 minggu, 2–29 Nov 2026. Contoh rute paling lengkap: **Yudha (000033)** pada 9 Nov, dengan 10 toko perlu ditagih dari DI AWAL asli.

```bash
npm test          # unit test + test regresi (Vitest)
npm run build     # typecheck + build produksi ke dist/
```

## Alur demo (±2 menit)
1. `/sales`: SR **Arli (SLS01)**, Senin 9 Nov. Menu **On Route** (sub *All* urut nama / *Route* urut kunjungan): 77 kunjungan · 25 perlu ditagih · Rp 121.160.000.
   **Non Route** = semua toko coverage SR (taking order di luar jadwal / by phone). **Inkasso** = toko coverage dengan tagihan JT/overdue → *Belum ditagih* / *Tertagih* (lunas).
2. Buka **TEH LENI /PASEH**, lalu ketuk faktur `INV/2026/09/00188` dan pilih **Paid**. Harus Ditagih turun ke Rp 7.300.000.
   Coba juga *Partially Paid* (nominal), *Janji Bayar* (tanggal), dan *Bad Debt* (alasan + "Lainnya").
3. **Cek Stok**: isi Display/Backroom (CAR/PCS), lalu tab Kompetitor. Daftar kompetitor otomatis muncul dari cek stok sebelumnya.
4. **PO**: cari SKU (kode/nama), qty dalam **CAR atau PCS** (1 CAR = isi karton), qty diinput manual per satuan; MOQ "Min. 3 Pcs/item" hanya badge + catatan kuning bila di bawah MOQ (tidak memblokir submit),
   **History pembelian** untuk tambah cepat. Submit → **Submit PO · Rp …**.
5. **Selesai Kunjungan**: rute menunjukkan 1/77 selesai.
6. `/admin` = **Dashboard GT** (TOTAL AR, TOTAL DI AKHIR, BELUM TERTAGIH, JB/BD, AR OUTSTANDING); `/admin/mt` = **Dashboard MT** (toko order, MSL compliance, SKU belum transaksi).
   Semua tabel admin bisa diexport **CSV / TXT / Excel**.
7. Toko diblokir untuk demo: `TK00054 BINTANG STORE`, `TK00200 SRC EKA`. Limit tipis: `TK00090`, `TK00143`.

## Alur demo MT (±1 menit)
1. `/mt`: SR **Rina (SLSM01)**, Senin 9 Nov: kartu toko menampilkan "Ada N SKU Belum Transaksi".
2. Buka toko (info: Cust group + alamat) → **1. Input PO**: cari SKU by **kode atau nama** → atur qty CAR/PCS (MT tanpa MOQ & tanpa limit kredit; harga dari Price List MT).
3. **2. Cek MSL**: pilih **principal**; SKU listed yang belum transaksi > 30 hari dipin teratas. SKU yang sudah ada di PO
   berubah jadi "Masuk PO · warning teratasi". Tekan **+ PO** untuk menambah SKU warning.
4. **3. Summary**: MSL aktif sebelum → sesudah PO, SKU yang masih belum transaksi, rincian PO → **Submit PO · Rp …**.
5. Rute & admin `/admin/msl` langsung ter-update (warning dinamis).

## Catatan tampilan (feedback user)
- Kartu faktur: **kode divisi** (DNE = Danone, CBN = Combine, MRS = Mars; kode lain tampil apa adanya) → no faktur → `JT dd/mm/yyyy` → status.
- Toko: badge **TUNAI / KREDIT · TOP n hari**. Limit kredit hanya untuk toko KREDIT GT; toko TUNAI dan MT tanpa limit.
- Toko diblokir (GT): banner **"PO berpotensi tidak release — Selesaikan tagihan atau hubungi admin"**; PO tetap bisa disubmit dan ditandai di admin.
- Pilih SKU (Cek Stok, PO GT/MT): combobox cari **kode SKU atau nama**. Info histori: "Biasa order ±N Pcs/bulan · Terakhir …".
- Tombol konfirmasi: **"Submit PO · Rp …"**.
- Info toko GT (customer master): alamat (bill address 1–4 digabung), credit limit, TOP, average sales (RPP13), last order value/date, outstanding. Tipe outlet tidak ditampilkan.
- Kode SKU tampil tanpa awalan "SAP"; nama SKU = kolom *new material*; MT menampilkan *sub brand*.
- Belum dikerjakan (menunggu detail): Retur (Stok → Retur → Coll → PO), MSL untuk GT, status PO SDR69.

## Data (Admin → Data & Upload)

Upload XLSX/CSV per jenis data. Upload **mengganti seluruh** data jenis tersebut. Header tidak peka huruf besar/kecil.
Sheet dipilih berdasarkan nama (lihat kolom Sheet) atau sheet pertama, jadi `Dummy_ROVI_PJP.xlsx` bisa langsung dipakai.

| Data | Sheet | Kolom wajib | Opsional |
|---|---|---|---|
| Master Outlet | `Master_Toko` | kode_salesman, nama_salesman, kode_toko, nama_toko | salesman_bw, area, alamat, alamat_1..alamat_4 (bill address), tipe_outlet, cust_group (MT), rpp13 (average sales), limit_kredit, status_blokir (YA/TIDAK), channel (GT/MT), tipe_bayar (TUNAI/KREDIT), top_hari |
| DI AWAL (AR) | `ROVI` | kode_toko, nama_toko, no_faktur, tanggal_faktur, tanggal_jatuh_tempo, nilai_faktur, sisa_tagihan | divisi (DNE/CBN/MRS/…) |
| PJP | `PJP` | kode_salesman, nama_salesman, tanggal_kunjungan, kode_toko | hari, nama_toko, urutan |
| Master SKU | `Produk` | kode_sku, nama_sku, divisi (= principal), harga | new_material (nama lengkap), sub_brand, kategori, channel (GT/MT), status_aktif (YA/TIDAK), kode_principal & barcode (info, diabaikan) |
| Order Rules (GT) | `Order_Rules` | kode_sku, satuan, moq (per item) | isi_karton (Pcs per CAR), kelipatan (diabaikan) |
| Price List | `Price_List` | kode_sku, harga | channel (GT/MT; kosong = semua) — menggantikan harga Master SKU |
| Historical Sales | `Histori_Sales` | kode_toko, kode_sku, tanggal_po, qty | |
| MSL (Toko – SKU Listing) | `MSL` | kode_toko, kode_sku, status_listed (YES/NO) | |

- Tanggal: tanggal Excel, `YYYY-MM-DD`, atau `D/M/YYYY`. Uang: bilangan bulat rupiah.
- Kolom wajib hilang → file ditolak. Baris error ditampilkan dengan nomor baris Excel → **Simpan baris valid saja** / **Batal**.
- Data dummy tidak disimpan di `localStorage` (dimuat ulang dari file). Data hasil upload disimpan, dan muncul peringatan bila melebihi kuota browser.
- Dummy dibuat oleh `node scripts/gen-dummy.mjs`. Sejak v6, data GT diambil dari **data asli MD DC Bandung** di `docs/source/`:
  - **Sumber:** Customer Master 11-11-2026, PJP SDR18 Arli (000024), Jajang (000032), Yudha (000033), dan Daily Monitoring Tagihan / DI AWAL 9 Nov 2026.
  - **Master toko:** 1.374 toko coverage 3 SR. Alamat 1–4, credit limit, TOP, dan RPP13 diambil dari Customer Master.
  - **TUNAI/KREDIT:** toko dengan limit 0 dan TOP 0 = TUNAI. Toko dengan TOP 0 tetapi punya limit dianggap KREDIT 14 hari.
  - **PJP:** 4 minggu. Minggu 2 = 9–15 Nov, sesuai DI AWAL.
  - **ROVI:** 89 faktur asli DI AWAL ditambah faktur dummy `INV/2026/..` untuk sisa outstanding Customer Master.
  - **Produk / Order Rules (v7):** 62 SKU kurasi dari *Min SKU Items NEFOKAM 09 Nov 2026*. Kode SKU, nama, principal (`divisi`), kode principal, barcode, dan MOQ (Min_SKU_Items; 0 berarti tanpa minimum, MOQ 1) diambil dari data asli. Principal: SARI HUSADA, NIS, PT. BEBELAC - NIS, YUPI INDO JELLY GUM, PT DISTRIVERSA BUANAMAS (Huki), dan PT. ANGGANA CATUR PRIMA (Koepoe, kode PCP 1Y, sesuai file).
  - **Tetap dummy:** area (diturunkan dari alamat), 2 toko blokir demo, Histori Sales (≈ RPP13), harga, kategori, channel, isi karton, dan 4 SKU non-aktif demo produk, Price List, serta seluruh data MT (SLSM01/02, MT00001–MT00060, MSL).
  - Sheet `Contoh_Output_Sales` dan `Contoh_Detail_Toko` (Yudha, 9 Nov) dihitung ulang dan menjadi acuan test regresi.

## Aturan bisnis

Semua logika berupa pure function di `src/lib/` dan diuji:

| File | Aturan |
|---|---|
| [billing.ts](src/lib/billing.ts) | Status faktur (Overdue / JT hari ini / Belum JT), Perlu Ditagih, total harus ditagih, urutan prioritas, join `kode_toko` (trim + uppercase, tidak pakai nama) |
| [collection.ts](src/lib/collection.ts) | Validasi Paid / Partially Paid (0 < nominal < sisa) / Janji Bayar (tanggal ≥ kunjungan) / Bad Debt (alasan wajib). **Paid & Partial mengurangi sisa tagihan**; Janji & Bad Debt hanya dicatat |
| [order.ts](src/lib/order.ts) | MOQ per item = catatan/flag saja (GT; tidak memblokir, qty tidak dinaikkan otomatis), qty disimpan dalam Pcs (CAR × isi karton), harga = Price List channel → Price List umum → Master SKU, suggested qty = rata-rata/bulan 3 bulan terakhir (fallback 6 bulan), tidak dipaksa ke MOQ. Toko diblokir → PO boleh + peringatan; KREDIT melebihi limit → ditolak |
| [outlet.ts](src/lib/outlet.ts) | Alamat lengkap (bill address 1–4), last order value/date (histori + PO aplikasi) |
| [inkasso.ts](src/lib/inkasso.ts) | Daftar Inkasso: toko coverage SR dengan tagihan JT/overdue (AR awal); Tertagih = ada log di D & lunas, sisanya Belum ditagih |
| [stock.ts](src/lib/stock.ts) | Daftar SKU = pernah dibeli toko ∪ channel GT; qty bulat ≥ 0 |
| [visit.ts](src/lib/visit.ts) | Status langkah kunjungan (selesai / dilewati), progres rute |
| [msl.ts](src/lib/msl.ts) | MT: SKU tampil = listed ∪ pernah dibeli, hanya aktif. Order terakhir = maks(histori, PO aplikasi) ≤ D. Warning bila listed & (> 30 hari **atau** belum pernah order); tepat 30 hari = aman. PO hari ini langsung mereset warning. Warning dipin teratas; counter per divisi & toko |

Tanggal bisnis berupa string `YYYY-MM-DD`; "hari ini" = Asia/Jakarta.
Test regresi ([regression.test.ts](src/lib/regression.test.ts)) memastikan hasil SLS01 @ 2026-11-09 sama persis dengan sheet `Contoh_Output_Sales` & `Contoh_Detail_Toko`.

## Struktur

```
src/lib/             logika murni + test
src/state.tsx        data master (upload/dummy) + aktivitas SR (localStorage), ROVI efektif
src/components/      UI kit (ui.tsx), KunjunganPanel, DetailTokoView, Penagihan (bottom sheet)
src/pages/sales/     layout bottom nav, Rute/Tagihan/Toko/Aktivitas, VisitPage (stepper)
src/pages/mt/        aplikasi MT: Rute/Toko/Order/Aktivitas, toko → divisi → SKU list → PO
src/pages/admin/     layout sidebar/drawer, Dashboard, Data, Rute, Toko, Penagihan, PO, Stok, MSL
src/pages/Home.tsx   pemilih aplikasi (/)
scripts/gen-dummy.mjs   generator data dummy (GT dari docs/source/*.md)
```
