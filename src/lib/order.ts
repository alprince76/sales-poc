/**
 * Menu Purchase Order: histori, suggested order, validasi MOQ, satuan karton, price list, limit kredit & blokir.
 */
import { addDays, diffDays, type ISODate } from './dates';
import { normKode } from './billing';
import { formatRupiah } from './format';
import type { HistoriSales, ItemPO, MasterToko, OrderRule, PriceList, Produk } from './types';

export interface ProdukLengkap extends Produk {
  satuan: string;
  moq: number;
  /** Isi per karton (CAR) dalam satuan dasar; 1 = tidak ada konversi karton. */
  isi_karton: number;
}

export type ChannelHarga = 'GT' | 'MT';

/**
 * Gabung Master SKU + Order Rules + Price List.
 * - SKU tanpa rule → MOQ 1, satuan "Pcs", isi karton 1.
 * - Nama = kolom new_material bila ada.
 * - Harga = Price List untuk channel tsb → Price List tanpa channel → harga Master SKU.
 */
export function gabungProduk(
  produk: readonly Produk[],
  rules: readonly OrderRule[],
  price: readonly PriceList[] = [],
  channel: ChannelHarga = 'GT',
): ProdukLengkap[] {
  const r = new Map(rules.map((x) => [normKode(x.kode_sku), x]));
  const hargaCh = new Map<string, number>();
  const hargaUmum = new Map<string, number>();
  for (const x of price) {
    const k = normKode(x.kode_sku);
    if (!x.channel) hargaUmum.set(k, x.harga);
    else if (x.channel === channel) hargaCh.set(k, x.harga);
  }
  return produk.map((p) => {
    const kode = normKode(p.kode_sku);
    const rule = r.get(kode);
    return {
      ...p,
      kode_sku: kode,
      nama_sku: p.new_material?.trim() || p.nama_sku,
      harga: hargaCh.get(kode) ?? hargaUmum.get(kode) ?? p.harga,
      satuan: rule?.satuan ?? 'Pcs',
      moq: Math.max(1, rule?.moq ?? 1),
      isi_karton: Math.max(1, rule?.isi_karton ?? 1),
    };
  });
}

export interface OpsiQty {
  /** MT tidak memakai ketentuan MOQ (file order rules hanya untuk GT). */
  channel?: ChannelHarga;
}

/** Pesan error item; null = valid. qty 0 = tidak dipesan (valid). MOQ TIDAK memblokir (lihat catatanMoq). */
export function validasiQty(qty: number, _p?: unknown, _opsi: OpsiQty = {}): string | null {
  if (!Number.isInteger(qty) || qty < 0) return 'Qty harus bilangan bulat ≥ 0.';
  return null;
}

/**
 * GT: MOQ hanya informasi/flag — qty diinput manual per satuan dan tetap boleh disubmit.
 * Mengembalikan catatan bila qty > 0 di bawah MOQ; null bila tidak perlu catatan (atau MT).
 */
export function catatanMoq(qty: number, p: Pick<ProdukLengkap, 'moq' | 'satuan'>, opsi: OpsiQty = {}): string | null {
  if (opsi.channel === 'MT' || qty <= 0 || qty >= p.moq) return null;
  return `Di bawah min. order ${p.moq} ${p.satuan}/item (catatan)`;
}

/** "2 CAR (48 Pcs)" bila qty pas kelipatan karton; selain itu "12 Pcs". */
export function formatQty(qty: number, p: Pick<ProdukLengkap, 'satuan' | 'isi_karton'>): string {
  if (p.isi_karton > 1 && qty >= p.isi_karton && qty % p.isi_karton === 0) return `${qty / p.isi_karton} CAR (${qty} ${p.satuan})`;
  return `${qty} ${p.satuan}`;
}

/** Versi pendek untuk tombol: "2 CAR" / "12 Pcs". */
export function formatQtySingkat(qty: number, p: Pick<ProdukLengkap, 'satuan' | 'isi_karton'>): string {
  if (p.isi_karton > 1 && qty >= p.isi_karton && qty % p.isi_karton === 0) return `${qty / p.isi_karton} CAR`;
  return `${qty} ${p.satuan}`;
}

