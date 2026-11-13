/** Menu Cek Stok: daftar SKU internal untuk toko + validasi input. */
import type { HistoriSku, ProdukLengkap } from './order';
import type { StokInternal, StokKompetitor } from './types';

export interface SkuStok extends ProdukLengkap {
  pernahDibeli: boolean;
}

/** SKU yang pernah dibeli toko (didahulukan) ∪ SKU channel GT. */
export function daftarSkuStok(produk: readonly ProdukLengkap[], histori: readonly HistoriSku[]): SkuStok[] {
  const dibeli = new Set(histori.map((h) => h.kode_sku));
  return produk
    .filter((p) => dibeli.has(p.kode_sku) || (p.channel ?? 'GT').toUpperCase() === 'GT')
    .map((p) => ({ ...p, pernahDibeli: dibeli.has(p.kode_sku) }))
    .sort(
      (a, b) =>
        Number(b.pernahDibeli) - Number(a.pernahDibeli) ||
        a.divisi.localeCompare(b.divisi) ||
        a.nama_sku.localeCompare(b.nama_sku),
    );
}

const okQty = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0;

/** Validasi & bersihkan input stok. Baris kompetitor kosong dibuang. */
export function validasiStok(
  internal: StokInternal[],
  kompetitor: StokKompetitor[],
): { internal: StokInternal[]; kompetitor: StokKompetitor[]; error: string[] } {
  const error: string[] = [];
  for (const s of internal) if (!okQty(s.display) || !okQty(s.backroom)) error.push(`Stok ${s.kode_sku} harus bilangan bulat ≥ 0.`);
  const komp = kompetitor.filter((k) => k.nama_produk.trim() || k.qty);
  for (const k of komp) {
    if (!k.nama_produk.trim()) error.push('Nama produk kompetitor wajib diisi.');
    if (!okQty(k.qty)) error.push(`Qty "${k.nama_produk}" harus bilangan bulat ≥ 0.`);
  }
  return {
    internal: internal.filter((s) => s.display > 0 || s.backroom > 0),
    kompetitor: komp.map((k) => ({ nama_produk: k.nama_produk.trim(), qty: k.qty, ...(k.satuan_input ? { satuan_input: k.satuan_input } : {}) })),
    error,
  };
}
