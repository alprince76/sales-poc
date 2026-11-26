/**
 * Upload PO dari Excel (aplikasi sales):
 * - GT: satu file berisi PO semua toko hari itu → dikelompokkan per toko → 1 PO per toko.
 * - MT: satu file untuk toko yang sedang dibuka → mengisi keranjang PO toko itu.
 * Harga selalu mengikuti harga SKU di aplikasi (sama dengan input manual).
 */
import * as XLSX from 'xlsx';
import { normKode } from './billing';
import { normalizeDate, type ISODate } from './dates';
import { cekKredit, validasiPO, type ProdukLengkap } from './order';
import { normHeader, parseInt0 } from './parse';
import type { ItemPO, MasterToko } from './types';

export type ChannelPo = 'GT' | 'MT';

const ALIAS: Record<'kode_toko' | 'kode_sku' | 'qty' | 'satuan' | 'tanggal', string[]> = {
  kode_toko: ['kode_toko', 'kode_outlet', 'outlet', 'no_outlet', 'kd_outlet', 'cust_code', 'cust_code1', 'customer', 'kode_customer', 'toko'],
  kode_sku: ['kode_sku', 'sku', 'kode_material', 'material', 'kode_barang', 'item_code', 'kode_produk', 'kode_item'],
  qty: ['qty', 'quantity', 'jumlah', 'qty_order', 'order', 'qty_pcs', 'pcs'],
  satuan: ['satuan', 'uom', 'unit'],
  tanggal: ['tanggal', 'tgl', 'tanggal_po', 'tgl_po', 'tanggal_order', 'order_date', 'date'],
};

export interface ErrorPo {
  baris: number;
  alasan: string;
}
export interface GrupPo {
  kode_toko: string;
  nama_toko: string;
  tanggal: ISODate;
  items: ItemPO[];
  total: number;
  /** Tidak bisa disubmit (mis. melebihi limit kredit). */
  ditolak: string | null;
  peringatan: string[];
}
export interface HasilPo {
  kolomHilang: string[];
  grup: GrupPo[];
  error: ErrorPo[];
  totalBaris: number;
  /** Baris judul/total/kosong yang dilewati. */
  dilewati: number;
}

export interface KonteksPo {
  channel: ChannelPo;
  kodeSalesman: string;
  /** Tanggal default (tanggal yang sedang dipilih di aplikasi). */
  D: ISODate;
  produk: readonly ProdukLengkap[];
  master: readonly MasterToko[];
  /** Kode toko yang boleh (coverage salesman: Master + PJP). */
  tokoBoleh: ReadonlySet<string>;
  /** Sisa tagihan per toko (untuk cek limit kredit GT). */
  outstanding?: (kodeToko: string) => number;
  /** Toko yang sudah punya PO di tanggal itu (peringatan saja). */
  sudahPo?: (kodeToko: string, tanggal: ISODate) => boolean;
  /** MT: semua baris untuk toko ini (kolom kode_toko diabaikan). */
  tokoTetap?: string;
}

/** Cari baris header (30 baris pertama) yang paling banyak cocok dengan alias. */
function petaHeader(aoa: unknown[][]): { i: number; pos: Partial<Record<keyof typeof ALIAS, number>> } {
  let terbaik = { i: 0, pos: {} as Partial<Record<keyof typeof ALIAS, number>>, skor: -1 };
  for (let i = 0; i < Math.min(aoa.length, 30); i++) {
    const pos: Partial<Record<keyof typeof ALIAS, number>> = {};
    (aoa[i] ?? []).forEach((h, j) => {
      const n = normHeader(h);
      for (const [k, al] of Object.entries(ALIAS) as [keyof typeof ALIAS, string[]][]) if (pos[k] === undefined && al.includes(n)) pos[k] = j;
    });
    const skor = Object.keys(pos).length;
    if (skor > terbaik.skor) terbaik = { i, pos, skor };
  }
  return terbaik;
}

