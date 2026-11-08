# PRD — Sales Visit & Due Invoice Tracker (POC)

> **Versi:** 0.1 (POC) · **Owner:** Product · **Status:** Draft untuk build POC

---

## 1. Ringkasan

Sistem untuk mempertemukan **jadwal kunjungan salesman (PJP)** dengan **data piutang toko (ROVI)**, supaya setiap salesman tahu **toko mana di rute hari ini yang punya faktur jatuh tempo hari ini atau sudah lewat jatuh tempo (overdue)**, sehingga penagihan bisa dilakukan saat kunjungan.

**Dua sisi (POV):**

| POV | Platform | Fungsi utama |
|---|---|---|
| **Admin** | Web Admin (desktop) | Upload/kelola data ROVI & PJP, lihat seluruh list toko + faktur, monitoring per salesman |
| **Salesman** | Web App (mobile-first) | Lihat kunjungan hari ini + toko mana yang perlu ditagih |

---

## 2. Problem Statement

- Data piutang (ROVI) dan jadwal kunjungan (PJP) ada di tempat terpisah.
- Salesman tidak tahu sebelum berangkat toko mana yang harus ditagih → tagihan terlewat, piutang menua (aging naik).
- Admin/supervisor harus cocokkan manual (Excel vlookup) setiap hari.

**Goal:** Salesman membuka app → langsung melihat daftar kunjungan hari ini, dengan penanda jelas toko yang punya tagihan jatuh tempo/overdue beserta detail fakturnya.

---

## 3. Source Data

### 3.1 Data ROVI (piutang / faktur)
Satu baris = satu faktur.

| Field | Tipe | Wajib | Contoh | Catatan |
|---|---|---|---|---|
| `kode_toko` | string | ✅ | `TK00123` | **Key join** ke PJP |
| `nama_toko` | string | ✅ | Toko Makmur Jaya | |
| `no_faktur` | string | ✅ | `INV/2026/11/0045` | Unik |
| `tanggal_faktur` | date | ✅ | 2026-10-25 | |
| `tanggal_jatuh_tempo` | date | ✅ | 2026-11-09 | |
| `nilai_faktur` | number | ✅ | 2.500.000 | Rupiah |
| `sisa_tagihan` | number | ✅ | 1.200.000 | Outstanding; 0 = lunas |
| `alamat` / `area` | string | ⬜ | | Opsional |

### 3.2 Data PJP (Permanent Journey Plan)
Satu baris = satu jadwal kunjungan salesman ke satu toko di satu tanggal.

| Field | Tipe | Wajib | Contoh | Catatan |
|---|---|---|---|---|
| `kode_salesman` | string | ✅ | `SLS01` | |
| `nama_salesman` | string | ✅ | Budi | |
| `tanggal_kunjungan` | date | ✅ | 2026-11-09 | *Alternatif: `hari` (Senin–Sabtu) + pola minggu, lihat Open Questions* |
| `kode_toko` | string | ✅ | `TK00123` | **Key join** ke ROVI |
| `urutan` | number | ⬜ | 3 | Urutan rute |

### 3.3 Format input (POC)
- Upload file **CSV / XLSX** via Web Admin (manual). Integrasi API/otomatis = fase berikutnya.
- Template file bisa di-download dari Web Admin.

---

## 4. Business Rules (inti logika)

Misal **D** = tanggal kunjungan (default: hari ini, timezone **Asia/Jakarta**).

