/**
 * Parsing + validasi baris Excel/CSV untuk Master, ROVI, PJP, Produk, Order Rules, Histori Sales, MSL.
 * Header case-insensitive (spasi → underscore). Nomor baris = nomor baris Excel (header = baris 1).
 */
import * as XLSX from 'xlsx';
import { normalizeDate } from './dates';
import { normKode } from './billing';
import type { DataSet, Faktur, HistoriSales, Kunjungan, MasterToko, MslListing, OrderRule, PriceList, Produk } from './types';

export type TipeData = keyof DataSet;
export const SEMUA_TIPE: TipeData[] = ['master', 'rovi', 'pjp', 'produk', 'rules', 'histori', 'msl', 'price'];

type JenisKolom = 'string' | 'date' | 'int' | 'bool';
interface Kolom {
  nama: string;
  jenis: JenisKolom;
  wajib: boolean;
  /** Nama header lain di laporan mentah (dinormalisasi lewat normHeader). */
  alias?: string[];
}

export const SKEMA: Record<TipeData, { sheet: string; kolom: Kolom[] }> = {
  master: {
    sheet: 'Master_Toko',
    kolom: [
      { nama: 'kode_salesman', jenis: 'string', wajib: true, alias: ['kode_sales', 'kd_salesman', 'salesman_code', 'kode_sr'] },
      { nama: 'nama_salesman', jenis: 'string', wajib: true, alias: ['salesman', 'nama_sales', 'sales', 'sr'] },
      { nama: 'salesman_bw', jenis: 'string', wajib: false },
      { nama: 'kode_toko', jenis: 'string', wajib: true, alias: ['cust_code1', 'cust_code', 'customer_code', 'kode_outlet', 'outlet', 'no_outlet', 'kode_customer', 'customer', 'kd_outlet'] },
      { nama: 'nama_toko', jenis: 'string', wajib: true, alias: ['cust_name', 'customer_name', 'nama_outlet', 'outlet_name', 'nama_customer'] },
      { nama: 'area', jenis: 'string', wajib: false },
      { nama: 'alamat', jenis: 'string', wajib: false, alias: ['address', 'alamat_toko'] },
      { nama: 'alamat_1', jenis: 'string', wajib: false, alias: ['bill_adrress1', 'bill_address1', 'bill_address_1'] },
      { nama: 'alamat_2', jenis: 'string', wajib: false, alias: ['bill_adrress2', 'bill_address2', 'bill_address_2'] },
      { nama: 'alamat_3', jenis: 'string', wajib: false, alias: ['bill_adrress3', 'bill_address3', 'bill_address_3'] },
      { nama: 'alamat_4', jenis: 'string', wajib: false, alias: ['bill_adrress4', 'bill_address4', 'bill_address_4'] },
      { nama: 'tipe_outlet', jenis: 'string', wajib: false, alias: ['type', 'type_outlet', 'tipe'] },
      { nama: 'cust_group', jenis: 'string', wajib: false, alias: ['group_outlet', 'customer_group'] },
      { nama: 'rpp13', jenis: 'int', wajib: false },
      { nama: 'limit_kredit', jenis: 'int', wajib: false, alias: ['ship_credit_limit', 'credit_limit', 'kredit_limit', 'limit'] },
      { nama: 'status_blokir', jenis: 'bool', wajib: false, alias: ['blokir', 'blocked', 'status_block'] },
      { nama: 'channel', jenis: 'string', wajib: false },
      { nama: 'tipe_bayar', jenis: 'string', wajib: false, alias: ['cara_bayar', 'payment_type', 'tunai_kredit'] },
      { nama: 'top_hari', jenis: 'int', wajib: false, alias: ['top', 'term_of_payment'] },
    ],
  },
  rovi: {
    sheet: 'ROVI',
    kolom: [
      { nama: 'kode_toko', jenis: 'string', wajib: true, alias: ['outlet', 'kode_outlet', 'cust_code', 'cust_code1', 'customer'] },
      { nama: 'nama_toko', jenis: 'string', wajib: true, alias: ['nama_outlet', 'cust_name', 'outlet_name'] },
      { nama: 'no_faktur', jenis: 'string', wajib: true, alias: ['no_invoice', 'invoice', 'nomor_faktur', 'no_inv'] },
      { nama: 'tanggal_faktur', jenis: 'date', wajib: true, alias: ['tgl_invoice', 'tanggal_invoice', 'invoice_date', 'tgl_faktur'] },
      { nama: 'tanggal_jatuh_tempo', jenis: 'date', wajib: true, alias: ['due_date', 'jatuh_tempo', 'tgl_jatuh_tempo'] },
      { nama: 'nilai_faktur', jenis: 'int', wajib: true, alias: ['nilai_invoice', 'invoice_amount', 'nilai'] },
      { nama: 'sisa_tagihan', jenis: 'int', wajib: true, alias: ['belum_bayar', 'outstanding', 'sisa', 'saldo'] },
      { nama: 'divisi', jenis: 'string', wajib: false, alias: ['principal', 'principle', 'div'] },
    ],
  },
  pjp: {
    sheet: 'PJP',
    kolom: [
      { nama: 'kode_salesman', jenis: 'string', wajib: true, alias: ['kode_sales', 'kd_salesman', 'salesman_code'] },
      { nama: 'nama_salesman', jenis: 'string', wajib: true, alias: ['salesman', 'nama_sales', 'sales'] },
      { nama: 'tanggal_kunjungan', jenis: 'date', wajib: true, alias: ['tanggal', 'tgl_kunjungan', 'tgl', 'visit_date', 'date'] },
      { nama: 'hari', jenis: 'string', wajib: false },
      { nama: 'kode_toko', jenis: 'string', wajib: true, alias: ['outlet', 'kode_outlet', 'no_outlet', 'cust_code', 'cust_code1', 'customer'] },
      { nama: 'nama_toko', jenis: 'string', wajib: false, alias: ['nama_outlet', 'cust_name', 'outlet_name'] },
      { nama: 'urutan', jenis: 'int', wajib: false, alias: ['no', 'rute', 'urut', 'seq'] },
    ],
  },
  produk: {
    sheet: 'Produk',
    kolom: [
      { nama: 'kode_sku', jenis: 'string', wajib: true, alias: ['sku', 'kode_material', 'material', 'kode_barang', 'item_code'] },
      { nama: 'nama_sku', jenis: 'string', wajib: true, alias: ['nama_material', 'nama_barang', 'item_name', 'description', 'deskripsi'] },
      { nama: 'divisi', jenis: 'string', wajib: true, alias: ['principle', 'principal'] },
      { nama: 'kategori', jenis: 'string', wajib: false },
      { nama: 'sub_brand', jenis: 'string', wajib: false },
      { nama: 'new_material', jenis: 'string', wajib: false },
      { nama: 'harga', jenis: 'int', wajib: true, alias: ['price', 'harga_dasar'] },
      { nama: 'channel', jenis: 'string', wajib: false },
      { nama: 'status_aktif', jenis: 'bool', wajib: false, alias: ['status_active', 'aktif', 'active'] },
    ],
  },
  rules: {
    sheet: 'Order_Rules',
    kolom: [
      { nama: 'kode_sku', jenis: 'string', wajib: true, alias: ['sku', 'kode_material', 'material', 'kode_barang', 'item_code'] },
      { nama: 'satuan', jenis: 'string', wajib: true, alias: ['uom', 'unit'] },
      { nama: 'moq', jenis: 'int', wajib: true, alias: ['min_sku_items', 'min_sku', 'minimum_order', 'min_order', 'min_qty'] },
      { nama: 'kelipatan', jenis: 'int', wajib: false },
      { nama: 'isi_karton', jenis: 'int', wajib: false, alias: ['isi_per_karton', 'isi_car', 'pcs_per_car', 'konversi'] },
    ],
  },
  histori: {
    sheet: 'Histori_Sales',
    kolom: [
      { nama: 'kode_toko', jenis: 'string', wajib: true, alias: ['outlet', 'kode_outlet', 'cust_code', 'customer'] },
      { nama: 'kode_sku', jenis: 'string', wajib: true, alias: ['sku', 'kode_material', 'material'] },
      { nama: 'tanggal_po', jenis: 'date', wajib: true, alias: ['tanggal', 'tgl_po', 'tgl_order', 'tanggal_order', 'order_date'] },
      { nama: 'qty', jenis: 'int', wajib: true, alias: ['quantity', 'jumlah', 'qty_pcs'] },
    ],
  },
  msl: {
    sheet: 'MSL',
    kolom: [
      { nama: 'kode_toko', jenis: 'string', wajib: true, alias: ['outlet', 'kode_outlet', 'cust_code', 'customer'] },
      { nama: 'kode_sku', jenis: 'string', wajib: true, alias: ['sku', 'kode_material', 'material'] },
      { nama: 'status_listed', jenis: 'bool', wajib: true, alias: ['listed', 'status'] },
    ],
  },
  price: {
    sheet: 'Price_List',
    kolom: [
      { nama: 'kode_sku', jenis: 'string', wajib: true, alias: ['sku', 'kode_material', 'material'] },
      { nama: 'harga', jenis: 'int', wajib: true, alias: ['price', 'harga_jual'] },
      { nama: 'channel', jenis: 'string', wajib: false },
    ],
  },
};

