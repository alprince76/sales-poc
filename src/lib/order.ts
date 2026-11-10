/**
 * Menu Purchase Order: histori, suggested order, validasi MOQ/kelipatan, limit kredit & blokir.
 */
import { addDays, diffDays, type ISODate } from './dates';
import { normKode } from './billing';
import { formatRupiah } from './format';
import type { HistoriSales, ItemPO, MasterToko, OrderRule, Produk } from './types';

export interface ProdukLengkap extends Produk {
  satuan: string;
  moq: number;
  kelipatan: number;
}

/** Gabung Master Produk + Order Rules. SKU tanpa rule → MOQ 1, kelipatan 1, satuan "Pcs". */
export function gabungProduk(produk: readonly Produk[], rules: readonly OrderRule[]): ProdukLengkap[] {
  const r = new Map(rules.map((x) => [normKode(x.kode_sku), x]));
  return produk.map((p) => {
    const rule = r.get(normKode(p.kode_sku));
    return {
      ...p,
      kode_sku: normKode(p.kode_sku),
      satuan: rule?.satuan ?? 'Pcs',
      moq: Math.max(1, rule?.moq ?? 1),
      kelipatan: Math.max(1, rule?.kelipatan ?? 1),
    };
  });
}

/** Pesan error item; null = valid. qty 0 = tidak dipesan (valid). */
export function validasiQty(qty: number, p: Pick<ProdukLengkap, 'nama_sku' | 'moq' | 'kelipatan' | 'satuan'>): string | null {
  if (!Number.isInteger(qty) || qty < 0) return 'Qty harus bilangan bulat ≥ 0.';
  if (qty === 0) return null;
  if (qty < p.moq) return `Minimal pemesanan untuk SKU ${p.nama_sku} adalah ${p.moq} ${p.satuan}`;
  if (p.kelipatan > 1 && qty % p.kelipatan !== 0)
    return `Pemesanan SKU ${p.nama_sku} harus kelipatan ${p.kelipatan} ${p.satuan}`;
  return null;
}

/** Bulatkan ke atas agar memenuhi MOQ dan kelipatan. */
export function bulatkanQty(qty: number, p: Pick<ProdukLengkap, 'moq' | 'kelipatan'>): number {
  if (qty <= 0) return 0;
  const q = Math.max(qty, p.moq);
  return Math.ceil(q / p.kelipatan) * p.kelipatan;
}

export interface HistoriSku {
  kode_sku: string;
  totalQty: number;
  jumlahOrder: number;
  terakhir: ISODate;
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
    if (!s) map.set(sku, (s = { kode_sku: sku, totalQty: 0, jumlahOrder: 0, terakhir: h.tanggal_po, perBulan: [0, 0, 0, 0, 0, 0] }));
    s.totalQty += h.qty;
    s.jumlahOrder++;
    if (h.tanggal_po > s.terakhir) s.terakhir = h.tanggal_po;
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
 * dibulatkan ke atas ke MOQ & kelipatan.
 */
export function suggestedQty(h: HistoriSku | undefined, p: Pick<ProdukLengkap, 'moq' | 'kelipatan'>): Saran {
  if (!h) return { qty: 0, basis: null, rataBulanan: 0 };
  const tiga = h.perBulan.slice(3).reduce((a, b) => a + b, 0);
  if (tiga > 0) {
    const rata = tiga / 3;
    return { qty: bulatkanQty(Math.ceil(rata), p), basis: '3 bulan', rataBulanan: Math.round(rata * 10) / 10 };
  }
  if (h.totalQty > 0) {
    const rata = h.totalQty / 6;
    return { qty: bulatkanQty(Math.ceil(rata), p), basis: '6 bulan', rataBulanan: Math.round(rata * 10) / 10 };
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
    items.push({ kode_sku: p.kode_sku, nama_sku: p.nama_sku, divisi: p.divisi, satuan: p.satuan, qty, harga: p.harga, subtotal: qty * p.harga });
  }
  return items.sort((a, b) => a.divisi.localeCompare(b.divisi) || a.nama_sku.localeCompare(b.nama_sku));
}

export const totalItems = (items: readonly ItemPO[]) => items.reduce((s, i) => s + i.subtotal, 0);

export interface CekKredit {
  boleh: boolean;
  alasan: string | null;
  /** null = tanpa limit. */
  sisaLimit: number | null;
}

/** Toko diblokir → tidak boleh PO. Outstanding + total PO > limit → tidak boleh. */
export function cekKredit(outlet: Pick<MasterToko, 'status_blokir' | 'limit_kredit'> | undefined, outstanding: number, totalPO: number): CekKredit {
  if (outlet?.status_blokir) return { boleh: false, alasan: 'Toko diblokir. PO baru tidak dapat dibuat.', sisaLimit: null };
  const limit = outlet?.limit_kredit;
  if (limit === undefined || limit === null) return { boleh: true, alasan: null, sisaLimit: null };
  const sisa = limit - outstanding;
  if (totalPO > sisa)
    return { boleh: false, alasan: `Melebihi limit kredit. Sisa limit ${formatRupiah(Math.max(0, sisa))}.`, sisaLimit: sisa };
  return { boleh: true, alasan: null, sisaLimit: sisa };
}

export interface ValidasiPO {
  items: ItemPO[];
  total: number;
  errorItem: Record<string, string>;
  kredit: CekKredit;
  bolehSubmit: boolean;
}

export function validasiPO(
  keranjang: Record<string, number>,
  produk: readonly ProdukLengkap[],
  outlet: Pick<MasterToko, 'status_blokir' | 'limit_kredit'> | undefined,
  outstanding: number,
): ValidasiPO {
  const byKode = new Map(produk.map((p) => [p.kode_sku, p]));
  const errorItem: Record<string, string> = {};
  for (const [kode, qty] of Object.entries(keranjang)) {
    const p = byKode.get(normKode(kode));
    if (!p) continue;
    const e = validasiQty(qty, p);
    if (e) errorItem[p.kode_sku] = e;
  }
  const items = buatItems(keranjang, produk);
  const total = totalItems(items);
  const kredit = cekKredit(outlet, outstanding, total);
  return { items, total, errorItem, kredit, bolehSubmit: items.length > 0 && !Object.keys(errorItem).length && kredit.boleh };
}
