/**
 * Menu Collection: validasi update status penagihan & penerapannya ke ROVI.
 * Paid/Partially Paid mengurangi sisa tagihan; Janji Bayar & Bad Debt hanya dicatat.
 */
import { diffDays, isISODate, type ISODate } from './dates';
import { normKode } from './billing';
import type { Faktur, Penagihan, StatusBayar } from './types';

export const LABEL_STATUS_BAYAR: Record<StatusBayar, string> = {
  PAID: 'Paid',
  PARTIAL: 'Partially Paid',
  JANJI_BAYAR: 'Janji Bayar',
  BAD_DEBT: 'Bad Debt',
};

export const ALASAN_BAD_DEBT = ['Toko Tutup', 'Pemilik Tidak Ada', 'Uang Belum Siap', 'Lainnya'] as const;

export interface InputPenagihan {
  status: StatusBayar | null;
  /** Untuk PARTIAL. */
  nominal?: number | null;
  /** Untuk JANJI_BAYAR. */
  tanggal_janji?: string | null;
  /** Untuk BAD_DEBT: salah satu ALASAN_BAD_DEBT. */
  alasan?: string | null;
  /** Untuk BAD_DEBT + "Lainnya". */
  alasan_lain?: string | null;
}

/**
 * Validasi form penagihan untuk faktur dengan sisa tagihan efektif `sisa` pada tanggal kunjungan D.
 * Mengembalikan daftar pesan error (kosong = valid).
 */
export function validasiPenagihan(input: InputPenagihan, sisa: number, D: ISODate): string[] {
  const err: string[] = [];
  if (sisa <= 0) return ['Faktur sudah lunas.'];
  switch (input.status) {
    case null:
    case undefined:
      err.push('Pilih status penagihan.');
      break;
    case 'PAID':
      break;
    case 'PARTIAL': {
      const n = input.nominal;
      if (n === null || n === undefined || !Number.isInteger(n) || n <= 0) err.push('Isi nominal yang dibayar.');
      else if (n >= sisa) err.push('Nominal sama dengan / melebihi sisa tagihan. Pilih "Paid" jika lunas.');
      break;
    }
    case 'JANJI_BAYAR': {
      const t = input.tanggal_janji;
      if (!t || !isISODate(t)) err.push('Isi tanggal janji bayar.');
      else if (diffDays(t, D) < 0) err.push('Tanggal janji bayar tidak boleh sebelum tanggal kunjungan.');
      break;
    }
    case 'BAD_DEBT': {
      if (!input.alasan || !(ALASAN_BAD_DEBT as readonly string[]).includes(input.alasan)) err.push('Pilih alasan.');
      else if (input.alasan === 'Lainnya' && !input.alasan_lain?.trim()) err.push('Tulis alasan lainnya.');
      break;
    }
  }
  return err;
}

/** Bentuk catatan Penagihan dari input yang sudah valid. */
export function buatPenagihan(
  input: InputPenagihan,
  ctx: { faktur: Faktur; sisa: number; kode_salesman: string; D: ISODate; id: string; now: string },
): Penagihan {
  const status = input.status!;
  return {
    id: ctx.id,
    no_faktur: ctx.faktur.no_faktur,
    kode_toko: normKode(ctx.faktur.kode_toko),
    kode_salesman: normKode(ctx.kode_salesman),
    tanggal: ctx.D,
    status,
    nominal: status === 'PAID' ? ctx.sisa : status === 'PARTIAL' ? (input.nominal ?? 0) : 0,
    tanggal_janji: status === 'JANJI_BAYAR' ? (input.tanggal_janji ?? undefined) : undefined,
    alasan:
      status === 'BAD_DEBT'
        ? input.alasan === 'Lainnya'
          ? `Lainnya: ${input.alasan_lain?.trim()}`
          : (input.alasan ?? undefined)
        : undefined,
    createdAt: ctx.now,
  };
}

const keyFaktur = (no: string) => no.trim().toUpperCase();

/** ROVI efektif: sisa_tagihan dikurangi pembayaran (PAID/PARTIAL) yang tercatat. */
export function applyPenagihan(rovi: readonly Faktur[], logs: readonly Penagihan[]): Faktur[] {
  if (!logs.length) return rovi as Faktur[];
  const bayar = new Map<string, number>();
  for (const l of logs) {
    if (l.status !== 'PAID' && l.status !== 'PARTIAL') continue;
    const k = keyFaktur(l.no_faktur);
    bayar.set(k, (bayar.get(k) ?? 0) + l.nominal);
  }
  return rovi.map((f) => {
    const b = bayar.get(keyFaktur(f.no_faktur));
    return b ? { ...f, sisa_tagihan: Math.max(0, f.sisa_tagihan - b) } : f;
  });
}

/** Catatan penagihan terakhir per no_faktur (untuk label di kartu faktur). */
export function penagihanTerakhir(logs: readonly Penagihan[]): Map<string, Penagihan> {
  const out = new Map<string, Penagihan>();
  for (const l of logs) {
    const k = keyFaktur(l.no_faktur);
    const prev = out.get(k);
    if (!prev || prev.createdAt <= l.createdAt) out.set(k, l);
  }
  return out;
}

export function getPenagihanTerakhir(map: Map<string, Penagihan>, noFaktur: string): Penagihan | undefined {
  return map.get(keyFaktur(noFaktur));
}

export interface RingkasanPenagihan {
  terkumpul: number;
  jumlahPaid: number;
  jumlahPartial: number;
  jumlahJanji: number;
  jumlahBadDebt: number;
  jumlahFaktur: number;
}

export function ringkasPenagihan(logs: readonly Penagihan[]): RingkasanPenagihan {
  const r: RingkasanPenagihan = { terkumpul: 0, jumlahPaid: 0, jumlahPartial: 0, jumlahJanji: 0, jumlahBadDebt: 0, jumlahFaktur: 0 };
  const faktur = new Set<string>();
  for (const l of logs) {
    faktur.add(keyFaktur(l.no_faktur));
    r.terkumpul += l.nominal;
    if (l.status === 'PAID') r.jumlahPaid++;
    else if (l.status === 'PARTIAL') r.jumlahPartial++;
    else if (l.status === 'JANJI_BAYAR') r.jumlahJanji++;
    else r.jumlahBadDebt++;
  }
  r.jumlahFaktur = faktur.size;
  return r;
}
