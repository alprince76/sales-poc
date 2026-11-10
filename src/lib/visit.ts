/** Status kunjungan (stepper Collection → Stok → PO). Immutable helpers. */
import type { ISODate } from './dates';
import { normKode } from './billing';
import type { HasilLangkah, LangkahKunjungan, StatusKunjungan } from './types';

export const LANGKAH: LangkahKunjungan[] = ['collection', 'stok', 'po'];
export const LABEL_LANGKAH: Record<LangkahKunjungan, string> = { collection: 'Collection', stok: 'Cek Stok', po: 'Purchase Order' };

const cocok = (s: StatusKunjungan, sales: string, toko: string, D: ISODate) =>
  s.kode_salesman === sales && s.kode_toko === toko && s.tanggal === D;

export function cariKunjungan(list: readonly StatusKunjungan[], sales: string, toko: string, D: ISODate): StatusKunjungan | undefined {
  const sa = normKode(sales);
  const to = normKode(toko);
  return list.find((s) => cocok(s, sa, to, D));
}

export const isSelesai = (s: StatusKunjungan | undefined) => !!s?.selesaiAt;

/** Langkah pertama yang belum diisi (untuk melanjutkan stepper). */
export function langkahBerikut(s: StatusKunjungan | undefined): LangkahKunjungan | null {
  return LANGKAH.find((l) => !s?.langkah[l]) ?? null;
}

/** Tandai satu langkah. Mengembalikan list baru. */
export function tandaiLangkah(
  list: readonly StatusKunjungan[],
  sales: string,
  toko: string,
  D: ISODate,
  langkah: LangkahKunjungan,
  hasil: HasilLangkah,
): StatusKunjungan[] {
  const sa = normKode(sales);
  const to = normKode(toko);
  const idx = list.findIndex((s) => cocok(s, sa, to, D));
  const prev: StatusKunjungan = idx >= 0 ? list[idx] : { kode_salesman: sa, kode_toko: to, tanggal: D, langkah: {} };
  // Jangan turunkan SELESAI menjadi DILEWATI.
  const nilai = prev.langkah[langkah] === 'SELESAI' ? 'SELESAI' : hasil;
  const next: StatusKunjungan = { ...prev, langkah: { ...prev.langkah, [langkah]: nilai } };
  return idx >= 0 ? list.map((s, i) => (i === idx ? next : s)) : [...list, next];
}

/** Selesaikan kunjungan; langkah yang belum diisi dicatat DILEWATI. */
export function selesaikan(list: readonly StatusKunjungan[], sales: string, toko: string, D: ISODate, now: string): StatusKunjungan[] {
  let out = [...list];
  for (const l of LANGKAH) if (!cariKunjungan(out, sales, toko, D)?.langkah[l]) out = tandaiLangkah(out, sales, toko, D, l, 'DILEWATI');
  return out.map((s) => (cocok(s, normKode(sales), normKode(toko), D) ? { ...s, selesaiAt: s.selesaiAt ?? now } : s));
}

export function progres(list: readonly StatusKunjungan[], sales: string, D: ISODate, kodeToko: readonly string[]) {
  const sa = normKode(sales);
  const set = new Set(kodeToko.map(normKode));
  const selesai = list.filter((s) => s.kode_salesman === sa && s.tanggal === D && set.has(s.kode_toko) && s.selesaiAt).length;
  return { selesai, total: set.size };
}
