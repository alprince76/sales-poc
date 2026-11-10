/**
 * Parsing + validasi baris Excel/CSV untuk Master, ROVI, PJP, Produk, Order Rules, Histori Sales.
 * Header case-insensitive (spasi → underscore). Nomor baris = nomor baris Excel (header = baris 1).
 */
import * as XLSX from 'xlsx';
import { normalizeDate } from './dates';
import { normKode } from './billing';
import type { DataSet, Faktur, HistoriSales, Kunjungan, MasterToko, OrderRule, Produk } from './types';

export type TipeData = keyof DataSet;
export const SEMUA_TIPE: TipeData[] = ['master', 'rovi', 'pjp', 'produk', 'rules', 'histori'];

type JenisKolom = 'string' | 'date' | 'int' | 'bool';
interface Kolom {
  nama: string;
  jenis: JenisKolom;
  wajib: boolean;
}

export const SKEMA: Record<TipeData, { sheet: string; kolom: Kolom[] }> = {
  master: {
    sheet: 'Master_Toko',
    kolom: [
      { nama: 'kode_salesman', jenis: 'string', wajib: true },
      { nama: 'nama_salesman', jenis: 'string', wajib: true },
      { nama: 'salesman_bw', jenis: 'string', wajib: false },
      { nama: 'kode_toko', jenis: 'string', wajib: true },
      { nama: 'nama_toko', jenis: 'string', wajib: true },
      { nama: 'area', jenis: 'string', wajib: false },
      { nama: 'alamat', jenis: 'string', wajib: false },
      { nama: 'tipe_outlet', jenis: 'string', wajib: false },
      { nama: 'limit_kredit', jenis: 'int', wajib: false },
      { nama: 'status_blokir', jenis: 'bool', wajib: false },
    ],
  },
  rovi: {
    sheet: 'ROVI',
    kolom: [
      { nama: 'kode_toko', jenis: 'string', wajib: true },
      { nama: 'nama_toko', jenis: 'string', wajib: true },
      { nama: 'no_faktur', jenis: 'string', wajib: true },
      { nama: 'tanggal_faktur', jenis: 'date', wajib: true },
      { nama: 'tanggal_jatuh_tempo', jenis: 'date', wajib: true },
      { nama: 'nilai_faktur', jenis: 'int', wajib: true },
      { nama: 'sisa_tagihan', jenis: 'int', wajib: true },
    ],
  },
  pjp: {
    sheet: 'PJP',
    kolom: [
      { nama: 'kode_salesman', jenis: 'string', wajib: true },
      { nama: 'nama_salesman', jenis: 'string', wajib: true },
      { nama: 'tanggal_kunjungan', jenis: 'date', wajib: true },
      { nama: 'hari', jenis: 'string', wajib: false },
      { nama: 'kode_toko', jenis: 'string', wajib: true },
      { nama: 'nama_toko', jenis: 'string', wajib: false },
      { nama: 'urutan', jenis: 'int', wajib: false },
    ],
  },
  produk: {
    sheet: 'Produk',
    kolom: [
      { nama: 'kode_sku', jenis: 'string', wajib: true },
      { nama: 'nama_sku', jenis: 'string', wajib: true },
      { nama: 'divisi', jenis: 'string', wajib: true },
      { nama: 'kategori', jenis: 'string', wajib: false },
      { nama: 'harga', jenis: 'int', wajib: true },
      { nama: 'channel', jenis: 'string', wajib: false },
    ],
  },
  rules: {
    sheet: 'Order_Rules',
    kolom: [
      { nama: 'kode_sku', jenis: 'string', wajib: true },
      { nama: 'satuan', jenis: 'string', wajib: true },
      { nama: 'moq', jenis: 'int', wajib: true },
      { nama: 'kelipatan', jenis: 'int', wajib: false },
    ],
  },
  histori: {
    sheet: 'Histori_Sales',
    kolom: [
      { nama: 'kode_toko', jenis: 'string', wajib: true },
      { nama: 'kode_sku', jenis: 'string', wajib: true },
      { nama: 'tanggal_po', jenis: 'date', wajib: true },
      { nama: 'qty', jenis: 'int', wajib: true },
    ],
  },
};

/** "YA"/"TIDAK", "Y"/"N", "true"/"false", 1/0. */
export function parseBool(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1 ? true : v === 0 ? false : null;
  const s = String(v).trim().toUpperCase();
  if (['YA', 'Y', 'YES', 'TRUE', '1', 'BLOKIR'].includes(s)) return true;
  if (['TIDAK', 'T', 'N', 'NO', 'FALSE', '0', '-'].includes(s)) return false;
  return null;
}

export interface ErrorBaris {
  baris: number;
  alasan: string;
}

export interface HasilParse<T> {
  /** Kosong bila valid; bila ada kolom wajib hilang, file ditolak. */
  kolomHilang: string[];
  valid: T[];
  error: ErrorBaris[];
  totalBaris: number;
}

type Rows = { values: unknown[]; excelRow: number }[];