/** "YA"/"TIDAK", "Y"/"N", "true"/"false", 1/0. */
export function parseBool(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1 ? true : v === 0 ? false : null;
  const s = String(v).trim().toUpperCase().replace(/\s+/g, ' ');
  if (['YA', 'Y', 'YES', 'TRUE', '1', 'BLOKIR', 'BLOCKED', 'AKTIF', 'ACTIVE', 'LISTED', 'ADA', 'OK', 'V', '✓', '✔'].includes(s)) return true;
  if (['TIDAK', 'T', 'N', 'NO', 'FALSE', '0', '-', 'TIDAK AKTIF', 'NONAKTIF', 'NON AKTIF', 'INACTIVE', 'NOT LISTED', 'UNLISTED', 'TIDAK ADA'].includes(s))
    return false;
  return null;
}

export interface ErrorBaris {
  baris: number;
  alasan: string;
  /** Nilai asli baris di file (untuk diunduh & diperbaiki). */
  nilai?: unknown[];
}

export interface HasilParse<T> {
  /** Kosong bila valid; bila ada kolom wajib hilang, file ditolak. */
  kolomHilang: string[];
  valid: T[];
  error: ErrorBaris[];
  totalBaris: number;
  /** Baris judul/subtotal/footer laporan (semua kolom kode/nama wajib kosong) — dilewati, bukan error. */
  dilewati?: number;
}

