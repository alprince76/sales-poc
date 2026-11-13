/**
 * Daftar Inkasso: semua toko coverage SR yang punya tagihan jatuh tempo / overdue di D
 * (dihitung dari ROVI awal, sebelum penagihan aplikasi).
 * - Tertagih: sudah ada log penagihan di D dan tagihan jatuh tempo sudah lunas.
 * - Belum ditagih: belum dikunjungi / belum ada log, atau belum lunas (partial, janji bayar, bad debt).
 */
import { normKode, ringkasTagihan, type FakturIndex } from './billing';
import type { ISODate } from './dates';
import type { MasterToko, Penagihan, StatusBayar } from './types';

export interface BarisInkasso {
  kode_toko: string;
  nama_toko: string;
  area: string;
  /** Harus ditagih menurut ROVI awal. */
  harusAwal: number;
  /** Sisa harus ditagih setelah penagihan aplikasi. */
  sisa: number;
  terkumpul: number;
  maxHariOverdue: number;
  /** Status log terakhir di D (bila ada). */
  statusTerakhir: StatusBayar | null;
  tertagih: boolean;
}

export interface Inkasso {
  tertagih: BarisInkasso[];
  belum: BarisInkasso[];
}

export function daftarInkasso(
  master: readonly MasterToko[],
  rawIdx: FakturIndex,
  effIdx: FakturIndex,
  sales: string,
  D: ISODate,
  logs: readonly Penagihan[],
): Inkasso {
  const sa = normKode(sales);
  const logToko = new Map<string, Penagihan[]>();
  for (const l of logs) {
    if (l.tanggal !== D || normKode(l.kode_salesman) !== sa) continue;
    const k = normKode(l.kode_toko);
    logToko.set(k, [...(logToko.get(k) ?? []), l]);
  }
  const seen = new Set<string>();
  const out: Inkasso = { tertagih: [], belum: [] };
  for (const m of master) {
    const kode = normKode(m.kode_toko);
    if (normKode(m.kode_salesman) !== sa || seen.has(kode)) continue;
    seen.add(kode);
    const awal = ringkasTagihan(rawIdx.get(kode) ?? [], D);
    if (!awal.perluDitagih) continue;
    const kini = ringkasTagihan(effIdx.get(kode) ?? [], D);
    const ls = (logToko.get(kode) ?? []).slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const tertagih = ls.length > 0 && kini.totalHarusDitagih === 0;
    const row: BarisInkasso = {
      kode_toko: kode,
      nama_toko: m.nama_toko,
      area: m.area ?? '',
      harusAwal: awal.totalHarusDitagih,
      sisa: kini.totalHarusDitagih,
      terkumpul: ls.reduce((s, l) => s + l.nominal, 0),
      maxHariOverdue: awal.maxHariOverdue,
      statusTerakhir: ls.length ? ls[ls.length - 1].status : null,
      tertagih,
    };
    (tertagih ? out.tertagih : out.belum).push(row);
  }
  out.belum.sort((a, b) => b.maxHariOverdue - a.maxHariOverdue || b.sisa - a.sisa || a.nama_toko.localeCompare(b.nama_toko));
  out.tertagih.sort((a, b) => a.nama_toko.localeCompare(b.nama_toko));
  return out;
}