export function normHeader(h: unknown): string {
  return String(h ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function isKosong(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

/** Angka rupiah: number, atau string "1.250.000" / "1250000" / "Rp 1.250.000". */
export function parseInt0(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && Number.isInteger(v) ? v : null;
  if (typeof v === 'string') {
    const s = v.trim().replace(/^rp\.?\s*/i, '').replace(/[.,\s](?=\d{3}(\D|$))/g, '');
    if (/^-?\d+$/.test(s)) return Number(s);
  }
  return null;
}

/** Ubah sheet SheetJS jadi array baris mentah + nomor baris Excel. */
export function sheetToRows(ws: XLSX.WorkSheet): { header: unknown[]; rows: Rows } {
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: true });
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
  const startRow = range.s.r + 1; // 1-based
  const header = aoa[0] ?? [];
  const rows: Rows = [];
  for (let i = 1; i < aoa.length; i++) {
    const values = aoa[i] ?? [];
    if (values.every(isKosong)) continue;
    rows.push({ values, excelRow: startRow + i });
  }
  return { header, rows };
}

function parseRows<T>(tipe: TipeData, header: unknown[], rows: Rows): HasilParse<T> {
  const skema = SKEMA[tipe];
  const pos = new Map<string, number>();
  header.forEach((h, i) => {
    const n = normHeader(h);
    if (n && !pos.has(n)) pos.set(n, i);
  });
  const kolomHilang = skema.kolom.filter((k) => k.wajib && !pos.has(k.nama)).map((k) => k.nama);
  if (kolomHilang.length) return { kolomHilang, valid: [], error: [], totalBaris: rows.length };

  const valid: T[] = [];
  const error: ErrorBaris[] = [];
  const seenFaktur = new Set<string>();

  for (const { values, excelRow } of rows) {
    const obj: Record<string, unknown> = {};
    const alasan: string[] = [];
    for (const k of skema.kolom) {
      const i = pos.get(k.nama);
      const raw = i === undefined ? null : values[i];
      if (isKosong(raw)) {
        if (k.wajib) alasan.push(`${k.nama} kosong`);
        continue;
      }
      if (k.jenis === 'string') {
        obj[k.nama] = String(raw).trim();
      } else if (k.jenis === 'date') {
        const d = normalizeDate(raw);
        if (d) obj[k.nama] = d;
        else alasan.push(`${k.nama} bukan tanggal valid ("${String(raw)}")`);
      } else if (k.jenis === 'bool') {
        const b = parseBool(raw);
        if (b === null) alasan.push(`${k.nama} harus YA/TIDAK ("${String(raw)}")`);
        else obj[k.nama] = b;
      } else {
        const n = parseInt0(raw);
        if (n === null) alasan.push(`${k.nama} bukan angka bulat ("${String(raw)}")`);
        else if (n < 0) alasan.push(`${k.nama} tidak boleh negatif`);
        else obj[k.nama] = n;
      }
    }
    if ('kode_toko' in obj) obj.kode_toko = normKode(obj.kode_toko as string);
    if ('kode_salesman' in obj) obj.kode_salesman = normKode(obj.kode_salesman as string);
    if ('kode_sku' in obj) obj.kode_sku = normKode(obj.kode_sku as string);
    if (tipe === 'rules' && !alasan.length && (obj.moq as number) < 1) alasan.push('moq minimal 1');
    if (tipe === 'rules' && !alasan.length && obj.kelipatan !== undefined && (obj.kelipatan as number) < 1)
      alasan.push('kelipatan minimal 1');
    if ((tipe === 'produk' || tipe === 'rules') && !alasan.length) {
      const sku = obj.kode_sku as string;
      if (seenFaktur.has(sku)) alasan.push(`kode_sku duplikat (${sku})`);
      seenFaktur.add(sku);
    }

    if (tipe === 'rovi' && !alasan.length) {
      const no = String(obj.no_faktur).trim().toUpperCase();
      if (seenFaktur.has(no)) alasan.push(`no_faktur duplikat (${obj.no_faktur})`);
      seenFaktur.add(no);
    }

    if (alasan.length) error.push({ baris: excelRow, alasan: alasan.join('; ') });
    else valid.push(obj as T);
  }
  return { kolomHilang: [], valid, error, totalBaris: rows.length };
}

export function parseSheet(tipe: 'master', ws: XLSX.WorkSheet): HasilParse<MasterToko>;
export function parseSheet(tipe: 'rovi', ws: XLSX.WorkSheet): HasilParse<Faktur>;
export function parseSheet(tipe: 'pjp', ws: XLSX.WorkSheet): HasilParse<Kunjungan>;
export function parseSheet(tipe: 'produk', ws: XLSX.WorkSheet): HasilParse<Produk>;
export function parseSheet(tipe: 'rules', ws: XLSX.WorkSheet): HasilParse<OrderRule>;
export function parseSheet(tipe: 'histori', ws: XLSX.WorkSheet): HasilParse<HistoriSales>;
export function parseSheet(tipe: TipeData, ws: XLSX.WorkSheet): HasilParse<unknown>;
export function parseSheet(tipe: TipeData, ws: XLSX.WorkSheet): HasilParse<unknown> {
  const { header, rows } = sheetToRows(ws);
  return parseRows(tipe, header, rows);
}

/** Pilih sheet sesuai tipe (nama sheet cocok, case-insensitive) atau sheet pertama yang terlihat. */
export function pilihSheet(wb: XLSX.WorkBook, tipe: TipeData): XLSX.WorkSheet | null {
  const target = SKEMA[tipe].sheet.toLowerCase();
  const byName = wb.SheetNames.find((n) => n.toLowerCase() === target);
  if (byName) return wb.Sheets[byName];
  const hidden = new Set(
    (wb.Workbook?.Sheets ?? []).filter((s) => s.Hidden).map((s) => s.name),
  );
  const first = wb.SheetNames.find((n) => !hidden.has(n));
  return first ? wb.Sheets[first] : null;
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
  };
}