type Rows = { values: unknown[]; excelRow: number }[];

export function normHeader(h: unknown): string {
  return String(h ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function isKosong(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

/**
 * Angka rupiah/qty → bilangan bulat (desimal dibulatkan).
 * Terima: 1250000, 1250000.4, "1.250.000", "1,250,000", "Rp 1.250.000", "1.250.000,00", "(1.200)" = -1200, "12 pcs".
 */
export function parseInt0(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : null;
  if (typeof v !== 'string') return null;
  let s = v.trim();
  let neg = false;
  const kurung = /^\((.*)\)$/.exec(s);
  if (kurung) {
    neg = true;
    s = kurung[1];
  }
  s = s
    .replace(/^rp\.?\s*/i, '')
    .replace(/\s*(pcs|pc|car|ctn|karton|box|unit|buah|hari|days?)\.?$/i, '')
    .replace(/\s+/g, '');
  if (s.startsWith('-')) {
    neg = !neg;
    s = s.slice(1);
  }
  let n: number | null = null;
  if (/^\d+$/.test(s)) n = Number(s);
  // Pemisah ribuan titik/koma (kelompok 3 digit), opsional desimal 1–2 digit dengan pemisah lain.
  else if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) n = Number(s.replace(/\./g, '').replace(',', '.'));
  else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) n = Number(s.replace(/,/g, ''));
  // Desimal biasa: "12.5" / "12,5" (bukan kelompok 3 digit).
  else if (/^\d+[.,]\d{1,2}$/.test(s)) n = Number(s.replace(',', '.'));
  if (n === null || !Number.isFinite(n)) return null;
  const r = Math.round(n);
  return neg ? -r : r;
}

/** Nama kolom untuk ditampilkan ke user ("kode_toko" → "Kode toko"). */
const LABEL: Record<string, string> = {
  kode_sku: 'Kode SKU',
  nama_sku: 'Nama SKU',
  no_faktur: 'No faktur',
  moq: 'MOQ',
  rpp13: 'RPP13',
  top_hari: 'TOP (hari)',
  status_listed: 'Status listed',
  salesman_bw: 'Salesman BW',
  qty: 'Qty',
  po: 'PO',
};
export function labelKolom(nama: string): string {
  if (LABEL[nama]) return LABEL[nama];
  const t = nama.replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const kutip = (v: unknown) => {
  const t = String(v).trim();
  return `"${t.length > 30 ? t.slice(0, 30) + '…' : t}"`;
};

/** Normalisasi pilihan teks bebas ke nilai baku; null = tidak dikenal. */
function pilihan(v: unknown, peta: Record<string, string[]>): string | null {
  const s = String(v).trim().toUpperCase().replace(/[\s_-]+/g, ' ');
  for (const [baku, alias] of Object.entries(peta)) if (s === baku || alias.includes(s)) return baku;
  return null;
}
const CHANNEL = { GT: ['GENERAL TRADE', 'G T', 'TRADISIONAL', 'TRADITIONAL'], MT: ['MODERN TRADE', 'M T', 'MODERN'] };
const SEMUA_CHANNEL = ['', 'ALL', 'SEMUA', 'GT/MT', 'GT MT', 'GT&MT', 'GT & MT'];

/** Ubah sheet SheetJS jadi array baris mentah + nomor baris Excel (header = baris pertama sheet). */
export function sheetToRows(ws: XLSX.WorkSheet): { header: unknown[]; rows: Rows } {
  const { aoa, startRow } = keAoa(ws);
  return potongDiHeader(aoa, startRow, 0);
}

function keAoa(ws: XLSX.WorkSheet, maksBaris?: number) {
  let batas: string | undefined;
  if (maksBaris && ws['!ref']) {
    const r = XLSX.utils.decode_range(ws['!ref']);
    r.e.r = Math.min(r.e.r, r.s.r + maksBaris - 1);
    batas = XLSX.utils.encode_range(r);
  }
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: true, range: batas });
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
  return { aoa, startRow: range.s.r + 1 }; // 1-based
}