/** Label MOQ untuk GT: "Min. 12 Pcs/item". */
export const labelMoq = (p: Pick<ProdukLengkap, 'moq' | 'satuan'>) => `Min. ${p.moq} ${p.satuan}/item`;

export interface HistoriSku {
  kode_sku: string;
  totalQty: number;
  jumlahOrder: number;
  terakhir: ISODate;
  /** Qty pada order terakhir. */
  qtyTerakhir: number;
  /** Qty per bulan, 6 bulan terakhir (index 0 = paling lama). */
  perBulan: number[];
}

/** Ringkasan histori pembelian toko dalam 6 bulan (180 hari) sebelum D. */
export function historiToko(histori: readonly HistoriSales[], kodeToko: string, D: ISODate): HistoriSku[] {
  const kode = normKode(kodeToko);
  const mulai = addDays(D, -180);
  const map = new Map<string, HistoriSku>();
  for (const h of histori) {
    if (normKode(h.kode_toko) !== kode) continue;
    if (h.tanggal_po >= D || h.tanggal_po < mulai) continue;
    const sku = normKode(h.kode_sku);
    let s = map.get(sku);
    if (!s) map.set(sku, (s = { kode_sku: sku, totalQty: 0, jumlahOrder: 0, terakhir: h.tanggal_po, qtyTerakhir: h.qty, perBulan: [0, 0, 0, 0, 0, 0] }));
    s.totalQty += h.qty;
    s.jumlahOrder++;
    if (h.tanggal_po > s.terakhir) {
      s.terakhir = h.tanggal_po;
      s.qtyTerakhir = h.qty;
    } else if (h.tanggal_po === s.terakhir && s.jumlahOrder > 1) s.qtyTerakhir += h.qty;
    const idx = 5 - Math.min(5, Math.floor(diffDays(D, h.tanggal_po) / 30));
    s.perBulan[idx] += h.qty;
  }
  return [...map.values()].sort((a, b) => b.terakhir.localeCompare(a.terakhir) || a.kode_sku.localeCompare(b.kode_sku));
}

export interface Saran {
  qty: number;
  /** Dasar perhitungan. */
  basis: '3 bulan' | '6 bulan' | null;
  rataBulanan: number;
}

/**
 * Suggested order = rata-rata qty/bulan dalam 3 bulan terakhir (fallback 6 bulan),
 * dibulatkan ke atas (tidak dipaksa ke MOQ — MOQ hanya catatan).
 */
export function suggestedQty(h: HistoriSku | undefined, _p?: Pick<ProdukLengkap, 'moq'>): Saran {
  if (!h) return { qty: 0, basis: null, rataBulanan: 0 };
  const tiga = h.perBulan.slice(3).reduce((a, b) => a + b, 0);
  if (tiga > 0) {
    const rata = tiga / 3;
    return { qty: Math.ceil(rata), basis: '3 bulan', rataBulanan: Math.round(rata * 10) / 10 };
  }
  if (h.totalQty > 0) {
    const rata = h.totalQty / 6;
    return { qty: Math.ceil(rata), basis: '6 bulan', rataBulanan: Math.round(rata * 10) / 10 };
  }
  return { qty: 0, basis: null, rataBulanan: 0 };
}

/** Buat item PO dari keranjang {kode_sku: qty}. Qty 0 diabaikan. */
export function buatItems(keranjang: Record<string, number>, produk: readonly ProdukLengkap[]): ItemPO[] {
  const byKode = new Map(produk.map((p) => [p.kode_sku, p]));
  const items: ItemPO[] = [];
  for (const [kode, qty] of Object.entries(keranjang)) {
    const p = byKode.get(normKode(kode));
    if (!p || qty <= 0) continue;
    items.push({ kode_sku: p.kode_sku, nama_sku: p.nama_sku, divisi: p.divisi, satuan: p.satuan, qty, harga: p.harga, subtotal: qty * p.harga, isi_karton: p.isi_karton });
  }
  return items.sort((a, b) => a.divisi.localeCompare(b.divisi) || a.nama_sku.localeCompare(b.nama_sku));
}