| ID | Rule |
|---|---|
| **BR-01** | Faktur dianggap **aktif** jika `sisa_tagihan > 0`. Faktur lunas tidak ditampilkan. |
| **BR-02** | Status faktur: **Jatuh Tempo Hari Ini** jika `tanggal_jatuh_tempo = D`. |
| **BR-03** | Status faktur: **Overdue** jika `tanggal_jatuh_tempo < D`. Tampilkan jumlah hari terlambat = `D − tanggal_jatuh_tempo`. |
| **BR-04** | Status faktur: **Belum Jatuh Tempo** jika `tanggal_jatuh_tempo > D`. *(Ditampilkan di detail toko saja, tidak memicu label tagih.)* |
| **BR-05** | Toko di PJP diberi label **"Perlu Ditagih"** jika punya ≥1 faktur aktif berstatus Jatuh Tempo Hari Ini atau Overdue. |
| **BR-06** | Prioritas tampil: Overdue (terlama dulu) → Jatuh Tempo Hari Ini → Toko tanpa tagihan. *(Atau ikut `urutan` PJP; bisa di-toggle.)* |
| **BR-07** | Total tagihan per toko = jumlah `sisa_tagihan` dari faktur Jatuh Tempo Hari Ini + Overdue. |
| **BR-08** | Join PJP ↔ ROVI memakai `kode_toko` (exact match, trim spasi, case-insensitive). |
| **BR-09** | Toko di PJP yang tidak ada di ROVI → tampil sebagai "Tidak ada tagihan" (bukan error). |
| **BR-10** | Upload data baru **menggantikan** snapshot sebelumnya (POC: full replace). Simpan timestamp "Data terakhir diperbarui". |

---

## 5. User Stories & Acceptance Criteria

### 5.1 Web Admin

#### US-A1 — Upload data ROVI
> Sebagai **Admin**, saya ingin meng-upload data ROVI, supaya data piutang terbaru tersedia untuk salesman.

**Acceptance Criteria**
- [ ] Admin bisa upload file CSV/XLSX sesuai template.
- [ ] Sistem memvalidasi kolom wajib & format tanggal/angka sebelum menyimpan.
- [ ] Baris tidak valid ditampilkan (nomor baris + alasan); admin bisa batal atau lanjut simpan baris valid.
- [ ] Setelah sukses, tampil ringkasan: jumlah faktur, jumlah toko, total outstanding, timestamp.

```gherkin
Feature: Upload data ROVI

  Scenario: Upload file ROVI valid
    Given saya login sebagai Admin
    And saya berada di halaman "Data ROVI"
    When saya meng-upload file "rovi_nov.xlsx" yang sesuai template
    Then sistem menampilkan ringkasan "1.240 faktur, 312 toko, total outstanding Rp 845.000.000"
    And data ROVI sebelumnya diganti dengan data baru
    And label "Data terakhir diperbarui" menampilkan waktu upload

  Scenario: Upload file dengan kolom wajib hilang
    Given saya login sebagai Admin
    When saya meng-upload file ROVI tanpa kolom "tanggal_jatuh_tempo"
    Then sistem menolak file
    And menampilkan pesan "Kolom wajib tidak ditemukan: tanggal_jatuh_tempo"

  Scenario: Upload file dengan sebagian baris tidak valid
    Given saya login sebagai Admin
    When saya meng-upload file ROVI dengan 3 baris format tanggal salah
    Then sistem menampilkan daftar 3 baris error beserta alasannya
    And saya bisa memilih "Simpan baris valid saja" atau "Batal"
```

#### US-A2 — Upload data PJP
> Sebagai **Admin**, saya ingin meng-upload jadwal PJP salesman, supaya setiap salesman punya daftar kunjungan harian.

**Acceptance Criteria**
- [ ] Upload CSV/XLSX sesuai template PJP, validasi sama seperti US-A1.
- [ ] Sistem memberi warning untuk `kode_toko` di PJP yang tidak ditemukan di ROVI (bukan blocking).
- [ ] Ringkasan: jumlah salesman, rentang tanggal, jumlah kunjungan.

```gherkin
Feature: Upload data PJP

  Scenario: Upload PJP valid
    Given saya login sebagai Admin
    When saya meng-upload file "pjp_minggu_45.xlsx" yang valid
    Then sistem menampilkan ringkasan "12 salesman, 9–14 Nov 2026, 540 kunjungan"

  Scenario: Kode toko di PJP tidak ada di ROVI
    Given data ROVI sudah ter-upload
    When saya meng-upload PJP yang berisi kode toko "TK99999" yang tidak ada di ROVI
    Then upload tetap berhasil
    And sistem menampilkan warning "1 toko tidak ditemukan di data ROVI"
```

#### US-A3 — Lihat list toko & faktur
> Sebagai **Admin**, saya ingin melihat seluruh toko beserta faktur dan statusnya, supaya saya bisa memonitor piutang.

