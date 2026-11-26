/** Status kunjungan (stepper Stok → Collection → PO). Immutable helpers. */
import type { ISODate } from './dates';
import { normKode } from './billing';
import type { HasilLangkah, LangkahKunjungan, StatusKunjungan } from './types';

// Langkah Retur di-take out dari alur kunjungan (tipe 'retur' tetap ada agar data lama aman).
export const LANGKAH: LangkahKunjungan[] = ['stok', 'collection', 'po'];
export const LABEL_LANGKAH: Record<LangkahKunjungan, string> = { stok: 'Cek Stok', retur: 'Retur', collection: 'Collection', po: 'Purchase Order' };

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

export type ReasonKunjungan = Pick<StatusKunjungan, 'alasan_tidak_dikunjungi' | 'alasan_tidak_transaksi'>;
export type JenisReason = keyof ReasonKunjungan;

export const REASON: Record<JenisReason, { label: string; pilihan: string[] }> = {
  alasan_tidak_dikunjungi: {
    label: 'Reason toko tidak dikunjungi',
    pilihan: ['Toko Tutup', 'Waktu Tidak Cukup', 'Lokasi Tidak Ditemukan', 'Kendala Perjalanan', 'Lainnya'],
  },
  alasan_tidak_transaksi: {
    label: 'Reason toko tidak melakukan transaksi',
    pilihan: ['Stok Masih Banyak', 'Pemilik/PIC Tidak Ada', 'Budget Belum Ada', 'Terkendala Tagihan/Limit', 'Lainnya'],
  },
};

/**
 * Reason yang wajib diisi sebelum kunjungan ditutup, dari data yang benar-benar tercatat
 * (bukan status langkah: Collection otomatis "Selesai" bila tidak ada tagihan).
 */
export function reasonWajib(ada: { stok: boolean; collection: boolean; po: boolean }): JenisReason | null {
  if (ada.po) return null;
  return ada.stok || ada.collection ? 'alasan_tidak_transaksi' : 'alasan_tidak_dikunjungi';
}

/** Nilai yang disimpan; null = belum lengkap. */
export function teksReason(pilih: string, lain = ''): string | null {
  if (!pilih) return null;
  if (pilih !== 'Lainnya') return pilih;
  return lain.trim() ? `Lainnya: ${lain.trim()}` : null;
}

/** Selesaikan kunjungan; langkah yang belum diisi dicatat DILEWATI. Reason hanya dicatat saat pertama ditutup. */
export function selesaikan(
  list: readonly StatusKunjungan[],
  sales: string,
  toko: string,
  D: ISODate,
  now: string,
  reason: ReasonKunjungan = {},
): StatusKunjungan[] {
  let out = [...list];
  for (const l of LANGKAH) if (!cariKunjungan(out, sales, toko, D)?.langkah[l]) out = tandaiLangkah(out, sales, toko, D, l, 'DILEWATI');
  return out.map((s) => (cocok(s, normKode(sales), normKode(toko), D) && !s.selesaiAt ? { ...s, ...reason, selesaiAt: now } : s));
}

export function progres(list: readonly StatusKunjungan[], sales: string, D: ISODate, kodeToko: readonly string[]) {
  const sa = normKode(sales);
  const set = new Set(kodeToko.map(normKode));
  const selesai = list.filter((s) => s.kode_salesman === sa && s.tanggal === D && set.has(s.kode_toko) && s.selesaiAt).length;
  return { selesai, total: set.size };
}