export const totalItems = (items: readonly ItemPO[]) => items.reduce((s, i) => s + i.subtotal, 0);

export interface CekKredit {
  boleh: boolean;
  alasan: string | null;
  /** null = tanpa limit (TUNAI / MT / limit kosong). */
  sisaLimit: number | null;
  /** Peringatan non-blocking, mis. toko diblokir → PO berpotensi tidak release. */
  peringatan: string | null;
}

export const PERINGATAN_BLOKIR = 'PO berpotensi tidak release. Selesaikan tagihan atau hubungi admin.';

export interface OpsiKredit {
  /** MT tidak memakai aturan limit kredit maupun blokir. */
  channel?: 'GT' | 'MT';
}

/**
 * GT KREDIT: outstanding + total PO > limit → tidak boleh.
 * GT TUNAI / MT: tanpa limit. Toko diblokir (GT) → boleh submit + peringatan.
 */
export function cekKredit(
  outlet: Pick<MasterToko, 'status_blokir' | 'limit_kredit' | 'tipe_bayar'> | undefined,
  outstanding: number,
  totalPO: number,
  opsi: OpsiKredit = {},
): CekKredit {
  if (opsi.channel === 'MT') return { boleh: true, alasan: null, sisaLimit: null, peringatan: null };
  const peringatan = outlet?.status_blokir ? PERINGATAN_BLOKIR : null;
  const limit = outlet?.limit_kredit;
  if (outlet?.tipe_bayar === 'TUNAI' || limit === undefined || limit === null) return { boleh: true, alasan: null, sisaLimit: null, peringatan };
  const sisa = limit - outstanding;
  if (totalPO > sisa)
    return { boleh: false, alasan: `Melebihi limit kredit. Sisa limit ${formatRupiah(Math.max(0, sisa))}.`, sisaLimit: sisa, peringatan };
  return { boleh: true, alasan: null, sisaLimit: sisa, peringatan };
}

/** "Biasa order ±4 Pcs/bulan" (dibulatkan ke atas, tanpa desimal). */
export function teksBiasaOrder(s: Pick<Saran, 'rataBulanan'>, satuan: string): string | null {
  if (!s.rataBulanan) return null;
  return `Biasa order ±${Math.max(1, Math.ceil(s.rataBulanan))} ${satuan}/bulan`;
}

export interface ValidasiPO {
  items: ItemPO[];
  total: number;
  errorItem: Record<string, string>;
  /** GT: item di bawah MOQ — flag/catatan saja, tidak memblokir submit. */
  catatanItem: Record<string, string>;
  kredit: CekKredit;
  bolehSubmit: boolean;
}

export function validasiPO(
  keranjang: Record<string, number>,
  produk: readonly ProdukLengkap[],
  outlet: Pick<MasterToko, 'status_blokir' | 'limit_kredit' | 'tipe_bayar'> | undefined,
  outstanding: number,
  opsi: OpsiKredit = {},
): ValidasiPO {
  const byKode = new Map(produk.map((p) => [p.kode_sku, p]));
  const errorItem: Record<string, string> = {};
  const catatanItem: Record<string, string> = {};
  for (const [kode, qty] of Object.entries(keranjang)) {
    const p = byKode.get(normKode(kode));
    if (!p) continue;
    const e = validasiQty(qty);
    if (e) errorItem[p.kode_sku] = e;
    const c = catatanMoq(qty, p, { channel: opsi.channel });
    if (c) catatanItem[p.kode_sku] = c;
  }
  const items = buatItems(keranjang, produk);
  const total = totalItems(items);
  const kredit = cekKredit(outlet, outstanding, total, opsi);
  return { items, total, errorItem, catatanItem, kredit, bolehSubmit: items.length > 0 && !Object.keys(errorItem).length && kredit.boleh };
}