function potongDiHeader(aoa: unknown[][], startRow: number, iHeader: number): { header: unknown[]; rows: Rows } {
  const header = aoa[iHeader] ?? [];
  const rows: Rows = [];
  for (let i = iHeader + 1; i < aoa.length; i++) {
    const values = aoa[i] ?? [];
    if (values.every(isKosong)) continue;
    rows.push({ values, excelRow: startRow + i });
  }
  return { header, rows };
}

/**
 * Pemetaan kolom manual (file mentah): per kolom skema → nama header file (dinormalisasi) atau nilai tetap untuk semua baris.
 * Disimpan per jenis data supaya upload berikutnya dengan format sama langsung cocok.
 */
export type PetaKolom = Record<string, { header: string } | { tetap: string }>;

/** Header file (asli & normal) → indeks kolom skema yang cocok: nama persis dulu, lalu peta manual, lalu alias. */
function cocokkan(tipe: TipeData, header: unknown[], peta?: PetaKolom): Map<string, number> {
  const idx = new Map<string, number>();
  header.forEach((h, i) => {
    const n = normHeader(h);
    if (n && !idx.has(n)) idx.set(n, i);
  });
  const pos = new Map<string, number>();
  const dipakai = new Set<number>();
  const pasang = (kol: string, i: number | undefined) => {
    if (i === undefined || pos.has(kol)) return;
    pos.set(kol, i);
    dipakai.add(i);
  };
  const kolom = SKEMA[tipe].kolom;
  for (const k of kolom) pasang(k.nama, idx.get(k.nama));
  for (const k of kolom) {
    const p = peta?.[k.nama];
    if (p && 'header' in p) {
      const i = idx.get(normHeader(p.header));
      if (i !== undefined) {
        pos.delete(k.nama);
        pasang(k.nama, i);
      }
    }
  }
  for (const k of kolom)
    for (const a of k.alias ?? []) {
      const i = idx.get(a);
      if (i !== undefined && !dipakai.has(i)) pasang(k.nama, i);
    }
  return pos;
}

/** Kolom skema → header file yang terdeteksi otomatis (nama persis / alias), tanpa pemetaan manual. */
export function deteksiKolom(tipe: TipeData, header: unknown[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, i] of cocokkan(tipe, header)) out[k] = String(header[i] ?? '').trim();
  return out;
}

export interface AnalisaSheet {
  /** Header file apa adanya (untuk pilihan di panel pemetaan). */
  header: string[];
  /** Nomor baris Excel header (1-based). */
  barisHeader: number;
  /** Kolom skema → header file yang terdeteksi otomatis. */
  otomatis: Record<string, string>;
  header_raw: unknown[];
  rows: Rows;
}