**Acceptance Criteria**
- [ ] Tabel toko: kode, nama, jumlah faktur aktif, total outstanding, total overdue, faktur tertua overdue (hari).
- [ ] Klik toko → detail faktur (no faktur, tgl faktur, jatuh tempo, nilai, sisa, status, hari terlambat).
- [ ] Filter: status (Overdue / Jatuh Tempo Hari Ini / Belum JT), salesman, tanggal kunjungan.
- [ ] Search by kode/nama toko.
- [ ] Export hasil filter ke CSV/XLSX.

```gherkin
Feature: Monitoring toko dan faktur

  Scenario: Filter toko overdue
    Given data ROVI sudah ter-upload
    When saya memilih filter status "Overdue"
    Then tabel hanya menampilkan toko yang punya minimal 1 faktur aktif dengan jatuh tempo sebelum hari ini
    And tabel diurutkan dari faktur overdue paling lama

  Scenario: Melihat detail faktur toko
    Given saya berada di halaman list toko
    When saya klik toko "Toko Makmur Jaya"
    Then saya melihat semua faktur aktif toko tersebut beserta status dan hari terlambat
```

#### US-A4 — Monitoring kunjungan per salesman
> Sebagai **Admin/Supervisor**, saya ingin melihat rute salesman di tanggal tertentu beserta toko yang perlu ditagih.

**Acceptance Criteria**
- [ ] Pilih salesman + tanggal → list toko PJP dengan label "Perlu Ditagih" dan total tagihan.
- [ ] Ringkasan per salesman: jumlah kunjungan, jumlah toko perlu ditagih, total nilai tagihan.

```gherkin
Feature: Monitoring rute salesman

  Scenario: Lihat rute salesman hari tertentu
    Given data ROVI dan PJP sudah ter-upload
    When saya memilih salesman "Budi" dan tanggal "2026-11-09"
    Then saya melihat 15 toko kunjungan Budi
    And 4 toko berlabel "Perlu Ditagih" dengan total tagihan Rp 18.750.000
```

---

### 5.2 Web App Salesman (mobile-first)

#### US-S1 — Login
> Sebagai **Salesman**, saya login supaya hanya melihat jadwal saya sendiri.

**Acceptance Criteria**
- [ ] Login dengan kode salesman + PIN/password (POC: akun dibuat admin).
- [ ] Salesman hanya bisa melihat data PJP miliknya.

```gherkin
Feature: Login salesman

  Scenario: Login berhasil
    Given saya salesman dengan kode "SLS01"
    When saya login dengan PIN yang benar
    Then saya diarahkan ke halaman "Kunjungan Hari Ini"
    And saya hanya melihat toko di PJP milik SLS01
```

#### US-S2 — Lihat kunjungan hari ini
> Sebagai **Salesman**, saya ingin melihat daftar toko yang harus dikunjungi hari ini dan mana yang perlu ditagih, supaya saya siap menagih saat kunjungan.

**Acceptance Criteria**
- [ ] Header ringkasan: tanggal hari ini, jumlah kunjungan, jumlah toko perlu ditagih, total tagihan hari ini.
- [ ] List toko menampilkan: nama, kode, alamat/area, badge status (🔴 Overdue / 🟠 Jatuh Tempo Hari Ini / ⚪ Tidak ada tagihan), total tagihan.
- [ ] Default urutan sesuai BR-06; ada toggle "Urutan rute".
- [ ] Filter cepat: "Semua" / "Perlu Ditagih".
- [ ] Tampil "Data terakhir diperbarui: …".

