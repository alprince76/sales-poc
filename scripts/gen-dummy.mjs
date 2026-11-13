/**
 * Menambah data dummy v2 ke Dummy_ROVI_PJP.xlsx (deterministik, seed tetap):
 *  - Master_Toko: + alamat, tipe_outlet, limit_kredit, status_blokir
 *  - Produk, Order_Rules, Histori_Sales (sheet baru)
 * Sheet lama (PJP, ROVI, Contoh_*) TIDAK diubah → test regresi tetap valid.
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

// ── Produk + Order Rules ─────────────────────────────────────────────
// [nama, kategori, harga, satuan, moq, kelipatan, channel]
const KATALOG = {
  Danone: [
    ['SGM Eksplor 1+ Vanila 400gr', 'Susu Pertumbuhan', 48500, 'Pcs', 6, 6, 'GT'],
    ['SGM Eksplor 1+ Madu 900gr', 'Susu Pertumbuhan', 98000, 'Pcs', 3, 3, 'GT'],
    ['SGM Eksplor 3+ Vanila 400gr', 'Susu Pertumbuhan', 47000, 'Pcs', 6, 6, 'GT'],
    ['SGM Ananda 0-6 Bulan 400gr', 'Susu Formula', 55500, 'Pcs', 3, 3, 'GT'],
    ['Bebelac 3 Vanila 800gr', 'Susu Pertumbuhan', 142000, 'Pcs', 2, 1, 'GT'],
    ['Bebelac 4 Madu 800gr', 'Susu Pertumbuhan', 139000, 'Pcs', 2, 1, 'GT'],
    ['Nutrilon Royal 3 800gr', 'Susu Pertumbuhan', 285000, 'Pcs', 1, 1, 'MT'],
    ['SGM Bunda Cokelat 150gr', 'Susu Ibu Hamil', 29500, 'Pcs', 12, 6, 'GT'],
    ['Milna Bubur Bayi Beras Merah 120gr', 'Makanan Bayi', 14500, 'Pcs', 12, 12, 'GT'],
    ['Milna Biskuit Bayi Original 130gr', 'Makanan Bayi', 16000, 'Pcs', 12, 12, 'GT'],
  ],
  Yupi: [
    ['Yupi Milly Moos w/ Milk Hanging 24x108gr', 'Permen Gummy', 168000, 'Pcs', 3, 1, 'GT'],
    ['Yupi Gummy Bears 24x18gr', 'Permen Gummy', 52000, 'Box', 4, 2, 'GT'],
    ['Yupi Strawberry Kiss 24x18gr', 'Permen Gummy', 52000, 'Box', 4, 2, 'GT'],
    ['Yupi Fruit Salad 24x18gr', 'Permen Gummy', 52000, 'Box', 4, 2, 'GT'],
    ['Yupi Gummy Worms Hanging 12x45gr', 'Permen Gummy', 78000, 'Pcs', 3, 1, 'GT'],
    ['Yupi Burger Hanging 24x9gr', 'Permen Gummy', 46000, 'Pcs', 5, 1, 'GT'],
    ['Yupi Pizza Hanging 24x9gr', 'Permen Gummy', 46000, 'Pcs', 5, 1, 'GT'],
    ['Yupi Choco Pop 12x45gr', 'Permen Gummy', 82000, 'Box', 2, 1, 'GT'],
    ['Yupi Party Pack 500gr', 'Permen Gummy', 61000, 'Pcs', 2, 1, 'MT'],
    ['Yupi Sour Bites 24x18gr', 'Permen Gummy', 54000, 'Box', 4, 2, 'GT'],
  ],
  Huki: [
    ['Huki Botol Susu PP 120ml', 'Perlengkapan Bayi', 19500, 'Pcs', 6, 6, 'GT'],
    ['Huki Botol Susu PP 240ml', 'Perlengkapan Bayi', 24500, 'Pcs', 6, 6, 'GT'],
    ['Huki Dot Silikon Bulat S', 'Perlengkapan Bayi', 9500, 'Pcs', 12, 12, 'GT'],
    ['Huki Dot Silikon Bulat M', 'Perlengkapan Bayi', 9500, 'Pcs', 12, 12, 'GT'],
    ['Huki Empeng Bayi Cherry', 'Perlengkapan Bayi', 12500, 'Pcs', 12, 6, 'GT'],
    ['Huki Tissue Basah Bayi 50s', 'Perawatan Bayi', 11000, 'Pcs', 12, 12, 'GT'],
    ['Huki Sikat Botol & Dot', 'Perlengkapan Bayi', 21000, 'Pcs', 6, 6, 'GT'],
    ['Huki Gigitan Bayi Buah', 'Perlengkapan Bayi', 17500, 'Pcs', 6, 6, 'MT'],
    ['Huki Cotton Bud Bayi 100s', 'Perawatan Bayi', 8500, 'Pcs', 12, 12, 'GT'],
    ['Huki Botol Susu Wide Neck 150ml', 'Perlengkapan Bayi', 39000, 'Pcs', 3, 3, 'GT'],
  ],
  'Koepoe-Koepoe': [
    ['Koepoe Pewarna Merah Tua 30ml', 'Pewarna Makanan', 6500, 'Pcs', 24, 12, 'GT'],
    ['Koepoe Pewarna Hijau Daun 30ml', 'Pewarna Makanan', 6500, 'Pcs', 24, 12, 'GT'],
    ['Koepoe Pewarna Kuning Telur 30ml', 'Pewarna Makanan', 6500, 'Pcs', 24, 12, 'GT'],
    ['Koepoe Pasta Pandan 30ml', 'Perisa Makanan', 9000, 'Pcs', 12, 12, 'GT'],
    ['Koepoe Pasta Moka 30ml', 'Perisa Makanan', 9000, 'Pcs', 12, 12, 'GT'],
    ['Koepoe Essence Vanili 30ml', 'Perisa Makanan', 7500, 'Pcs', 12, 12, 'GT'],
    ['Koepoe Baking Powder Double Acting 45gr', 'Bahan Kue', 5500, 'Pcs', 24, 12, 'GT'],
    ['Koepoe Soda Kue 81gr', 'Bahan Kue', 6000, 'Pcs', 24, 12, 'GT'],
    ['Koepoe Bubuk Cokelat 100gr', 'Bahan Kue', 18500, 'Pcs', 6, 6, 'MT'],
    ['Koepoe Agar-Agar Plain 7gr', 'Bahan Kue', 3500, 'Pcs', 48, 24, 'GT'],
  ],
};

const produk = [];
const rules = [];
// SKU yang sudah tidak aktif (discontinued) — tidak boleh tampil di daftar MSL.
const NONAKTIF = new Set(['YUP-009', 'HUK-008', 'KOE-009']);
const PREFIX = { Danone: 'DAN', Yupi: 'YUP', Huki: 'HUK', 'Koepoe-Koepoe': 'KOE' };
for (const [divisi, items] of Object.entries(KATALOG)) {
  items.forEach(([nama, kategori, harga, satuan, moq, kelipatan, channel], i) => {
    const kode = `${PREFIX[divisi]}-${String(i + 1).padStart(3, '0')}`;
    produk.push({ kode_sku: kode, nama_sku: nama, divisi, kategori, harga, channel, status_aktif: NONAKTIF.has(kode) ? 'TIDAK' : 'YA' });
    rules.push({ kode_sku: kode, satuan, moq, kelipatan });
  });
}

// ── Workbook ─────────────────────────────────────────────────────────
mkdirSync('docs/original', { recursive: true });
try {
  readFileSync(SRC);
} catch {
  copyFileSync('docs/Dummy_ROVI_PJP.xlsx', SRC);
}
const wb = XLSX.read(readFileSync(SRC));
const master = XLSX.utils.sheet_to_json(wb.Sheets.Master_Toko, { raw: true });
const pjp = XLSX.utils.sheet_to_json(wb.Sheets.PJP, { raw: true });
const rovi = XLSX.utils.sheet_to_json(wb.Sheets.ROVI, { raw: true });

// Outstanding per toko (untuk menyetel limit kredit yang masuk akal)
const outstanding = new Map();
for (const f of rovi) outstanding.set(f.kode_toko, (outstanding.get(f.kode_toko) ?? 0) + f.sisa_tagihan);

const JALAN = ['Raya', 'Merdeka', 'Pasar', 'Masjid', 'Siliwangi', 'Sudirman', 'Melati', 'Kenanga', 'Cempaka', 'Pahlawan'];
const TIPE = ['Toko Kelontong', 'Toko Kelontong', 'Toko Kelontong', 'Grosir', 'Minimarket', 'Toko Bayi', 'Toko Kue'];
// Toko demo: diblokir / limit tipis (semua ada di rute SLS01 Senin 9 Nov)
const BLOKIR = new Set(['TK00054', 'TK00200']);
const LIMIT_TIPIS = new Set(['TK00090', 'TK00143']);

const masterV2 = master.map((m) => {
  const out = outstanding.get(m.kode_toko) ?? 0;
  let limit = Math.max(10, Math.ceil((out + int(5, 25) * 1_000_000) / 5_000_000) * 5) * 1_000_000;
  if (LIMIT_TIPIS.has(m.kode_toko)) limit = Math.ceil((out + 1_000_000) / 1_000_000) * 1_000_000;
  const blokir = BLOKIR.has(m.kode_toko) || (!LIMIT_TIPIS.has(m.kode_toko) && rand() < 0.02);
  return {
    ...m,
    alamat: `Jl. ${pick(JALAN)} No. ${int(1, 180)}, ${m.area}`,
    tipe_outlet: pick(TIPE),
    limit_kredit: limit,
    status_blokir: blokir ? 'YA' : 'TIDAK',
    channel: 'GT',
  };
});
// Pastikan TEH LENI (contoh demo utama) tidak diblokir.
for (const m of masterV2) if (m.kode_toko === 'TK00236') m.status_blokir = 'TIDAK';

// ── Histori Sales: Mei–Okt 2026 untuk tiap toko di PJP ───────────────
const excelSerial = (iso) => Date.UTC(...iso.split('-').map((v, i) => (i === 1 ? v - 1 : +v))) / 86_400_000 + 25569;
const BULAN = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
const gtSku = produk.filter((p) => p.channel === 'GT');
const ruleOf = new Map(rules.map((r) => [r.kode_sku, r]));
const histori = [];
const tokoPjp = [...new Set(pjp.map((p) => p.kode_toko))];
for (const kode of tokoPjp) {
  const n = int(2, 5);
  const skus = new Set();
  while (skus.size < n) skus.add(pick(gtSku).kode_sku);
  for (const sku of skus) {
    const r = ruleOf.get(sku);
    const base = r.moq * int(1, 3);
    for (const bln of BULAN) {
      if (rand() > 0.6) continue;
      const hari = String(int(1, 28)).padStart(2, '0');
      const qty = Math.max(r.moq, Math.ceil((base * (0.6 + rand() * 0.8)) / r.kelipatan) * r.kelipatan);
      histori.push({ kode_toko: kode, kode_sku: sku, tanggal_po: excelSerial(`${bln}-${hari}`), qty });
    }
  }
}
histori.sort((a, b) => a.kode_toko.localeCompare(b.kode_toko) || a.tanggal_po - b.tanggal_po);

// ── Modern Trade (MT): SR, outlet, PJP, MSL, histori ──────────────────
// RNG terpisah supaya data GT di atas tidak berubah.
const randMT = rng(20261111);
const pickMT = (arr) => arr[Math.floor(randMT() * arr.length)];
const intMT = (a, b) => a + Math.floor(randMT() * (b - a + 1));
const D0 = '2026-11-09';
const isoAdd = (iso, n) => new Date(Date.UTC(...iso.split('-').map((v, i) => (i === 1 ? v - 1 : +v))) + n * 86_400_000).toISOString().slice(0, 10);
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
masterV2.push(...masterMT);
const pjpV2 = [...pjp, ...pjpMT];
histori.sort((a, b) => a.kode_toko.localeCompare(b.kode_toko) || a.tanggal_po - b.tanggal_po);

// ── v4: kode SAP, divisi faktur, TUNAI/KREDIT + TOP (RNG terpisah; data lain tidak bergeser) ──
const randV4 = rng(20261112);
const DIV_IDX = { Danone: 1, Yupi: 2, Huki: 3, 'Koepoe-Koepoe': 4 };
const SAP = new Map();
for (const p of produk) {
  const i = Number(p.kode_sku.split('-')[1]);
  SAP.set(p.kode_sku, String(10000000 + DIV_IDX[p.divisi] * 100000 + 2000 + i * 17));
}
const sap = (k) => SAP.get(k) ?? k;
for (const p of produk) p.kode_sku = sap(p.kode_sku);
for (const r of rules) r.kode_sku = sap(r.kode_sku);
for (const h of histori) h.kode_sku = sap(h.kode_sku);
for (const m of msl) m.kode_sku = sap(m.kode_sku);

const TOP = [14, 21, 30, 30];
for (const m of masterV2) {
  if (m.channel !== 'GT') continue;
  const tunai = randV4() < 0.25;
  m.tipe_bayar = tunai ? 'TUNAI' : 'KREDIT';
  m.top_hari = tunai ? 0 : TOP[Math.floor(randV4() * TOP.length)];
}
// Toko demo: TEH LENI & toko blokir/limit tipis = KREDIT; WARMEL contoh TUNAI tidak dipaksa.
for (const m of masterV2)
  if (['TK00236', 'TK00054', 'TK00200', 'TK00090', 'TK00143'].includes(m.kode_toko)) {
    m.tipe_bayar = 'KREDIT';
    m.top_hari = 30;
  }
// TUNAI: limit kredit tidak berlaku.
for (const m of masterV2) if (m.tipe_bayar === 'TUNAI') delete m.limit_kredit;

const roviV4 = rovi.map((f) => {
  const x = randV4();
  return { ...f, divisi: x < 0.45 ? 'DNE' : x < 0.85 ? 'CBN' : 'MRS' };
});

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
for (const m of masterV2) {
  const jalan = m.alamat.split(',')[0];
  m.alamat_1 = jalan;
  m.alamat_2 = `RT ${String(intV5(1, 12)).padStart(2, '0')}/RW ${String(intV5(1, 9)).padStart(2, '0')}`;
  m.alamat_3 = `Kel. ${pickV5(KEL)}`;
  m.alamat_4 = m.area ?? '';
  // RPP13: rata-rata penjualan per bulan (13 periode) — dummy dari histori 6 bulan, minimal Rp 750rb.
  m.rpp13 = Math.max(750_000, Math.round(((nilaiHistori.get(m.kode_toko) ?? 0) / 6) / 1000) * 1000 + intV5(0, 20) * 50_000);
  if (m.channel === 'MT') m.cust_group = pickV5(CUST_GROUP);
}
const ISI = [12, 24, 24, 48];
for (const r of rules) {
  let isi = pickV5(ISI);
  while (isi < r.moq) isi *= 2;
  r.isi_karton = isi;
}
const isiOf = new Map(rules.map((r) => [r.kode_sku, r.isi_karton]));
for (const p of produk) {
  p.sub_brand = p.kategori;
  p.new_material = `${p.nama_sku.toUpperCase()} 1X${isiOf.get(p.kode_sku) ?? 1}`;
}
// Price list: GT = harga dasar; MT = +5% (dibulatkan ke Rp 100).
const priceList = [];
for (const p of produk) {
  priceList.push({ kode_sku: p.kode_sku, channel: 'GT', harga: p.harga });
  priceList.push({ kode_sku: p.kode_sku, channel: 'MT', harga: Math.round((p.harga * 1.05) / 100) * 100 });
}

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
setSheet('ROVI', roviV4, ['tanggal_faktur', 'tanggal_jatuh_tempo']);
setSheet('PJP', pjpV2, ['tanggal_kunjungan']);
setSheet('MSL', msl);
setSheet('Produk', produk);
setSheet('Order_Rules', rules);
setSheet('Histori_Sales', histori, ['tanggal_po']);
setSheet('Price_List', priceList);

// README sheet: tambahkan keterangan
const readme = XLSX.utils.sheet_to_json(wb.Sheets.README, { header: 1 });
if (!readme.some((r) => String(r[0] ?? '').startsWith('v5:'))) {
  readme.push(['v5: Master_Toko.alamat_1..4 + rpp13 + cust_group (MT); Produk.sub_brand + new_material; Order_Rules.isi_karton; sheet Price_List (GT/MT) = DUMMY.']);
}
if (!readme.some((r) => String(r[0] ?? '').startsWith('v4:'))) {
  readme.push(['v4: kode_sku = kode SAP 8 digit; ROVI.divisi (DNE/CBN/MRS); Master_Toko.tipe_bayar (TUNAI/KREDIT) + top_hari = DUMMY.']);
}
if (!readme.some((r) => String(r[0] ?? '').startsWith('v3:'))) {
  readme.push(['v3: Modern Trade — SR SLSM01/SLSM02, outlet MT00001–MT00060 (channel=MT), PJP 9–14 Nov, sheet MSL (status_listed YES/NO), Produk.status_aktif = DUMMY.']);
}
if (!readme.some((r) => String(r[0] ?? '').startsWith('v2:'))) {
  readme.push([''], ['v2: Master_Toko + alamat/tipe_outlet/limit_kredit/status_blokir; sheet Produk, Order_Rules, Histori_Sales (Mei–Okt 2026) = DUMMY.']);
}
wb.Sheets.README = XLSX.utils.aoa_to_sheet(readme);

const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true });
for (const p of OUT) writeFileSync(p, buf);
console.log(`mt_outlet=${masterMT.length} msl=${msl.length} produk=${produk.length} rules=${rules.length} histori=${histori.length} master=${masterV2.length} blokir=${masterV2.filter((m) => m.status_blokir === 'YA').length}`);