/** Cari baris header: dari 30 baris pertama, yang paling banyak cocok dengan kolom skema (lewati judul/parameter laporan). */
export function analisaSheet(tipe: TipeData, ws: XLSX.WorkSheet, peta?: PetaKolom): AnalisaSheet {
  const { aoa, startRow } = keAoa(ws);
  let terbaik = 0;
  let skor = -1;
  for (let i = 0; i < Math.min(aoa.length, 30); i++) {
    const n = cocokkan(tipe, aoa[i] ?? [], peta).size;
    if (n > skor) {
      skor = n;
      terbaik = i;
    }
  }
  const { header, rows } = potongDiHeader(aoa, startRow, terbaik);
  const pos = cocokkan(tipe, header, peta);
  const otomatis: Record<string, string> = {};
  for (const [k, i] of pos) otomatis[k] = String(header[i] ?? '');
  return {
    header: header.map((h) => String(h ?? '').trim()),
    barisHeader: startRow + terbaik,
    otomatis,
    header_raw: header,
    rows,
  };
}

function parseRows<T>(tipe: TipeData, header: unknown[], rows: Rows, peta?: PetaKolom): HasilParse<T> {
  const skema = SKEMA[tipe];
  const pos = cocokkan(tipe, header, peta);
  const tetap = new Map<string, string>();
  for (const k of skema.kolom) {
    const p = peta?.[k.nama];
    if (p && 'tetap' in p && p.tetap.trim() !== '') tetap.set(k.nama, p.tetap.trim());
  }
  const kolomHilang = skema.kolom.filter((k) => k.wajib && !pos.has(k.nama) && !tetap.has(k.nama)).map((k) => k.nama);
  if (kolomHilang.length) return { kolomHilang, valid: [], error: [], totalBaris: rows.length };

  const valid: T[] = [];
  const error: ErrorBaris[] = [];
  const seenFaktur = new Set<string>();
  // Kolom teks wajib dari file (bukan nilai tetap): bila semuanya kosong, baris itu judul/subtotal/footer.
  const kunciTeks = skema.kolom.filter((k) => k.wajib && k.jenis === 'string' && !tetap.has(k.nama)).map((k) => pos.get(k.nama)!);
  let dilewati = 0;

  for (const { values, excelRow } of rows) {
    if (kunciTeks.length && kunciTeks.every((i) => isKosong(values[i]))) {
      dilewati++;
      continue;
    }
    const obj: Record<string, unknown> = {};
    const alasan: string[] = [];
    for (const k of skema.kolom) {
      const i = pos.get(k.nama);
      let raw = tetap.has(k.nama) ? tetap.get(k.nama) : i === undefined ? null : values[i];
      if ((k.jenis === 'int' || k.jenis === 'date') && typeof raw === 'string' && /^[-–—]$/.test(raw.trim())) raw = null;
      if (isKosong(raw)) {
        if (k.wajib) alasan.push(`${labelKolom(k.nama)} kosong`);
        continue;
      }
      if (k.jenis === 'string') {
        obj[k.nama] = String(raw).trim();
      } else if (k.jenis === 'date') {
        const d = normalizeDate(raw);
        if (d) obj[k.nama] = d;
        else alasan.push(`${labelKolom(k.nama)} bukan tanggal ${kutip(raw)}. Tulis seperti 09-11-2026 atau 2026-11-09`);
      } else if (k.jenis === 'bool') {
        const b = parseBool(raw);
        if (b === null) alasan.push(`${labelKolom(k.nama)} harus YA atau TIDAK, bukan ${kutip(raw)}`);
        else obj[k.nama] = b;
      } else {
        const n = parseInt0(raw);
        if (n === null) alasan.push(`${labelKolom(k.nama)} harus angka, bukan ${kutip(raw)}`);
        // rpp13 (rata-rata penjualan) boleh negatif di data asli (net retur).
        else if (n < 0 && k.nama !== 'rpp13') alasan.push(`${labelKolom(k.nama)} tidak boleh minus`);
        else obj[k.nama] = n;
      }
    }
    if ('kode_toko' in obj) obj.kode_toko = normKode(obj.kode_toko as string);
    if ('kode_salesman' in obj) obj.kode_salesman = normKode(obj.kode_salesman as string);
    if ('kode_sku' in obj) obj.kode_sku = normKode(obj.kode_sku as string);
    if (tipe === 'price' && 'channel' in obj) {
      const ch = pilihan(obj.channel, CHANNEL);
      if (ch) obj.channel = ch;
      else if (SEMUA_CHANNEL.includes(String(obj.channel).trim().toUpperCase())) delete obj.channel;
      else alasan.push(`Channel harus GT, MT, atau dikosongkan (berlaku semua), bukan ${kutip(obj.channel)}`);
    }
    if (tipe === 'master' && 'channel' in obj) obj.channel = pilihan(obj.channel, CHANNEL) ?? String(obj.channel).trim().toUpperCase();
    if (tipe === 'master' && 'tipe_bayar' in obj) {
      const tb = pilihan(obj.tipe_bayar, { TUNAI: ['CASH', 'COD', 'CBD', 'C'], KREDIT: ['CREDIT', 'TOP', 'TEMPO', 'K'] });
      if (!tb) alasan.push(`Tipe bayar harus TUNAI atau KREDIT, bukan ${kutip(obj.tipe_bayar)}`);
      else obj.tipe_bayar = tb;
    }
    if (tipe === 'rovi' && 'divisi' in obj) obj.divisi = String(obj.divisi).trim().toUpperCase();
    if (tipe === 'rules' && !alasan.length && (obj.moq as number) < 1) alasan.push('MOQ minimal 1');
    if (tipe === 'rules' && !alasan.length && obj.kelipatan !== undefined && (obj.kelipatan as number) < 1)
      alasan.push('Kelipatan minimal 1');
    if (tipe === 'rules' && !alasan.length && obj.isi_karton !== undefined && (obj.isi_karton as number) < 1)
      alasan.push('Isi karton minimal 1');
    if (tipe === 'price' && !alasan.length) {
      const key = `${obj.kode_sku}|${obj.channel ?? ''}`;
      if (seenFaktur.has(key)) alasan.push(`SKU ${obj.kode_sku} untuk channel ${obj.channel ?? 'semua'} sudah ada di baris sebelumnya`);
      seenFaktur.add(key);
    }
    if ((tipe === 'produk' || tipe === 'rules') && !alasan.length) {
      const sku = obj.kode_sku as string;
      if (seenFaktur.has(sku)) alasan.push(`Kode SKU ${sku} sudah ada di baris sebelumnya`);
      seenFaktur.add(sku);
    }

    if (tipe === 'rovi' && !alasan.length) {
      const no = String(obj.no_faktur).trim().toUpperCase();
      if (seenFaktur.has(no)) alasan.push(`No faktur ${obj.no_faktur} sudah ada di baris sebelumnya`);
      seenFaktur.add(no);
    }

    if (alasan.length) error.push({ baris: excelRow, alasan: alasan.join('; '), nilai: values });
    else valid.push(obj as T);
  }
  return { kolomHilang: [], valid, error, totalBaris: rows.length - dilewati, dilewati };
}