```gherkin
Feature: Kunjungan hari ini

  Background:
    Given hari ini tanggal "2026-11-09"
    And saya login sebagai salesman "SLS01"

  Scenario: Toko dengan faktur jatuh tempo hari ini
    Given toko "TK00123" ada di PJP saya hari ini
    And toko tersebut punya faktur aktif dengan jatuh tempo "2026-11-09"
    When saya membuka halaman "Kunjungan Hari Ini"
    Then toko "TK00123" tampil dengan badge "Jatuh Tempo Hari Ini"
    And toko tersebut berlabel "Perlu Ditagih"

  Scenario: Toko dengan faktur overdue
    Given toko "TK00456" ada di PJP saya hari ini
    And toko tersebut punya faktur aktif dengan jatuh tempo "2026-11-01"
    When saya membuka halaman "Kunjungan Hari Ini"
    Then toko "TK00456" tampil dengan badge "Overdue 8 hari"
    And toko tersebut tampil di urutan teratas

  Scenario: Faktur sudah lunas tidak memicu tagihan
    Given toko "TK00789" ada di PJP saya hari ini
    And satu-satunya faktur toko tersebut jatuh tempo "2026-11-05" dengan sisa tagihan 0
    When saya membuka halaman "Kunjungan Hari Ini"
    Then toko "TK00789" tampil dengan badge "Tidak ada tagihan"

  Scenario: Toko belum jatuh tempo
    Given toko "TK00321" ada di PJP saya hari ini
    And faktur toko tersebut jatuh tempo "2026-11-20"
    When saya membuka halaman "Kunjungan Hari Ini"
    Then toko "TK00321" tidak berlabel "Perlu Ditagih"

  Scenario: Tidak ada jadwal hari ini
    Given saya tidak punya jadwal PJP di tanggal "2026-11-09"
    When saya membuka halaman "Kunjungan Hari Ini"
    Then saya melihat pesan "Tidak ada jadwal kunjungan hari ini"

  Scenario: Filter hanya toko yang perlu ditagih
    Given saya punya 15 kunjungan hari ini dan 4 di antaranya perlu ditagih
    When saya memilih filter "Perlu Ditagih"
    Then saya hanya melihat 4 toko
```

#### US-S3 — Detail toko & faktur
> Sebagai **Salesman**, saya ingin melihat detail faktur sebuah toko, supaya saya tahu faktur mana dan berapa yang harus ditagih.

**Acceptance Criteria**
- [ ] Detail: info toko + list faktur aktif (no faktur, tgl faktur, jatuh tempo, sisa tagihan, status, hari terlambat).
- [ ] Faktur dikelompokkan: Overdue → Jatuh Tempo Hari Ini → Belum Jatuh Tempo.
- [ ] Total yang harus ditagih (BR-07) ditampilkan menonjol.

```gherkin
Feature: Detail toko

  Scenario: Melihat faktur yang harus ditagih
    Given saya berada di halaman "Kunjungan Hari Ini"
    When saya tap toko "Toko Makmur Jaya"
    Then saya melihat 2 faktur overdue dan 1 faktur jatuh tempo hari ini
    And total "Harus Ditagih" adalah jumlah sisa tagihan ketiga faktur tersebut
    And faktur yang belum jatuh tempo tampil di bagian terpisah
```

#### US-S4 — Lihat kunjungan tanggal lain *(nice to have)*
- [ ] Salesman bisa geser ke besok / pilih tanggal untuk persiapan; status dihitung relatif terhadap tanggal yang dipilih (D).

---

## 6. Non-Functional Requirements (POC)

| Area | Requirement |
|---|---|
| Platform | Web Admin responsive desktop; Sales app mobile-first (PWA-ready), layar 360px |
| Performa | Halaman "Kunjungan Hari Ini" load < 2 detik untuk ≤ 50 toko |
| Timezone | Semua perhitungan tanggal pakai **Asia/Jakarta (WIB)** |
| Format | Rupiah `Rp 1.250.000`, tanggal `9 Nov 2026` |
| Akses | Role-based: Admin (semua data), Salesman (PJP sendiri saja) |
| Bahasa | UI Bahasa Indonesia |

---

## 7. Scope

**In scope (POC)**
- Upload ROVI & PJP (CSV/XLSX), validasi, full replace
- Web Admin: list toko & faktur, filter, monitoring per salesman, export
- Sales App: login, kunjungan hari ini, detail toko/faktur

**Out of scope (fase berikutnya)**
- Integrasi API otomatis ke ROVI / sistem PJP
- Input hasil penagihan (bayar/janji bayar/gagal), foto bukti, check-in GPS
- Notifikasi push / WhatsApp pagi hari
- Peta rute, offline mode
- Dashboard aging & KPI collection

---

## 8. Data Model (usulan)

