/** Info toko sesuai customer master: alamat lengkap, average sales, last order, outstanding. */
import { normKode } from './billing';
import type { ISODate } from './dates';
import type { ProdukLengkap } from './order';
import type { HistoriSales, MasterToko, PurchaseOrder } from './types';

/** Gabung bill address 1–4 (yang kosong dilewati); fallback kolom `alamat`. */
export function alamatLengkap(m: Pick<MasterToko, 'alamat' | 'alamat_1' | 'alamat_2' | 'alamat_3' | 'alamat_4'>): string {
  const parts = [m.alamat_1, m.alamat_2, m.alamat_3, m.alamat_4].map((x) => x?.trim()).filter((x): x is string => !!x);
  return parts.length ? parts.join(', ') : (m.alamat?.trim() ?? '');
}

export interface LastOrder {
  tanggal: ISODate;
  nilai: number;
}

/**
 * Order terakhir toko ≤ D dari Historical Sales (qty × harga) + PO aplikasi.
 * Beberapa baris di tanggal yang sama dijumlahkan.
 */
export function lastOrder(
  kodeToko: string,
  D: ISODate,
  histori: readonly HistoriSales[],
  po: readonly PurchaseOrder[],
  produk: readonly Pick<ProdukLengkap, 'kode_sku' | 'harga'>[],
): LastOrder | null {
  const kode = normKode(kodeToko);
  const harga = new Map(produk.map((p) => [p.kode_sku, p.harga]));
  const perTanggal = new Map<ISODate, number>();
  const add = (t: ISODate, v: number) => perTanggal.set(t, (perTanggal.get(t) ?? 0) + v);
  for (const h of histori) {
    if (normKode(h.kode_toko) !== kode || h.tanggal_po > D) continue;
    add(h.tanggal_po, h.qty * (harga.get(normKode(h.kode_sku)) ?? 0));
  }
  for (const p of po) if (normKode(p.kode_toko) === kode && p.tanggal <= D) add(p.tanggal, p.total);
  let last: ISODate | null = null;
  for (const t of perTanggal.keys()) if (!last || t > last) last = t;
  return last ? { tanggal: last, nilai: perTanggal.get(last)! } : null;
}