export function parseSheet(tipe: 'master', ws: XLSX.WorkSheet): HasilParse<MasterToko>;
export function parseSheet(tipe: 'rovi', ws: XLSX.WorkSheet): HasilParse<Faktur>;
export function parseSheet(tipe: 'pjp', ws: XLSX.WorkSheet): HasilParse<Kunjungan>;
export function parseSheet(tipe: 'produk', ws: XLSX.WorkSheet): HasilParse<Produk>;
export function parseSheet(tipe: 'rules', ws: XLSX.WorkSheet): HasilParse<OrderRule>;
export function parseSheet(tipe: 'histori', ws: XLSX.WorkSheet): HasilParse<HistoriSales>;
export function parseSheet(tipe: 'msl', ws: XLSX.WorkSheet): HasilParse<MslListing>;
export function parseSheet(tipe: 'price', ws: XLSX.WorkSheet): HasilParse<PriceList>;
export function parseSheet(tipe: TipeData, ws: XLSX.WorkSheet, peta?: PetaKolom): HasilParse<unknown>;
export function parseSheet(tipe: TipeData, ws: XLSX.WorkSheet, peta?: PetaKolom): HasilParse<unknown> {
  const a = analisaSheet(tipe, ws, peta);
  return parseRows(tipe, a.header_raw, a.rows, peta);
}