const kosong = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

export function bacaFilePo(ws: XLSX.WorkSheet, ctx: KonteksPo): HasilPo {
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: true });
  const awal = XLSX.utils.decode_range(ws['!ref'] ?? 'A1').s.r + 1;
  const { i: iHeader, pos } = petaHeader(aoa);
  const wajib: (keyof typeof ALIAS)[] = ctx.tokoTetap ? ['kode_sku', 'qty'] : ['kode_toko', 'kode_sku', 'qty'];
  const kolomHilang = wajib.filter((k) => pos[k] === undefined);
  if (kolomHilang.length) return { kolomHilang, grup: [], error: [], totalBaris: 0, dilewati: 0 };

  const byKode = new Map(ctx.produk.map((p) => [normKode(p.kode_sku), p]));
  const masterIdx = new Map(ctx.master.map((m) => [normKode(m.kode_toko), m]));
  const error: ErrorPo[] = [];
  // toko|tanggal → (sku → qty)
  const kel = new Map<string, { kode_toko: string; tanggal: ISODate; qty: Map<string, number> }>();
  let totalBaris = 0;
  let dilewati = 0;

  for (let r = iHeader + 1; r < aoa.length; r++) {
    const v = aoa[r] ?? [];
    const baris = awal + r;
    const sel = (k: keyof typeof ALIAS) => (pos[k] === undefined ? null : v[pos[k]!]);
    if (v.every(kosong)) continue;
    // Baris TOTAL / subtotal: tanpa SKU (dan tanpa toko untuk GT) → dilewati.
    if (kosong(sel('kode_sku')) && (ctx.tokoTetap || kosong(sel('kode_toko')))) {
      dilewati++;
      continue;
    }
    totalBaris++;
    const alasan: string[] = [];
    const kodeToko = normKode(ctx.tokoTetap ?? String(sel('kode_toko') ?? ''));
    const kodeSku = normKode(String(sel('kode_sku') ?? ''));
    const p = byKode.get(kodeSku);
    if (!ctx.tokoTetap) {
      if (!kodeToko) alasan.push('Kode toko kosong');
      else if (!ctx.tokoBoleh.has(kodeToko)) alasan.push(`Toko ${kodeToko} bukan toko Anda (tidak ada di coverage salesman)`);
    }
    if (!kodeSku) alasan.push('Kode SKU kosong');
    else if (!p) alasan.push(`SKU ${kodeSku} tidak ada di Master SKU`);
    else if (p.status_aktif === false) alasan.push(`SKU ${kodeSku} tidak aktif`);
    let qty = parseInt0(sel('qty'));
    if (qty === null) alasan.push(`Qty harus angka, bukan "${String(sel('qty') ?? '')}"`);
    else if (qty <= 0) alasan.push('Qty harus lebih dari 0');
    const satuan = String(sel('satuan') ?? '').trim().toUpperCase();
    if (qty !== null && p && ['CAR', 'CTN', 'KARTON', 'DUS', 'BOX'].includes(satuan)) {
      if (p.isi_karton > 1) qty *= p.isi_karton;
      else alasan.push(`Isi per karton SKU ${kodeSku} belum diketahui; tulis qty dalam ${p.satuan}`);
    }
    let tanggal = ctx.D;
    if (!kosong(sel('tanggal'))) {
      const t = normalizeDate(sel('tanggal'));
      if (t) tanggal = t;
      else alasan.push(`Tanggal tidak terbaca ("${String(sel('tanggal'))}")`);
    }
    if (alasan.length) {
      error.push({ baris, alasan: alasan.join('; ') });
      continue;
    }
    const k = `${kodeToko}|${tanggal}`;
    if (!kel.has(k)) kel.set(k, { kode_toko: kodeToko, tanggal, qty: new Map() });
    const g = kel.get(k)!.qty;
    g.set(kodeSku, (g.get(kodeSku) ?? 0) + qty!);
  }

  const grup: GrupPo[] = [...kel.values()].map((g) => {
    const outlet = masterIdx.get(g.kode_toko);
    const keranjang = Object.fromEntries(g.qty);
    const v = validasiPO(keranjang, ctx.produk, outlet, ctx.outstanding?.(g.kode_toko) ?? 0, { channel: ctx.channel });
    const kredit = ctx.channel === 'GT' ? cekKredit(outlet, ctx.outstanding?.(g.kode_toko) ?? 0, v.total) : null;
    const peringatan: string[] = [];
    if (kredit?.peringatan) peringatan.push(kredit.peringatan);
    if (ctx.sudahPo?.(g.kode_toko, g.tanggal)) peringatan.push('Toko ini sudah punya PO di tanggal yang sama');
    const nMoq = Object.keys(v.catatanItem).length;
    if (nMoq) peringatan.push(`${nMoq} SKU di bawah min. order (catatan)`);
    return {
      kode_toko: g.kode_toko,
      nama_toko: outlet?.nama_toko ?? g.kode_toko,
      tanggal: g.tanggal,
      items: v.items,
      total: v.total,
      ditolak: kredit && !kredit.boleh ? kredit.alasan : null,
      peringatan,
    };
  });
  grup.sort((a, b) => a.nama_toko.localeCompare(b.nama_toko));
  return { kolomHilang: [], grup, error, totalBaris, dilewati };
}

