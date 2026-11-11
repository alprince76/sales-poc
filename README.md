# POC — Sales Visit (GT) + MSL Tracker (MT)

Satu repo, tiga aplikasi (beda route, berbagi data master, modul PO, UI kit, dan admin):

| Aplikasi | Route | Untuk |
|---|---|---|
| **Sales GT** | `/sales` | SR General Trade: rute PJP → **Collection → Cek Stok → PO → Selesai** |
| **Sales MT** | `/mt` | SR Modern Trade: **Must Stock List** — warning SKU listed yang tidak ada transaksi > 30 hari → langsung Add to PO |
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
| `/mt/toko/:kode` → `/divisi/:divisi` → `/po` | SR MT | Grid divisi (counter warning) → daftar SKU MSL (warning dipin) → keranjang PO |
| `/admin` | Admin / supervisor (responsive) | Dashboard · Rute Salesman · Toko & Faktur · Penagihan · Purchase Order · Cek Stok · **MSL Compliance (MT)** · Data & Upload |

Saat pertama dibuka, data dimuat dari `public/Dummy_ROVI_PJP.xlsx`. Tanggal default **9 Nov 2026**, karena PJP dummy berisi 9–14 Nov 2026.

```bash
npm test          # unit test + test regresi (Vitest)
npm run build     # typecheck + build produksi ke dist/
```

## Alur demo (±2 menit)
1. `/sales`: SR **Arli (SLS01)**, Senin 9 Nov: 77 kunjungan · 25 perlu ditagih · Rp 121.160.000.
2. Buka **TEH LENI /PASEH**, lalu ketuk faktur `INV/2026/09/00188` dan pilih **Paid**. Harus Ditagih turun ke Rp 7.300.000.
   Coba juga *Partially Paid* (nominal), *Janji Bayar* (tanggal), dan *Bad Debt* (alasan + "Lainnya").
3. **Cek Stok**: isi Display/Backroom produk Tigaraksa, lalu tab Kompetitor untuk nama + qty manual.
4. **PO**: filter divisi, lihat riwayat 6 bulan + saran qty, isi qty di bawah MOQ dan alert muncul
   ("Minimal pemesanan untuk SKU Yupi Milly Moos w/ Milk Hanging 24x108gr adalah 3 Pcs"). Submit, lalu **Kirim ke ERP**.
5. **Selesai Kunjungan**: rute menunjukkan 1/77 selesai.
6. `/admin`: dashboard menampilkan terkumpul, nilai PO, dan progres per SR. Menu *Purchase Order* bisa diexport sebagai payload ERP (CSV).
7. Toko diblokir untuk demo: `TK00054 BINTANG STORE`, `TK00200 SRC EKA`. Limit tipis: `TK00090`, `TK00143`.

## Alur demo MT (±1 menit)
1. `/mt`: SR **Rina (SLSM01)**, Senin 9 Nov: 5 toko; kartu menampilkan "Ada N SKU Belum Transaksi".
2. Buka toko → grid divisi dengan counter "N SKU Untransacted" → pilih divisi.
3. SKU warning dipin teratas: "⚠️ No Order > 30 Hari" + "Terakhir order: 22 Agu 2026 (79 hari lalu)" atau "Belum pernah order".
4. Tekan **+ PO** (qty = saran histori / MOQ) → **Lihat PO** → Submit → Kirim ke ERP.
5. Kembali ke toko: warning SKU yang dipesan **langsung hilang** dan counter berkurang.
6. `/admin/msl`: % MSL aktif per toko, detail SKU, export CSV. Dashboard/PO/Rute bisa difilter GT/MT.

## Data (Admin → Data & Upload)

Upload XLSX/CSV per jenis data. Upload **mengganti seluruh** data jenis tersebut. Header tidak peka huruf besar/kecil.
Sheet dipilih berdasarkan nama (lihat kolom Sheet) atau sheet pertama, jadi `Dummy_ROVI_PJP.xlsx` bisa langsung dipakai.

| Data | Sheet | Kolom wajib | Opsional |
|---|---|---|---|
| Master Outlet | `Master_Toko` | kode_salesman, nama_salesman, kode_toko, nama_toko | salesman_bw, area, alamat, tipe_outlet, limit_kredit, status_blokir (YA/TIDAK), channel (GT/MT) |
| ROVI (AR) | `ROVI` | kode_toko, nama_toko, no_faktur, tanggal_faktur, tanggal_jatuh_tempo, nilai_faktur, sisa_tagihan | |
| PJP | `PJP` | kode_salesman, nama_salesman, tanggal_kunjungan, kode_toko | hari, nama_toko, urutan |
| Master Produk | `Produk` | kode_sku, nama_sku, divisi, harga | kategori, channel (GT/MT), status_aktif (YA/TIDAK) |
| Order Rules | `Order_Rules` | kode_sku, satuan, moq | kelipatan |
| Historical Sales | `Histori_Sales` | kode_toko, kode_sku, tanggal_po, qty | |
| MSL (Toko – SKU Listing) | `MSL` | kode_toko, kode_sku, status_listed (YES/NO) | |

- Tanggal: tanggal Excel, `YYYY-MM-DD`, atau `D/M/YYYY`. Uang: bilangan bulat rupiah.
- Kolom wajib hilang → file ditolak. Baris error ditampilkan dengan nomor baris Excel → **Simpan baris valid saja** / **Batal**.
- Data dummy tidak disimpan di `localStorage` (dimuat ulang dari file). Data hasil upload disimpan, dan muncul peringatan bila melebihi kuota browser.
- Dummy dibuat oleh `node scripts/gen-dummy.mjs` dari `docs/original/Dummy_ROVI_PJP.xlsx`: data GT asli tidak diubah; ditambah 2 SR MT (SLSM01 Rina, SLSM02 Dodi), 60 outlet MT, PJP MT, sheet MSL, dan 3 SKU non-aktif.

## Aturan bisnis

Semua logika berupa pure function di `src/lib/` dan diuji:

| File | Aturan |
|---|---|
| [billing.ts](src/lib/billing.ts) | Status faktur (Overdue / JT hari ini / Belum JT), Perlu Ditagih, total harus ditagih, urutan prioritas, join `kode_toko` (trim + uppercase, tidak pakai nama) |
| [collection.ts](src/lib/collection.ts) | Validasi Paid / Partially Paid (0 < nominal < sisa) / Janji Bayar (tanggal ≥ kunjungan) / Bad Debt (alasan wajib). **Paid & Partial mengurangi sisa tagihan**; Janji & Bad Debt hanya dicatat |
| [order.ts](src/lib/order.ts) | Validasi MOQ & kelipatan, suggested qty = rata-rata/bulan 3 bulan terakhir (fallback 6 bulan) dibulatkan ke MOQ/kelipatan, toko diblokir / melebihi limit kredit → PO ditolak |
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
scripts/gen-dummy.mjs   generator data dummy v2
```