/** Parse hasil analisaSheet (tanpa membaca ulang sheet) — dipakai panel pemetaan kolom. */
export function parseAnalisa<T = unknown>(tipe: TipeData, a: AnalisaSheet, peta?: PetaKolom): HasilParse<T> {
  return parseRows<T>(tipe, a.header_raw, a.rows, peta);
}

/** Workbook berisi baris yang error (nilai asli + alasan) — diperbaiki di Excel lalu di-upload lagi. */
export function workbookError(header: string[], error: ErrorBaris[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    [...header, 'ALASAN ERROR (hapus kolom ini boleh)', 'BARIS DI FILE ASLI'],
    ...error.map((e) => [...header.map((_, i) => e.nilai?.[i] ?? null), e.alasan, e.baris]),
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'Perlu_Diperbaiki');
  return wb;
}

/** Kelompokkan alasan error ("Kode toko kosong" ×12) supaya mudah dibaca. Urut dari yang terbanyak. */
export function ringkasError(error: ErrorBaris[]): { alasan: string; jumlah: number; contohBaris: number[] }[] {
  const g = new Map<string, { jumlah: number; contohBaris: number[] }>();
  for (const e of error)
    for (const a of e.alasan.split('; ')) {
      const k = a
        .replace(/,? bukan "[^"]*".*$/, '')
        .replace(/ "[^"]*".*$/, '')
        .replace(/ \S+ (untuk channel \S+ )?sudah ada/, ' sudah ada');
      const v = g.get(k) ?? { jumlah: 0, contohBaris: [] };
      v.jumlah++;
      if (v.contohBaris.length < 5) v.contohBaris.push(e.baris);
      g.set(k, v);
    }
  return [...g].map(([alasan, v]) => ({ alasan, ...v })).sort((a, b) => b.jumlah - a.jumlah);
}

// ── Template & ekspor ──
const FORMAT_KOLOM: Record<JenisKolom, string> = {
  string: 'Teks',
  date: 'Tanggal: YYYY-MM-DD (atau DD-MM-YYYY / tanggal Excel)',
  int: 'Angka bulat (boleh 1.250.000 / Rp 1.250.000)',
  bool: 'YA / TIDAK',
};
const FORMAT_KHUSUS: Record<string, string> = {
  channel: 'GT / MT',
  tipe_bayar: 'TUNAI / KREDIT',
  divisi: 'Teks (principal / divisi, mis. DNE, CBN, MRS)',
  moq: 'Angka bulat ≥ 1',
  rpp13: 'Angka bulat (boleh negatif)',
};

/** Baris data (objek) → baris sheet sesuai urutan kolom skema; boolean → YA/TIDAK. */
function keBarisSheet(tipe: TipeData, rows: readonly unknown[]): Record<string, unknown>[] {
  const kolom = SKEMA[tipe].kolom.map((k) => k.nama);
  return rows.map((r) => {
    const o = r as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of kolom) {
      const v = o[k];
      out[k] = typeof v === 'boolean' ? (v ? 'YA' : 'TIDAK') : (v ?? '');
    }
    return out;
  });
}

/**
 * Workbook template/ekspor: sheet data (nama sheet = SKEMA[tipe].sheet, header persis) + sheet "Petunjuk".
 * Selalu bisa di-upload balik tanpa error.
 */
