/** Pencarian SKU by kode SAP atau nama (untuk combobox pilih SKU). */
import type { Produk } from './types';

/**
 * Ranking: kode persis > awalan kode > awal nama / awal kata > substring nama/kode.
 * Query kosong → [] (combobox menampilkan saran sendiri).
 */
export function cariSku<T extends Pick<Produk, 'kode_sku' | 'nama_sku'>>(produk: readonly T[], q: string, limit = 8): T[] {
  const s = q.trim().toUpperCase();
  if (!s) return [];
  const skor = (p: T): number => {
    const kode = p.kode_sku.toUpperCase();
    const nama = p.nama_sku.toUpperCase();
    if (kode === s) return 0;
    if (kode.startsWith(s)) return 1;
    if (nama.startsWith(s)) return 2;
    if (nama.split(/[\s/()-]+/).some((w) => w.startsWith(s))) return 3;
    if (nama.includes(s) || kode.includes(s)) return 4;
    // Semua kata query muncul di nama (mis. "sgm 400").
    const kata = s.split(/\s+/).filter(Boolean);
    if (kata.length > 1 && kata.every((k) => nama.includes(k))) return 5;
    return -1;
  };
  return produk
    .map((p) => ({ p, k: skor(p) }))
    .filter((x) => x.k >= 0)
    .sort((a, b) => a.k - b.k || a.p.nama_sku.localeCompare(b.p.nama_sku))
    .slice(0, limit)
    .map((x) => x.p);
}