```
salesman (id, kode_salesman, nama, pin_hash, aktif)
toko     (id, kode_toko, nama_toko, alamat, area)
faktur   (id, no_faktur, kode_toko, tanggal_faktur, tanggal_jatuh_tempo, nilai_faktur, sisa_tagihan, upload_batch_id)
pjp      (id, kode_salesman, kode_toko, tanggal_kunjungan, urutan, upload_batch_id)
upload_batch (id, tipe [ROVI|PJP], filename, uploaded_by, uploaded_at, total_rows, valid_rows)
```

Query inti "Kunjungan Hari Ini":
```sql
SELECT p.kode_toko, t.nama_toko, p.urutan,
       SUM(CASE WHEN f.tanggal_jatuh_tempo <  :D THEN f.sisa_tagihan ELSE 0 END) AS total_overdue,
       SUM(CASE WHEN f.tanggal_jatuh_tempo =  :D THEN f.sisa_tagihan ELSE 0 END) AS total_jt_hari_ini,
       MAX(:D - f.tanggal_jatuh_tempo) FILTER (WHERE f.tanggal_jatuh_tempo < :D) AS max_hari_overdue
FROM pjp p
JOIN toko t ON t.kode_toko = p.kode_toko
LEFT JOIN faktur f ON f.kode_toko = p.kode_toko AND f.sisa_tagihan > 0
WHERE p.kode_salesman = :sales AND p.tanggal_kunjungan = :D
GROUP BY p.kode_toko, t.nama_toko, p.urutan;
```

---

## 9. Design Brief (untuk Product Designer)

**Prinsip:** *"Buka app → 3 detik tahu harus nagih ke mana."*

**Sales App — layar utama "Kunjungan Hari Ini"**
- Header: tanggal, kartu ringkasan (Kunjungan · Perlu Ditagih · Total Tagihan).
- Chip filter: Semua / Perlu Ditagih. Toggle urutan: Prioritas / Rute.
- Card toko: nama (bold), kode + area (secondary), badge status berwarna, nominal tagihan di kanan.
- Warna status konsisten: 🔴 Overdue · 🟠 Jatuh Tempo Hari Ini · ⚪/abu Tidak ada tagihan · 🔵 Belum JT (detail saja). Jangan andalkan warna saja — selalu ada teks label.
- Empty state: "Tidak ada jadwal kunjungan hari ini".
- Footer kecil: "Data terakhir diperbarui 9 Nov 2026, 06:30".

**Sales App — Detail Toko**
- Blok "Harus Ditagih" besar di atas (total nominal).
- Section faktur per status, tiap item: no faktur, jatuh tempo, sisa tagihan, "terlambat X hari".

**Web Admin**
- Sidebar: Dashboard · Data ROVI · Data PJP · Toko & Faktur · Rute Salesman · Pengguna.
- Halaman upload: dropzone, download template, preview + error per baris, tombol konfirmasi.
- Tabel padat (dense) dengan filter bar, search, export.

**States yang wajib didesain:** loading, empty, error upload, data belum pernah di-upload, sesi login habis.

---

## 9A. Temuan dari Sampel Data (`toko.xlsx`, export SAP BW)

File sampel berisi **mapping salesman → toko**, bukan ROVI maupun PJP:
- 3 salesman tipe TO (Taking Order): `CBN - TO ARLI` (463 toko), `CBN - TO JAJANG` (491), `CBN - TO YUDHA` (448) → 1.399 toko.
- Hanya 2 kolom: `Salesman` dan `BW-Customer` (**nama** toko). **Tidak ada kode toko, tanggal kunjungan, maupun data faktur.**

Implikasi ke requirement:

| ID | Requirement tambahan |
|---|---|
| **BR-11** | Parser harus menangani format export SAP BW: nama salesman hanya muncul di baris pertama grup (**fill-down**), abaikan baris `Result` / `Overall Result`, abaikan sheet tersembunyi `_com.sap.ip.bi.xl.hiddensheet`. |
| **BR-12** | Join **wajib pakai kode customer SAP**, bukan nama toko. Di sampel ada nama ganda: dalam salesman yang sama (`AZZAHRA`, `TOKO FAJAR`, `TOKO BAROKAH`, `TOKO JULJOL`, `PDHC FROZEN FOOD`) dan lintas salesman (`AI TK`, `HOLIDAY TK`, `TOKO YULI`, dll.). Kalau join pakai nama, faktur bisa nyasar ke toko yang salah. |
| **BR-13** | Mapping salesman ↔ toko disimpan sebagai **Master Toko**. PJP harian di-generate dari master + hari kunjungan (atau di-upload terpisah); lihat Open Question #1. |

