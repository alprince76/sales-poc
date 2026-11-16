/**
 * Pencarian SKU by kode SAP, nama, atau principal (combobox pilih SKU).
 * Semua kata yang diketik harus cocok (urutan bebas, cukup awalan kata): "bolic straw", "straw 40", "12x6 straw".
 * Salah ketik ringan (1 huruf, kata ≥ 5 huruf) tetap ketemu dengan peringkat terbawah.
 */
import type { Produk } from './types';

type Cari = Pick<Produk, 'kode_sku' | 'nama_sku'> & { divisi?: string };

/** Huruf kecil, × → x, tanda baca → spasi. "12×6×40 gr" → "12x6x40 gr". */
export function normCari(s: string): string {
  return s
    .toLowerCase()
    .replace(/[×✕]/g, 'x')
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/\.(?!\d)|(?<!\d)\./g, ' ')
    .trim();
}

/** Token kata; "12x6x40gr" juga dipecah jadi 12, 6, 40, gr supaya "40" atau "6x40" ketemu. */
function tokens(nama: string): string[] {
  const dasar = normCari(nama).split(' ').filter(Boolean);
  const out = new Set(dasar);
  for (const t of dasar) {
    for (const bag of t.split(/x|(?<=\d)(?=[a-z])|(?<=[a-z])(?=\d)/)) if (bag) out.add(bag);
    // "6x40" sebagai akhiran dari "12x6x40"
    const p = t.split('x');
    for (let i = 1; i < p.length; i++) out.add(p.slice(i).join('x'));
  }
  return [...out];
}

/** Jarak edit ≤ 1 (ganti/tambah/hapus satu huruf). */
function beda1(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edit = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edit > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edit + (a.length - i) + (b.length - j) <= 1;
}

/** Skor satu kata query terhadap token produk: 0 awalan, 1 di tengah kata, 2 salah ketik, -1 tidak cocok. */
function skorKata(q: string, tok: readonly string[], gabung: string): number {
  if (tok.some((t) => t.startsWith(q))) return 0;
  // Di tengah kata: hanya untuk huruf ≥ 3 (angka harus di awal token supaya "40" tidak cocok ke kode 123400).
  if (q.length >= 3 && /[a-z]/.test(q) && gabung.includes(q)) return 1;
  // Salah ketik hanya untuk kata huruf (kode/angka harus tepat — 1 digit beda = SKU lain).
  if (q.length >= 5 && /^[a-z]+$/.test(q) && tok.some((t) => t.length >= 4 && /^[a-z]+$/.test(t) && (beda1(q, t) || beda1(q, t.slice(0, q.length)) || beda1(q, t.slice(0, q.length + 1))))) return 2;
  return -1;
}

export interface HasilCari<T> {
  items: T[];
  /** Jumlah semua SKU yang cocok (bisa lebih dari `items`). */
  total: number;
}

const cache = new WeakMap<object, { tok: string[]; gabung: string; nama: string; kode: string }>();
function indeks(p: Cari) {
  let v = cache.get(p);
  if (!v) {
    const nama = normCari(p.nama_sku);
    const kode = p.kode_sku.toLowerCase();
    const tok = [...tokens(p.nama_sku), kode, ...(p.divisi ? tokens(p.divisi) : [])];
    v = { tok, gabung: `${nama} ${p.divisi ? normCari(p.divisi) : ''}`, nama, kode };
    cache.set(p, v);
  }
  return v;
}

/**
 * Ranking: kode persis > awalan kode > nama diawali query > semua kata cocok di awal kata > ada yang di tengah kata > salah ketik.
 * Query kosong → [].
 */
export function cariSkuLengkap<T extends Cari>(produk: readonly T[], q: string, limit = 50): HasilCari<T> {
  const s = normCari(q);
  if (!s) return { items: [], total: 0 };
  const kata = s.split(' ').filter(Boolean);
  const hasil: { p: T; k: number }[] = [];
  for (const p of produk) {
    const ix = indeks(p);
    let k: number;
    if (ix.kode === s) k = 0;
    else if (ix.kode.startsWith(s)) k = 1;
    else if (ix.nama.startsWith(s)) k = 2;
    else {
      let terburuk = 0;
      for (const w of kata) {
        const sk = skorKata(w, ix.tok, ix.gabung);
        if (sk < 0) {
          terburuk = -1;
          break;
        }
        terburuk = Math.max(terburuk, sk);
      }
      if (terburuk < 0) continue;
      k = 3 + terburuk;
    }
    hasil.push({ p, k });
  }
  hasil.sort((a, b) => a.k - b.k || a.p.nama_sku.localeCompare(b.p.nama_sku));
  return { items: hasil.slice(0, limit).map((x) => x.p), total: hasil.length };
}

/** Kompatibel dengan pemanggil lama: hanya daftar item. */
export function cariSku<T extends Cari>(produk: readonly T[], q: string, limit = 50): T[] {
  return cariSkuLengkap(produk, q, limit).items;
}

/** Potongan nama untuk di-bold: bagian yang cocok dengan kata query. */
export function sorotNama(nama: string, q: string): { teks: string; cocok: boolean }[] {
  const kata = normCari(q).split(' ').filter((w) => w.length >= 2);
  if (!kata.length) return [{ teks: nama, cocok: false }];
  const re = new RegExp(`(${kata.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return nama
    .split(re)
    .filter(Boolean)
    .map((t) => ({ teks: t, cocok: kata.some((w) => t.toLowerCase() === w) }));
}