/** Toko coverage salesman: Master (kode_salesman sama) + PJP salesman. */
export function tokoSalesman(master: readonly MasterToko[], pjp: readonly { kode_salesman: string; kode_toko: string }[], kodeSalesman: string): Set<string> {
  const s = normKode(kodeSalesman);
  const out = new Set<string>();
  for (const m of master) if (normKode(m.kode_salesman) === s) out.add(normKode(m.kode_toko));
  for (const p of pjp) if (normKode(p.kode_salesman) === s) out.add(normKode(p.kode_toko));
  return out;
}

/** Template upload PO + sheet Petunjuk. */
export function templatePo(channel: ChannelPo, contoh: { kode_toko?: string; kode_sku: string; qty: number }[], D: ISODate): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const header = channel === 'GT' ? ['tanggal', 'kode_toko', 'kode_sku', 'qty', 'satuan'] : ['kode_sku', 'qty', 'satuan'];
  const rows = contoh.map((c) => (channel === 'GT' ? [D, c.kode_toko ?? '', c.kode_sku, c.qty, 'PCS'] : [c.kode_sku, c.qty, 'PCS']));
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws['!cols'] = header.map(() => ({ wch: 14 }));
  XLSX.utils.book_append_sheet(wb, ws, 'PO');
  const petunjuk = XLSX.utils.aoa_to_sheet([
    ['Kolom', 'Wajib', 'Keterangan'],
    ...(channel === 'GT'
      ? [
          ['tanggal', 'opsional', 'Tanggal PO (DD-MM-YYYY / YYYY-MM-DD). Kosong = tanggal yang dipilih di aplikasi.'],
          ['kode_toko', 'WAJIB', 'Kode toko. Satu file boleh berisi banyak toko; 1 PO dibuat per toko.'],
        ]
      : []),
    ['kode_sku', 'WAJIB', 'Kode SKU di Master SKU.'],
    ['qty', 'WAJIB', 'Jumlah pesanan (angka > 0).'],
    ['satuan', 'opsional', 'PCS (default) atau CAR (dikali isi karton).'],
    [],
    ['Harga mengikuti harga SKU di aplikasi. Baris dengan toko + SKU yang sama dijumlahkan.'],
    channel === 'GT' ? ['Toko di luar coverage Anda dan toko yang melebihi limit kredit tidak ikut dibuat.'] : ['Semua baris masuk ke keranjang PO toko yang sedang dibuka.'],
  ]);
  petunjuk['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, petunjuk, 'Petunjuk');
  return wb;
}