> **Action:** minta export BW ditambah kolom **Customer Code** (key), dan pastikan export ROVI memakai key yang sama.

Contoh data dummy (nama asli, kode/faktur/jadwal dummy) ada di `Dummy_ROVI_PJP.xlsx` → sheet *Master_Toko, PJP, ROVI, Contoh_Output_Sales, Contoh_Detail_Toko*. File ini juga bisa jadi seed data POC.

---

## 10. Open Questions (perlu dikonfirmasi)

1. **Format PJP**: per tanggal spesifik, atau per hari (Senin–Sabtu) + pola minggu ganjil/genap (F1/F2/F4)? *(PRD ini asumsikan per tanggal.)*
2. **Key toko**: apakah `kode_toko` di ROVI dan PJP pasti sama formatnya?
3. **Pembayaran parsial**: apakah `sisa_tagihan` selalu ter-update di ROVI, atau perlu dihitung dari pembayaran?
4. **Frekuensi update ROVI**: harian (pagi) atau real-time?
5. Perlu tampilkan **"akan jatuh tempo H+1 s/d H+7"** sebagai warning tambahan?
6. Satu toko bisa dikunjungi **>1 salesman** (beda principal/divisi)? Jika ya, faktur difilter per divisi?
7. Login salesman: PIN sederhana atau SSO/akun perusahaan?

---

## 11. Prompt Siap Pakai untuk Build POC

> Copy-paste ke AI builder (Claude / Lovable / v0 / Bolt) bersama dokumen ini.

```
Bangun POC web app "Sales Visit & Due Invoice Tracker" berdasarkan PRD terlampir.

Stack: Next.js (App Router) + TypeScript + Tailwind + shadcn/ui, database Supabase/Postgres
(atau SQLite untuk lokal). UI Bahasa Indonesia, timezone Asia/Jakarta.

Dua area:
1. /admin (desktop) — role Admin:
   - Upload CSV/XLSX untuk ROVI dan PJP (validasi kolom wajib, preview error per baris, full replace, simpan batch + timestamp)
   - Halaman Toko & Faktur: tabel + filter status/salesman/tanggal, search, detail faktur, export
   - Halaman Rute Salesman: pilih salesman + tanggal → list toko dengan label "Perlu Ditagih"
   - Kelola akun salesman (kode + PIN)
2. /sales (mobile-first, 360px) — role Salesman:
   - Login kode salesman + PIN
   - "Kunjungan Hari Ini": ringkasan, list toko PJP hari ini dengan badge Overdue / Jatuh Tempo Hari Ini / Tidak ada tagihan, filter "Perlu Ditagih", toggle urutan Prioritas/Rute
   - Detail toko: total harus ditagih + faktur dikelompokkan per status

Business rules WAJIB (lihat Bagian 4 & 9A PRD): BR-01 s.d. BR-13.
Gunakan file Dummy_ROVI_PJP.xlsx terlampir sebagai seed data & contoh format upload.
Penuhi semua Acceptance Criteria & skenario Gherkin di Bagian 5 — buat juga unit test untuk
fungsi penentuan status faktur (BR-01..BR-07) menggunakan skenario Gherkin sebagai test case.

Sertakan: seed data dummy (3 salesman, 30 toko, 100 faktur, PJP 7 hari ke depan dengan
campuran overdue, jatuh tempo hari ini, belum JT, dan lunas), serta template CSV ROVI & PJP
yang bisa di-download.
```

---

## 12. Definition of Done (POC)

- [ ] Semua skenario Gherkin di Bagian 5 lolos (manual atau automated)
- [ ] Unit test logika status faktur (BR-01..BR-07) hijau
- [ ] Demo end-to-end: Admin upload ROVI + PJP → Salesman login → melihat toko perlu ditagih hari ini dengan nominal benar
- [ ] Diuji dengan sampel data riil (min. 1 salesman, 1 minggu PJP)
