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
const PREFIX = { Danone: 'DAN', Yupi: 'YUP', Huki: 'HUK', 'Koepoe-Koepoe': 'KOE' };
for (const [divisi, items] of Object.entries(KATALOG)) {
  items.forEach(([nama, kategori, harga, satuan, moq, kelipatan, channel], i) => {
    const kode = `${PREFIX[divisi]}-${String(i + 1).padStart(3, '0')}`;
    produk.push({ kode_sku: kode, nama_sku: nama, divisi, kategori, harga, channel });
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
setSheet('Produk', produk);
setSheet('Order_Rules', rules);
setSheet('Histori_Sales', histori, ['tanggal_po']);

// README sheet: tambahkan keterangan
const readme = XLSX.utils.sheet_to_json(wb.Sheets.README, { header: 1 });
if (!readme.some((r) => String(r[0] ?? '').startsWith('v2:'))) {
  readme.push([''], ['v2: Master_Toko + alamat/tipe_outlet/limit_kredit/status_blokir; sheet Produk, Order_Rules, Histori_Sales (Mei–Okt 2026) = DUMMY.']);
  wb.Sheets.README = XLSX.utils.aoa_to_sheet(readme);
}

const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true });
for (const p of OUT) writeFileSync(p, buf);
console.log(`produk=${produk.length} rules=${rules.length} histori=${histori.length} master=${masterV2.length} blokir=${masterV2.filter((m) => m.status_blokir === 'YA').length}`);