export function buatWorkbook(tipe: TipeData, rows: readonly unknown[]): XLSX.WorkBook {
  const skema = SKEMA[tipe];
  const wb = XLSX.utils.book_new();
  const data = XLSX.utils.json_to_sheet(keBarisSheet(tipe, rows), { header: skema.kolom.map((k) => k.nama) });
  data['!cols'] = skema.kolom.map((k) => ({ wch: Math.max(12, k.nama.length + 2) }));
  XLSX.utils.book_append_sheet(wb, data, skema.sheet);
  const petunjuk = XLSX.utils.aoa_to_sheet([
    ['Kolom', 'Wajib', 'Format', 'Nama header lain yang juga dikenali'],
    ...skema.kolom.map((k) => [k.nama, k.wajib ? 'WAJIB' : 'opsional', FORMAT_KHUSUS[k.nama] ?? FORMAT_KOLOM[k.jenis], (k.alias ?? []).join(', ')]),
    [],
    ['Catatan'],
    [`Isi data mulai baris 2 di sheet "${skema.sheet}". Jangan ubah nama kolom di baris 1.`],
    ['Baris judul/parameter laporan di atas header boleh ada; header dicari otomatis.'],
    ['Kolom wajib yang tidak ada di file bisa dipetakan atau diisi nilai tetap saat upload.'],
  ]);
  petunjuk['!cols'] = [{ wch: 22 }, { wch: 10 }, { wch: 48 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, petunjuk, 'Petunjuk');
  return wb;
}

/**
 * Validasi satu baris (form edit Master) dengan aturan yang sama persis dengan upload Excel.
 * `obj` berisi nilai mentah per nama kolom (string kosong = kosong).
 */
export function validasiBaris<T = Record<string, unknown>>(tipe: TipeData, obj: Record<string, unknown>): { baris: T | null; alasan: string[] } {
  const kolom = SKEMA[tipe].kolom.map((k) => k.nama);
  const h = parseRows<T>(tipe, kolom, [{ values: kolom.map((k) => obj[k] ?? null), excelRow: 1 }]);
  if (h.valid.length) return { baris: h.valid[0], alasan: [] };
  return { baris: null, alasan: h.error.flatMap((e) => e.alasan.split('; ')) };
}

/** Pilih sheet: nama cocok (case-insensitive), atau sheet terlihat yang header-nya paling cocok dengan jenis data ini. */
export function pilihSheet(wb: XLSX.WorkBook, tipe: TipeData): XLSX.WorkSheet | null {
  const target = SKEMA[tipe].sheet.toLowerCase();
  const byName = wb.SheetNames.find((n) => n.toLowerCase() === target);
  if (byName) return wb.Sheets[byName];
  const hidden = new Set((wb.Workbook?.Sheets ?? []).filter((s) => s.Hidden).map((s) => s.name));
  const terlihat = wb.SheetNames.filter((n) => !hidden.has(n) && wb.Sheets[n]?.['!ref']);
  let terbaik: string | undefined;
  let skor = -1;
  for (const n of terlihat) {
    const { aoa } = keAoa(wb.Sheets[n], 30);
    const sk = Math.max(0, ...aoa.map((r) => cocokkan(tipe, r ?? []).size));
    if (sk > skor) {
      skor = sk;
      terbaik = n;
    }
  }
  return terbaik ? wb.Sheets[terbaik] : null;
}

/** Baca workbook dari ArrayBuffer / Uint8Array (XLSX atau CSV). */
export function bacaWorkbook(data: ArrayBuffer | Uint8Array): XLSX.WorkBook {
  // raw: true → untuk CSV, nilai dibiarkan string (hindari SheetJS menebak "09/11/2026" sebagai format US).
  return XLSX.read(data, { type: 'array', cellDates: false, raw: true });
}

const KOSONG: HasilParse<never> = { kolomHilang: [], valid: [], error: [], totalBaris: 0 };

/**
 * Baca seluruh dataset dari satu workbook seperti Dummy_ROVI_PJP.xlsx.
 * Master_Toko, ROVI, PJP wajib; Produk, Order_Rules, Histori_Sales opsional.
 */
export function bacaDataSet(wb: XLSX.WorkBook) {
  const get = (t: TipeData) => {
    const name = wb.SheetNames.find((s) => s.toLowerCase() === SKEMA[t].sheet.toLowerCase());
    return name ? wb.Sheets[name] : undefined;
  };
  for (const t of ['master', 'rovi', 'pjp'] as const)
    if (!get(t)) throw new Error(`Sheet ${SKEMA[t].sheet} tidak ditemukan`);
  const opt = <T,>(t: TipeData, f: (ws: XLSX.WorkSheet) => HasilParse<T>): HasilParse<T> => {
    const ws = get(t);
    return ws ? f(ws) : KOSONG;
  };
  return {
    master: parseSheet('master', get('master')!),
    rovi: parseSheet('rovi', get('rovi')!),
    pjp: parseSheet('pjp', get('pjp')!),
    produk: opt('produk', (ws) => parseSheet('produk', ws)),
    rules: opt('rules', (ws) => parseSheet('rules', ws)),
    histori: opt('histori', (ws) => parseSheet('histori', ws)),
    msl: opt('msl', (ws) => parseSheet('msl', ws)),
    price: opt('price', (ws) => parseSheet('price', ws)),
  };
}
