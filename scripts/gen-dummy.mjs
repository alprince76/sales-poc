/**
 * Membangun Dummy_ROVI_PJP.xlsx (deterministik, seed tetap).
 *  - GT (v6): data ASLI MD dari docs/source/*.md (Customer Master, PJP SDR18, DI AWAL)
 *  - Produk/Order_Rules (v7): kode, nama, principal, MOQ ASLI dari Min SKU NEFOKAM; harga/kategori dummy
 *  - Histori_Sales, Price_List, MT/MSL: dummy
 *  - Contoh_Output_Sales & Contoh_Detail_Toko dihitung ulang (acuan test regresi)
 *
 * Jalankan: node scripts/gen-dummy.mjs   (sumber: docs/original/Dummy_ROVI_PJP.xlsx)
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as XLSX from 'xlsx';

const SRC = 'docs/original/Dummy_ROVI_PJP.xlsx';
const OUT = ['docs/Dummy_ROVI_PJP.xlsx', 'public/Dummy_ROVI_PJP.xlsx'];

function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261109);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const int = (a, b) => a + Math.floor(rand() * (b - a + 1));

// ── Produk + Order Rules (v7) ────────────────────────────────────────
// Kode SKU, nama, principal & MOQ ASLI dari "Min SKU Items NEFOKAM 09 Nov 2026"
// (docs/source/Min_SKU_Items_NEFOKAM_09_Nov_2026.md). Kategori, harga & channel = dummy.
const MINSKU = new Map(); // SKU → { barcode, pcp, principal, nama, aktif, min }
for (const l of readFileSync('docs/source/Min_SKU_Items_NEFOKAM_09_Nov_2026.md', 'utf8').split('\n')) {
  if (!l.startsWith('|') || /^\|\s*-{3}/.test(l)) continue;
  const c = l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((x) => x.trim());
  if (c.length !== 7 || c[0] === 'Barcode') continue;
  MINSKU.set(c[3], { barcode: c[0], pcp: c[1], principal: c[2], nama: c[4], aktif: c[5] === 'Y', min: Number(c[6]) || 0 });
}
// [kode SKU, kategori, harga per Pcs (dummy), channel]
const KATALOG = [
  // SARI HUSADA / NIS / BEBELAC (Danone)
  ['127868', 'Susu Pertumbuhan', 48500, 'GT'],
  ['127865', 'Susu Pertumbuhan', 48500, 'GT'],
  ['127864', 'Susu Pertumbuhan', 19500, 'GT'],
  ['127879', 'Susu Pertumbuhan', 98000, 'GT'],
  ['127870', 'Susu Pertumbuhan', 47000, 'GT'],
  ['127873', 'Susu Pertumbuhan', 47000, 'GT'],
  ['127855', 'Susu Formula', 55500, 'GT'],
  ['127860', 'Susu Formula', 54500, 'GT'],
  ['115857', 'Susu Ibu Hamil', 29500, 'GT'],
  ['129333', 'Susu Pertumbuhan', 3500, 'GT'],
  ['128558', 'Susu Formula', 39000, 'GT'],
  ['128563', 'Susu Pertumbuhan', 38000, 'GT'],
  ['128562', 'Susu Pertumbuhan', 72000, 'GT'],
  ['129158', 'Susu Pertumbuhan', 135000, 'MT'],
  ['129159', 'Susu Pertumbuhan', 285000, 'MT'],
  ['123906', 'Susu Pertumbuhan', 48000, 'GT'], // versi lama (GRD 2.0) → demo non-aktif
  // YUPI INDO JELLY GUM
  ['112405', 'Permen Gummy', 10500, 'GT'],
  ['112401', 'Permen Gummy', 10500, 'GT'],
  ['115304', 'Permen Gummy', 10500, 'GT'],
  ['112854', 'Permen Gummy', 4500, 'GT'],
  ['112856', 'Permen Gummy', 4500, 'GT'],
  ['112857', 'Permen Gummy', 4500, 'GT'],
  ['113443', 'Permen Gummy', 4500, 'GT'],
  ['113785', 'Permen Gummy', 2000, 'GT'],
  ['114253', 'Permen Gummy', 2000, 'GT'],
  ['115646', 'Permen Gummy', 2500, 'GT'],
  ['129320', 'Permen Gummy', 2500, 'GT'],
  ['123990', 'Permen Gummy', 6000, 'GT'],
  ['127459', 'Permen Gummy', 5000, 'GT'],
  ['112795', 'Permen Gummy', 5500, 'MT'],
  ['112403', 'Permen Gummy', 10500, 'GT'], // demo non-aktif
  // PT DISTRIVERSA BUANAMAS (Huki)
  ['124024', 'Perawatan Bayi', 8500, 'GT'],
  ['124025', 'Perawatan Bayi', 5500, 'GT'],
  ['124027', 'Perawatan Bayi', 11000, 'GT'],
  ['124033', 'Perawatan Bayi', 9500, 'GT'],
  ['127809', 'Perlengkapan Bayi', 19500, 'GT'],
  ['127820', 'Perlengkapan Bayi', 24500, 'GT'],
  ['127808', 'Perlengkapan Bayi', 15000, 'GT'],
  ['127821', 'Perlengkapan Bayi', 9500, 'GT'],
  ['127823', 'Perlengkapan Bayi', 9500, 'GT'],
  ['127824', 'Perlengkapan Bayi', 12500, 'GT'],
  ['127825', 'Perlengkapan Bayi', 21000, 'GT'],
  ['127831', 'Perawatan Bayi', 14000, 'GT'],
  ['127832', 'Perawatan Bayi', 24000, 'GT'],
  ['127833', 'Perawatan Bayi', 42000, 'MT'],
  ['124021', 'Perawatan Bayi', 9000, 'GT'], // demo non-aktif
  // Koepoe-Koepoe (kode PCP 1Y)
  ['122121', 'Pewarna Makanan', 6500, 'GT'],
  ['122122', 'Pewarna Makanan', 6500, 'GT'],
  ['128303', 'Pewarna Makanan', 6500, 'GT'],
  ['122111', 'Perisa Makanan', 9000, 'GT'],
  ['122185', 'Perisa Makanan', 9000, 'GT'],
  ['122113', 'Perisa Makanan', 9000, 'GT'],
  ['122097', 'Bahan Kue', 5500, 'GT'],
  ['122098', 'Bahan Kue', 6000, 'GT'],
  ['122108', 'Bahan Kue', 7500, 'GT'],
  ['122095', 'Bumbu', 9500, 'GT'],
  ['128273', 'Bumbu', 1000, 'GT'],
  ['128935', 'Bumbu', 2000, 'GT'],
  ['128932', 'Bumbu', 1500, 'GT'],
  ['129167', 'Bumbu', 5000, 'GT'],
  ['129170', 'Bumbu', 18500, 'MT'],
  ['119741', 'Pewarna Makanan', 6000, 'GT'], // demo non-aktif
];

const produk = [];
const rules = [];
// SKU versi lama yang sudah tergantikan (DUMMY: di file semuanya Status_Active = Y) — tidak boleh tampil di MSL.
const NONAKTIF = new Set(['123906', '112403', '124021', '119741']);
for (const [kode, kategori, harga, channel] of KATALOG) {
  const s = MINSKU.get(kode);
  if (!s) throw new Error(`SKU ${kode} tidak ada di Min SKU NEFOKAM`);
  produk.push({
    kode_sku: kode, nama_sku: s.nama, divisi: s.principal, kategori, harga, channel,
    status_aktif: NONAKTIF.has(kode) || !s.aktif ? 'TIDAK' : 'YA', kode_principal: s.pcp, barcode: s.barcode,
  });
  // Min_SKU_Items 0 = tanpa minimum → MOQ 1.
  rules.push({ kode_sku: kode, satuan: 'Pcs', moq: Math.max(1, s.min), kelipatan: 1 });
}

// ── Workbook (sheet produk lama + README diambil dari sumber) ──────────
mkdirSync('docs/original', { recursive: true });
try {
  readFileSync(SRC);
} catch {
  copyFileSync('docs/Dummy_ROVI_PJP.xlsx', SRC);
}
const wb = XLSX.read(readFileSync(SRC));

// ── v6: GT dari data ASLI MD (docs/source/*.md) ───────────────────────
// Customer Master 11-11-2026, PJP SDR18 Arli/Jajang/Yudha, DI AWAL 9 Nov 2026.
const excelSerial = (iso) => Date.UTC(...iso.split('-').map((v, i) => (i === 1 ? v - 1 : +v))) / 86_400_000 + 25569;
const isoAdd = (iso, n) => new Date(Date.UTC(...iso.split('-').map((v, i) => (i === 1 ? v - 1 : +v))) + n * 86_400_000).toISOString().slice(0, 10);
const D0 = '2026-11-09';
const SRC_DIR = 'docs/source';
const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const isRow = (l) => l.startsWith('|') && !/^\|\s*-{3}/.test(l);
const angka = (s) => Number(String(s ?? '').replace(/,/g, '')) || 0; // "1,300,000" (customer master)
const angkaId = (s) => Math.round(Number(String(s ?? '').replace(/\./g, '').replace(',', '.')) || 0); // "1.300.000,50"
const kodeBersih = (k) => String(k).replace(/\./g, '').trim().toUpperCase(); // "112.167" → "112167"
const tglId = (s) => {
  const [d, m, y] = String(s).split('-');
  return `${y}-${m}-${d}`;
};

// Customer Master
const CM = new Map();
for (const l of readFileSync(`${SRC_DIR}/Customer-Master_11-11-2026.md`, 'utf8').split('\n')) {
  if (!isRow(l)) continue;
  const c = cells(l);
  if (c.length !== 12 || c[0] === 'cust code1') continue;
  CM.set(kodeBersih(c[0]), {
    nama: c[1], alamat: [c[2], c[3], c[4], c[5]], limit: angka(c[6]), top: angka(c[7]), rpp13: angka(c[8]), outstanding: angka(c[9]),
  });
}

// PJP SDR18 — 4 minggu. DI AWAL 9 Nov cocok dengan Minggu 2 hari Senin → Minggu 1 dimulai 2 Nov 2026.
const MINGGU1 = '2026-11-02';
const SR = [
  { file: 'SDR18_PJP_ARLI.md', kode: '000024', nama: 'Arli', bw: 'CBN - TO ARLI' },
  { file: 'SDR18_PJP_JAJANG.md', kode: '000032', nama: 'Jajang', bw: 'CBN - TO JAJANG' },
  { file: 'SDR18_PJP_YUDHA.md', kode: '000033', nama: 'Yudha', bw: 'CBN - TO YUDHA' },
];
const NAMA_HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const pjp = [];
const tokoPJP = new Map(); // kode → { sr, tipe }
for (const sr of SR) {
  let minggu = 0;
  let hari = 0;
  for (const l of readFileSync(`${SRC_DIR}/${sr.file}`, 'utf8').split('\n')) {
    const mg = l.match(/^## Minggu (\d)/);
    if (mg) minggu = +mg[1];
    const hr = l.match(/^### Hari \S+ \( (\d) \)/);
    if (hr) hari = +hr[1];
    if (!isRow(l) || !minggu || !hari) continue;
    const c = cells(l);
    if (c.length !== 10 || !/^\d+$/.test(c[0])) continue;
    const kode = kodeBersih(c[1]);
    const tgl = isoAdd(MINGGU1, (minggu - 1) * 7 + (hari - 1));
    pjp.push({ kode_salesman: sr.kode, nama_salesman: sr.nama, tanggal_kunjungan: excelSerial(tgl), hari: NAMA_HARI[hari - 1], kode_toko: kode, nama_toko: c[2], urutan: +c[0] });
    if (!tokoPJP.has(kode)) tokoPJP.set(kode, { sr, tipe: c[9], nama: c[2], alamat: c[3], limit: angkaId(c[4]) });
  }
}

const AREA_KW = ['SUMEDANG', 'TANJUNGSARI', 'JATINANGOR', 'CIMANGGUNG', 'SITURAJA', 'DARMARAJA', 'WADO', 'CONGGEANG', 'BUAHDUA', 'UJUNGJAYA', 'KERTAJATI',
  'CIWIDEY', 'PANGALENGAN', 'BANJARAN', 'ARJASARI', 'SOREANG', 'MAJALAYA', 'PACET', 'CIPARAY', 'IBUN', 'BALEENDAH', 'CIMAHI', 'BATUJAJAR', 'CIHAMPELAS',
  'SINDANGKERTA', 'CILILIN', 'GUNUNG HALU', 'PADALARANG', 'NGAMPRAH', 'CIPATAT', 'CIPEUNDEUY', 'CIKALONG', 'LEMBANG', 'SUBANG', 'SAGALAHERANG',
  'TANJUNGSIANG', 'KASOMALANG', 'JALANCAGAK', 'CIATER', 'CISALAK', 'WANAYASA', 'BOJONG', 'CIMENYAN', 'UJUNG BERUNG', 'CIBIRU', 'CILEUNYI', 'SOLOKANJERUK', 'MARGAASIH', 'KATAPANG', 'DAYEUHKOLOT', 'BUAHBATU', 'KIARACONDONG', 'ANTAPANI', 'ANDIR', 'CIMINDI', 'PURWAKARTA', 'CICALENGKA', 'RANCAEKEK', 'CIKANCUNG', 'NAGREG', 'RANCAKALONG', 'MAJALENGKA', 'DAGO'];
const areaDari = (teks) => {
  const t = teks.toUpperCase().replace(/\s+/g, ' ');
  const kw = AREA_KW.find((k) => t.includes(k) || t.includes(k.replace(' ', '')));
  return kw ? kw.charAt(0) + kw.slice(1).toLowerCase().replace(/ (\w)/g, (_, x) => ` ${x.toUpperCase()}`) : 'Bandung';
};

const master = [];
for (const [kode, t] of tokoPJP) {
  const cm = CM.get(kode);
  const alamat = (cm?.alamat ?? [t.alamat, '', '', '']).map((a) => (a ?? '').trim());
  const limit = cm?.limit ?? t.limit;
  const top = cm?.top ?? 0;
  const tunai = limit === 0 && top === 0;
  const m = {
    kode_salesman: t.sr.kode, nama_salesman: t.sr.nama, salesman_bw: t.sr.bw, kode_toko: kode, nama_toko: cm?.nama ?? t.nama,
    area: areaDari(alamat.join(' ')), alamat: alamat.filter(Boolean).join(' '),
    alamat_1: alamat[0], alamat_2: alamat[1], alamat_3: alamat[2], alamat_4: alamat[3],
    tipe_outlet: t.tipe, rpp13: cm?.rpp13 ?? 0, status_blokir: 'TIDAK', channel: 'GT',
    tipe_bayar: tunai ? 'TUNAI' : 'KREDIT', top_hari: tunai ? 0 : top > 0 ? top : 14,
  };
  if (!tunai) m.limit_kredit = limit;
  master.push(m);
}
const masterOf = new Map(master.map((m) => [m.kode_toko, m]));

// ROVI = faktur DI AWAL asli + faktur dummy untuk sisa outstanding Customer Master.
const randV6 = rng(20261114);
const intV6 = (a, b) => a + Math.floor(randV6() * (b - a + 1));
const rovi = [];
const seenNo = new Set();
let fakturAsli = 0;
for (const l of readFileSync(`${SRC_DIR}/Daily_Monitoring_Tagihan_DC_Bandung_09.11.2026.md`, 'utf8').split('\n')) {
  if (!isRow(l)) continue;
  const c = cells(l);
  if (c.length !== 12 || c[0] !== '09-11-2026') continue;
  const kode = kodeBersih(c[4]);
  if (!masterOf.has(kode) || seenNo.has(c[8])) continue;
  seenNo.add(c[8]);
  fakturAsli++;
  rovi.push({
    kode_toko: kode, nama_toko: masterOf.get(kode).nama_toko, no_faktur: c[8], tanggal_faktur: excelSerial(tglId(c[6])),
    tanggal_jatuh_tempo: excelSerial(tglId(c[7])), nilai_faktur: angkaId(c[9]), sisa_tagihan: angkaId(c[10]), divisi: 'CBN',
  });
}
const sisaAsli = new Map();
for (const f of rovi) sisaAsli.set(f.kode_toko, (sisaAsli.get(f.kode_toko) ?? 0) + f.sisa_tagihan);
let noInv = 0;
for (const m of master) {
  const sisa = (CM.get(m.kode_toko)?.outstanding ?? 0) - (sisaAsli.get(m.kode_toko) ?? 0);
  if (sisa <= 0) continue;
  const n = sisa < 1_000_000 ? 1 : sisa < 10_000_000 ? 2 : 3;
  const top = m.top_hari || 14;
  let tersisa = sisa;
  for (let i = 0; i < n; i++) {
    const nilai = i === n - 1 ? tersisa : Math.round((sisa / n) * (0.7 + randV6() * 0.6));
    tersisa -= nilai;
    const x = randV6();
    // selisih D − jatuh tempo: overdue 45% · JT hari ini 10% · belum JT 45%
    const selisih = x < 0.45 ? intV6(1, 45) : x < 0.55 ? 0 : -intV6(1, Math.max(1, top - 1));
    const tglFaktur = isoAdd(D0, selisih - top);
    const xd = randV6();
    noInv++;
    rovi.push({
      kode_toko: m.kode_toko, nama_toko: m.nama_toko, no_faktur: `INV/2026/${tglFaktur.slice(5, 7)}/${String(noInv).padStart(5, '0')}`,
      tanggal_faktur: excelSerial(tglFaktur), tanggal_jatuh_tempo: excelSerial(isoAdd(tglFaktur, top)),
      nilai_faktur: nilai, sisa_tagihan: nilai, divisi: xd < 0.45 ? 'DNE' : xd < 0.85 ? 'CBN' : 'MRS',
    });
  }
}

// Contoh/demo: Yudha Senin 9 Nov (rute dengan faktur DI AWAL asli terbanyak).
const DEMO_SR = SR[2];
// Demo blokir (DUMMY): 2 toko KREDIT di rute 9 Nov yang outstanding-nya melebihi limit (rute demo dulu).
const ruteD0 = pjp
  .filter((p) => p.tanggal_kunjungan === excelSerial(D0))
  .sort((a, b) => (b.kode_salesman === DEMO_SR.kode) - (a.kode_salesman === DEMO_SR.kode) || a.urutan - b.urutan)
  .map((p) => masterOf.get(p.kode_toko));
const BLOKIR = ruteD0
  .filter((m) => m.tipe_bayar === 'KREDIT' && m.limit_kredit > 0 && (CM.get(m.kode_toko)?.outstanding ?? 0) > m.limit_kredit)
  .slice(0, 2)
  .map((m) => m.kode_toko);
for (const k of BLOKIR) masterOf.get(k).status_blokir = 'YA';

// ── Histori Sales: Mei–Okt 2026 untuk tiap toko GT; nilai/bulan ≈ RPP13 ──
const BULAN = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
const gtSku = produk.filter((p) => p.channel === 'GT');
const ruleOf = new Map(rules.map((r) => [r.kode_sku, r]));
const hargaDasar = new Map(produk.map((p) => [p.kode_sku, p.harga]));
const histori = [];
for (const m of master) {
  const n = int(2, 5);
  const skus = new Set();
  while (skus.size < n) skus.add(pick(gtSku).kode_sku);
  const target = Math.max(150_000, m.rpp13) / n;
  for (const sku of skus) {
    const r = ruleOf.get(sku);
    const base = Math.min(r.moq * 40, Math.max(r.moq, Math.round(target / hargaDasar.get(sku))));
    for (const bln of BULAN) {
      if (rand() > 0.6) continue;
      const hari = String(int(1, 28)).padStart(2, '0');
      const qty = Math.max(r.moq, Math.round(base * (0.6 + rand() * 0.8)));
      histori.push({ kode_toko: m.kode_toko, kode_sku: sku, tanggal_po: excelSerial(`${bln}-${hari}`), qty });
    }
  }
}

const JALAN = ['Raya', 'Merdeka', 'Pasar', 'Masjid', 'Siliwangi', 'Sudirman', 'Melati', 'Kenanga', 'Cempaka', 'Pahlawan'];

// ── Modern Trade (MT): SR, outlet, PJP, MSL, histori ──────────────────
// RNG terpisah supaya data GT di atas tidak berubah.
const randMT = rng(20261111);
const pickMT = (arr) => arr[Math.floor(randMT() * arr.length)];
const intMT = (a, b) => a + Math.floor(randMT() * (b - a + 1));
const HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const SR_MT = [
  { kode: 'SLSM01', nama: 'Rina', bw: 'CBN - MT RINA' },
  { kode: 'SLSM02', nama: 'Dodi', bw: 'CBN - MT DODI' },
];
const FORMAT = ['Swalayan', 'Minimarket', 'Supermarket', 'Toserba', 'Mart'];
const NAMA = ['Sinar Jaya', 'Mitra Abadi', 'Bintang Lima', 'Sumber Rezeki', 'Cahaya Baru', 'Harapan Kita', 'Prima', 'Sejahtera', 'Anugerah', 'Makmur Sentosa',
  'Berkah Utama', 'Citra', 'Gemilang', 'Indah Permai', 'Kencana', 'Lestari', 'Mulia', 'Nusantara', 'Purnama', 'Sentosa Raya', 'Tunas Baru', 'Utama Jaya',
  'Wijaya', 'Asri', 'Bahagia', 'Damai', 'Family', 'Gading', 'Hikmah', 'Jaya Abadi'];
const AREA = ['Bojonggede', 'Citeureup', 'Cileungsi', 'Gunung Putri', 'Cibinong', 'Sukaraja'];
const masterMT = [];
const pjpMT = [];
let no = 0;
for (const sr of SR_MT) {
  for (let d = 0; d < 6; d++) {
    const n = 5;
    for (let u = 1; u <= n; u++) {
      no++;
      const kode = `MT${String(no).padStart(5, '0')}`;
      const nama = `${pickMT(FORMAT).toUpperCase()} ${NAMA[(no - 1) % NAMA.length].toUpperCase()}${no > NAMA.length ? ` ${Math.ceil(no / NAMA.length)}` : ''}`;
      const area = pickMT(AREA);
      masterMT.push({
        kode_salesman: sr.kode, nama_salesman: sr.nama, salesman_bw: sr.bw, kode_toko: kode, nama_toko: nama, area,
        alamat: `Jl. ${pickMT(JALAN)} No. ${intMT(1, 180)}, ${area}`,
        tipe_outlet: nama.split(' ')[0] === 'SUPERMARKET' ? 'Supermarket' : 'Minimarket',
        ...(intMT(10, 30) && {}), // MT tidak memakai limit kredit
        status_blokir: 'TIDAK',
        tipe_bayar: 'KREDIT',
        top_hari: 30,
        channel: 'MT',
      });
      const tgl = isoAdd(D0, d);
      pjpMT.push({ kode_salesman: sr.kode, nama_salesman: sr.nama, tanggal_kunjungan: excelSerial(tgl), hari: HARI[d], kode_toko: kode, nama_toko: nama, urutan: u });
    }
  }
}
const aktifSku = produk.filter((p) => !NONAKTIF.has(p.kode_sku));
const msl = [];
for (const m of masterMT) {
  // 12–20 SKU listed + beberapa non-aktif listed (harus tersaring) + 2 SKU tidak listed.
  const listed = new Set();
  const target = intMT(12, 20);
  while (listed.size < target) listed.add(pickMT(aktifSku).kode_sku);
  for (const k of NONAKTIF) if (randMT() < 0.5) listed.add(k);
  for (const k of listed) msl.push({ kode_toko: m.kode_toko, kode_sku: k, status_listed: 'YES' });
  const tidak = new Set();
  while (tidak.size < 2) {
    const k = pickMT(aktifSku).kode_sku;
    if (!listed.has(k)) tidak.add(k);
  }
  for (const k of tidak) msl.push({ kode_toko: m.kode_toko, kode_sku: k, status_listed: 'NO' });
  // Histori relatif ke tanggal kunjungan: ±55% masih aktif (≤ 28 hari), ±30% lewat 30 hari, ±15% belum pernah.
  const pj = pjpMT.find((p) => p.kode_toko === m.kode_toko);
  const tglKunjungan = isoAdd(D0, HARI.indexOf(pj.hari));
  for (const k of listed) {
    if (NONAKTIF.has(k)) continue;
    const r = ruleOf.get(k);
    const x = randMT();
    if (x < 0.15) continue;
    const terakhir = x < 0.7 ? intMT(3, 28) : intMT(31, 120);
    for (let lalu = terakhir, i = 0; lalu <= 180 && i < 4; lalu += intMT(25, 45), i++)
      histori.push({ kode_toko: m.kode_toko, kode_sku: k, tanggal_po: excelSerial(isoAdd(tglKunjungan, -lalu)), qty: r.moq * intMT(1, 3) });
  }
  // SKU tidak listed yang pernah dibeli (tampil tanpa warning).
  const t0 = [...tidak][0];
  histori.push({ kode_toko: m.kode_toko, kode_sku: t0, tanggal_po: excelSerial(isoAdd(tglKunjungan, -intMT(5, 60))), qty: ruleOf.get(t0).moq });
}
const masterV2 = [...master, ...masterMT];
const pjpV2 = [...pjp, ...pjpMT];
histori.sort((a, b) => a.kode_toko.localeCompare(b.kode_toko) || a.tanggal_po - b.tanggal_po);

// GT: TUNAI/KREDIT, TOP & divisi faktur sudah dari data asli (v6).

// ── v5: customer master (bill address 1–4, RPP13, cust group), new material, sub brand,
//        isi karton, price list per channel (RNG terpisah; data lain tidak bergeser) ──
const randV5 = rng(20261113);
const pickV5 = (arr) => arr[Math.floor(randV5() * arr.length)];
const intV5 = (a, b) => a + Math.floor(randV5() * (b - a + 1));
const hargaSku = new Map(produk.map((p) => [p.kode_sku, p.harga]));
const nilaiHistori = new Map();
for (const h of histori) nilaiHistori.set(h.kode_toko, (nilaiHistori.get(h.kode_toko) ?? 0) + h.qty * (hargaSku.get(h.kode_sku) ?? 0));
const KEL = ['Sukamaju', 'Mekarsari', 'Cibubur', 'Harapan Jaya', 'Sukasari', 'Tengah', 'Pasir Gunung', 'Cimanggis'];
const CUST_GROUP = ['BORMA DAKOTA GROUP', 'BORMA CIJERAH GROUP', 'YOMART GROUP', 'GRIYA PASARAYA GROUP', 'SETIABUDI GROUP', 'TIP TOP GROUP'];
for (const m of masterMT) {
  const jalan = m.alamat.split(',')[0];
  m.alamat_1 = jalan;
  m.alamat_2 = `RT ${String(intV5(1, 12)).padStart(2, '0')}/RW ${String(intV5(1, 9)).padStart(2, '0')}`;
  m.alamat_3 = `Kel. ${pickV5(KEL)}`;
  m.alamat_4 = m.area ?? '';
  // RPP13: rata-rata penjualan per bulan (13 periode) — dummy dari histori 6 bulan, minimal Rp 750rb.
  m.rpp13 = Math.max(750_000, Math.round(((nilaiHistori.get(m.kode_toko) ?? 0) / 6) / 1000) * 1000 + intV5(0, 20) * 50_000);
  m.cust_group = pickV5(CUST_GROUP);
}
const ISI = [12, 24, 24, 48];
for (const r of rules) {
  let isi = pickV5(ISI);
  while (isi < r.moq) isi *= 2;
  r.isi_karton = isi;
}
for (const p of produk) {
  p.sub_brand = p.kategori;
  p.new_material = p.nama_sku; // Nama_SKU asli
}
// Price list: GT = harga dasar; MT = +5% (dibulatkan ke Rp 100).
const priceList = [];
for (const p of produk) {
  priceList.push({ kode_sku: p.kode_sku, channel: 'GT', harga: p.harga });
  priceList.push({ kode_sku: p.kode_sku, channel: 'MT', harga: Math.round((p.harga * 1.05) / 100) * 100 });
}

// ── Contoh_Output_Sales & Contoh_Detail_Toko (hitung ulang, independen dari src/lib) ──
const DS = excelSerial(D0);
const fakturPerToko = new Map();
for (const f of rovi) {
  if (f.sisa_tagihan <= 0) continue;
  if (!fakturPerToko.has(f.kode_toko)) fakturPerToko.set(f.kode_toko, []);
  fakturPerToko.get(f.kode_toko).push(f);
}
const nilai = (f) => {
  const sel = DS - f.tanggal_jatuh_tempo;
  return { ...f, st: sel > 0 ? 0 : sel === 0 ? 1 : 2, telat: Math.max(0, sel) };
};
const barisContoh = pjp
  .filter((p) => p.kode_salesman === DEMO_SR.kode && p.tanggal_kunjungan === DS)
  .map((p) => {
    const fs = (fakturPerToko.get(p.kode_toko) ?? []).map(nilai);
    const od = fs.filter((f) => f.st === 0);
    const jt = fs.filter((f) => f.st === 1);
    const maxOd = Math.max(0, ...od.map((f) => f.telat));
    const total = [...od, ...jt].reduce((a, f) => a + f.sisa_tagihan, 0);
    const status = od.length ? `Overdue ${maxOd} hari` : jt.length ? 'Jatuh Tempo Hari Ini' : 'Tidak ada tagihan';
    return [p.urutan, p.kode_toko, masterOf.get(p.kode_toko).nama_toko, status, od.length, jt.length, total, od.length + jt.length ? 'YA' : '-', maxOd];
  })
  .sort((a, b) => (b[7] === 'YA') - (a[7] === 'YA') || b[8] - a[8] || (b[5] > 0) - (a[5] > 0) || a[0] - b[0] || a[1].localeCompare(b[1]));
const rp = (n) => `Rp ${n.toLocaleString('id-ID')}`;
const totalContoh = barisContoh.reduce((a, r) => a + r[6], 0);
const perlu = barisContoh.filter((r) => r[7] === 'YA').length;
const contohSales = [
  [`Kunjungan Hari Ini — ${DEMO_SR.nama} (${DEMO_SR.kode}) — Senin, 9 Nov 2026`],
  [`${barisContoh.length} kunjungan · ${perlu} perlu ditagih · total ${rp(totalContoh)}`],
  [],
  ['urutan_rute', 'kode_toko', 'nama_toko', 'status', 'faktur_overdue', 'faktur_jt_hari_ini', 'total_harus_ditagih', 'perlu_ditagih', 'max_hari_overdue'],
  ...barisContoh,
];
// Toko demo detail: toko non-blokir di rute demo dengan jumlah faktur overdue terbanyak.
const demo = barisContoh.filter((r) => !BLOKIR.includes(r[1])).sort((a, b) => b[4] - a[4] || b[6] - a[6])[0];
const fDemo = (fakturPerToko.get(demo[1]) ?? [])
  .map(nilai)
  .sort((a, b) => a.st - b.st || a.tanggal_jatuh_tempo - b.tanggal_jatuh_tempo || a.no_faktur.localeCompare(b.no_faktur));
const LBL = ['Overdue', 'Jatuh Tempo Hari Ini', 'Belum Jatuh Tempo'];
const contohDetail = [
  [`Detail Toko — ${demo[1]} ${demo[2]} (kunjungan 9 Nov 2026)`],
  [`Harus ditagih: ${rp(demo[6])}`],
  [],
  ['no_faktur', 'tanggal_faktur', 'jatuh_tempo', 'nilai_faktur', 'sisa_tagihan', 'status', 'hari_terlambat'],
  ...fDemo.map((f) => [f.no_faktur, f.tanggal_faktur, f.tanggal_jatuh_tempo, f.nilai_faktur, f.sisa_tagihan, LBL[f.st], f.st === 0 ? f.telat : '']),
];
wb.Sheets.Contoh_Output_Sales = XLSX.utils.aoa_to_sheet(contohSales);
wb.Sheets.Contoh_Detail_Toko = XLSX.utils.aoa_to_sheet(contohDetail);

// ── Tulis ────────────────────────────────────────────────────────────
const setSheet = (name, rows, dateCols = []) => {
  const ws = XLSX.utils.json_to_sheet(rows);
  if (dateCols.length) {
    const range = XLSX.utils.decode_range(ws['!ref']);
    const header = Object.keys(rows[0]);
    for (const c of dateCols) {
      const ci = header.indexOf(c);
      for (let r = 1; r <= range.e.r; r++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c: ci })];
        if (cell) cell.z = 'yyyy-mm-dd';
      }
    }
  }
  if (wb.SheetNames.includes(name)) wb.Sheets[name] = ws;
  else XLSX.utils.book_append_sheet(wb, ws, name);
};
setSheet('Master_Toko', masterV2);
setSheet('ROVI', rovi, ['tanggal_faktur', 'tanggal_jatuh_tempo']);
setSheet('PJP', pjpV2, ['tanggal_kunjungan']);
setSheet('MSL', msl);
setSheet('Produk', produk);
setSheet('Order_Rules', rules);
setSheet('Histori_Sales', histori, ['tanggal_po']);
setSheet('Price_List', priceList);

// README sheet
const readme = [
  ['DATA DUMMY — Sales Visit & Due Invoice Tracker (v6: berbasis data ASLI MD DC Bandung)'],
  ['GT (Arli 000024, Jajang 000032, Yudha 000033) diambil dari docs/source: Customer Master 11-11-2026, PJP SDR18, DI AWAL 9 Nov 2026.'],
  ['PJP 4 minggu: Minggu 1 = 2–8 Nov, Minggu 2 = 9–15 Nov (DI AWAL 9 Nov = Minggu 2 Senin), Minggu 3 = 16–22 Nov, Minggu 4 = 23–29 Nov 2026.'],
  [`ROVI: ${fakturAsli} faktur ASLI dari DI AWAL + ${noInv} faktur DUMMY (INV/2026/..) untuk sisa outstanding Customer Master.`],
  ['Master_Toko: alamat 1–4, limit kredit, TOP, RPP13 = asli. TUNAI jika limit 0 & TOP 0; TOP 0 dengan limit → KREDIT 14 hari (asumsi).'],
  [`Produk/Order_Rules (v7): kode SKU, nama, principal (divisi), kode principal, barcode & MOQ = ASLI dari Min SKU Items NEFOKAM 09-11-2026 (${produk.length} SKU kurasi; Min 0 → MOQ 1).`],
  [`DUMMY: status_blokir demo (${BLOKIR.join(', ')}), area (dari kata kunci alamat), Histori_Sales, harga/kategori/channel/isi karton produk, SKU non-aktif demo (${[...NONAKTIF].join(', ')}), Price_List, seluruh data MT (SLSM01/02, MT00001–MT00060, MSL).`],
  [''],
  ['Sheet: Master_Toko, ROVI (DI AWAL), PJP, Produk, Order_Rules, Histori_Sales, MSL, Price_List, Contoh_Output_Sales, Contoh_Detail_Toko.'],
];
wb.Sheets.README = XLSX.utils.aoa_to_sheet(readme);

const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true });
for (const p of OUT) writeFileSync(p, buf);
console.log(`gt_toko=${master.length} pjp_gt=${pjp.length} faktur_asli=${fakturAsli} faktur_dummy=${noInv} demo=${demo[1]} blokir=${BLOKIR}`);
console.log(`principal=${[...new Set(produk.map((p) => p.divisi))].join(' | ')}`);
console.log(`mt_outlet=${masterMT.length} msl=${msl.length} produk=${produk.length} rules=${rules.length} histori=${histori.length} master=${masterV2.length} blokir=${masterV2.filter((m) => m.status_blokir === 'YA').length}`);
