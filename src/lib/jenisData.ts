/** Jenis data master yang dikelola admin (kartu Data & Upload + submenu Master Data). Pure. */
import { normKode } from './billing';
import type { TipeData } from './parse';
import type { DataSet } from './types';
import type { ChannelUpload } from './upload';

export interface JenisData {
  /** Slug URL: /admin/master/:id */
  id: string;
  tipe: TipeData;
  /** Untuk Store/PJP: hanya segmen channel ini (GT/MT). */
  channel?: ChannelUpload;
  nama: string;
  /** Nama pendek untuk submenu. */
  menu: string;
  desc: string;
}

export const JENIS_DATA: JenisData[] = [
  { id: 'store-gt', tipe: 'master', channel: 'GT', nama: 'Data Store GT', menu: 'Store GT', desc: 'Toko GT: salesman, bill address 1–4, TUNAI/KREDIT, TOP, limit, RPP13, blokir. Toko MT tidak tersentuh.' },
  { id: 'store-mt', tipe: 'master', channel: 'MT', nama: 'Data Store MT', menu: 'Store MT', desc: 'Outlet MT: salesman, alamat, cust group. Toko GT tidak tersentuh.' },
  { id: 'pjp-gt', tipe: 'pjp', channel: 'GT', nama: 'Data PJP Sales GT', menu: 'PJP Sales GT', desc: 'Jadwal kunjungan ke toko GT per tanggal. PJP MT tidak tersentuh.' },
  { id: 'pjp-mt', tipe: 'pjp', channel: 'MT', nama: 'Data PJP Sales MT', menu: 'PJP Sales MT', desc: 'Jadwal kunjungan ke outlet MT per tanggal. PJP GT tidak tersentuh.' },
  { id: 'tagihan', tipe: 'rovi', nama: 'Data Tagihan (DI AWAL / ROVI)', menu: 'Tagihan (ROVI)', desc: 'AR awal: faktur, divisi (DNE/CBN/MRS), sisa tagihan per toko' },
  { id: 'sku', tipe: 'produk', nama: 'Data SKU', menu: 'SKU', desc: 'Kode SKU, nama (new material), principal, sub brand, harga dasar, status aktif' },
  { id: 'moq-gt', tipe: 'rules', nama: 'Data MOQ GT', menu: 'MOQ GT', desc: 'Satuan, MOQ per item (flag), isi per karton (CAR) — khusus GT' },
  { id: 'sku-listed-mt', tipe: 'msl', nama: 'Data SKU Listed per Store MT', menu: 'SKU Listed MT', desc: 'SKU yang wajib ada di outlet MT (status_listed YES/NO)' },
  { id: 'histori-gt', tipe: 'histori', nama: 'Data Historical Order Outlet GT', menu: 'Historical Order GT', desc: 'Pembelian toko per SKU (suggested order, last order, MSL)' },
  { id: 'price', tipe: 'price', nama: 'Price List', menu: 'Price List', desc: 'Harga per SKU per channel (GT/MT; kosong = semua). Menggantikan harga Master SKU' },
];

export const jenisById = (id: string | undefined) => JENIS_DATA.find((j) => j.id === id);

const chMaster = (m: { channel?: string }): ChannelUpload => (String(m.channel ?? '').trim().toUpperCase() === 'MT' ? 'MT' : 'GT');

/** Indeks baris raw[tipe] yang termasuk jenis ini (segmen GT/MT untuk Store & PJP). */
export function indeksJenis(data: DataSet, j: JenisData): number[] {
  const rows = data[j.tipe] as unknown[];
  if (!j.channel) return rows.map((_, i) => i);
  if (j.tipe === 'master') return data.master.flatMap((m, i) => (chMaster(m) === j.channel ? [i] : []));
  const ch = new Map(data.master.map((m) => [normKode(m.kode_toko), chMaster(m)]));
  return data.pjp.flatMap((k, i) => ((ch.get(normKode(k.kode_toko)) ?? 'GT') === j.channel ? [i] : []));
}

/** Kunci unik baris (null = tidak dicek duplikat). */
export function kunciBaris(tipe: TipeData, r: Record<string, unknown>): string | null {
  const k = (v: unknown) => normKode(String(v ?? ''));
  switch (tipe) {
    case 'master':
      return k(r.kode_toko);
    case 'rovi':
      return String(r.no_faktur ?? '').trim().toUpperCase();
    case 'produk':
    case 'rules':
      return k(r.kode_sku);
    case 'price':
      return `${k(r.kode_sku)}|${String(r.channel ?? '').toUpperCase()}`;
    case 'msl':
      return `${k(r.kode_toko)}|${k(r.kode_sku)}`;
    case 'pjp':
      return `${k(r.kode_salesman)}|${String(r.tanggal_kunjungan)}|${k(r.kode_toko)}`;
    default:
      return null;
  }
}

/** Pesan bila `baris` bentrok dengan baris lain (kecuali indeks `kecuali`). */
export function cekDuplikat(tipe: TipeData, rows: Record<string, unknown>[], baris: Record<string, unknown>, kecuali: number | null): string | null {
  const key = kunciBaris(tipe, baris);
  if (key === null) return null;
  const i = rows.findIndex((r, idx) => idx !== kecuali && kunciBaris(tipe, r) === key);
  if (i < 0) return null;
  const label: Partial<Record<TipeData, string>> = {
    master: 'Kode toko',
    rovi: 'No faktur',
    produk: 'Kode SKU',
    rules: 'Kode SKU',
    price: 'Kombinasi SKU + channel',
    msl: 'Kombinasi toko + SKU',
    pjp: 'Kunjungan salesman + tanggal + toko',
  };
  return `${label[tipe] ?? 'Data'} sudah ada (baris ${i + 1}).`;
}

/** Terapkan edit (indeks), tambah (null) atau hapus (baris null) pada salinan rows. */
export function terapkan<T>(rows: T[], indeks: number | null, baris: T | null): T[] {
  const out = [...rows];
  if (indeks === null) {
    if (baris) out.push(baris);
  } else if (baris) out[indeks] = baris;
  else out.splice(indeks, 1);
  return out;
}
