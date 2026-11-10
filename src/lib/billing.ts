/**
 * Logika inti penagihan (BR-01 s.d. BR-09). Pure function, dipakai semua halaman.
 * D = tanggal kunjungan "YYYY-MM-DD".
 */
import { diffDays, type ISODate } from './dates';
import type {
  DataSet,
  Faktur,
  Kunjungan,
  MasterToko,
  StatusFaktur,
  StatusToko,
  UrutanMode,
} from './types';

/** Data yang dibutuhkan logika penagihan. */
export type DataInti = Pick<DataSet, 'master' | 'rovi' | 'pjp'>;

/** BR-08: key join = kode_toko di-trim + uppercase. */
export function normKode(kode: string | null | undefined): string {
  return String(kode ?? '').trim().toUpperCase();
}

export interface FakturDinilai extends Faktur {
  status: StatusFaktur;
  /** D − jatuh_tempo; hanya > 0 untuk OVERDUE, selain itu 0. */
  hariTerlambat: number;
}

/** BR-01: faktur aktif hanya jika sisa_tagihan > 0. */
export function isAktif(f: Pick<Faktur, 'sisa_tagihan'>): boolean {
  return f.sisa_tagihan > 0;
}

/** BR-02/03/04. Mengembalikan null untuk faktur lunas. */
export function nilaiFaktur(f: Faktur, D: ISODate): FakturDinilai | null {
  if (!isAktif(f)) return null;
  const selisih = diffDays(D, f.tanggal_jatuh_tempo);
  const status: StatusFaktur =
    selisih > 0 ? 'OVERDUE' : selisih === 0 ? 'JATUH_TEMPO_HARI_INI' : 'BELUM_JATUH_TEMPO';
  return { ...f, status, hariTerlambat: selisih > 0 ? selisih : 0 };
}

const URUT_STATUS: Record<StatusFaktur, number> = {
  OVERDUE: 0,
  JATUH_TEMPO_HARI_INI: 1,
  BELUM_JATUH_TEMPO: 2,
};

function bandingFaktur(a: FakturDinilai, b: FakturDinilai): number {
  return (
    URUT_STATUS[a.status] - URUT_STATUS[b.status] ||
    a.tanggal_jatuh_tempo.localeCompare(b.tanggal_jatuh_tempo) ||
    a.no_faktur.localeCompare(b.no_faktur)
  );
}

export interface RingkasanTagihan {
  /** Faktur aktif, urut: Overdue (terlama dulu) → JT hari ini → Belum JT. */
  faktur: FakturDinilai[];
  jumlahFakturAktif: number;
  fakturOverdue: number;
  fakturJtHariIni: number;
  fakturBelumJt: number;
  totalOutstanding: number;
  totalOverdue: number;
  totalJtHariIni: number;
  totalBelumJt: number;
  /** BR-07 */
  totalHarusDitagih: number;
  maxHariOverdue: number;
  /** BR-05 */
  perluDitagih: boolean;
  status: StatusToko;
  /** Teks badge: "Overdue 38 hari" / "Jatuh Tempo Hari Ini" / "Tidak ada tagihan". */
  statusLabel: string;
}

/** Ringkasan seluruh faktur satu toko relatif terhadap D. */
export function ringkasTagihan(fakturToko: readonly Faktur[], D: ISODate): RingkasanTagihan {
  const faktur = fakturToko
    .map((f) => nilaiFaktur(f, D))
    .filter((f): f is FakturDinilai => f !== null)
    .sort(bandingFaktur);

  const r: RingkasanTagihan = {
    faktur,
    jumlahFakturAktif: faktur.length,
    fakturOverdue: 0,
    fakturJtHariIni: 0,
    fakturBelumJt: 0,
    totalOutstanding: 0,
    totalOverdue: 0,
    totalJtHariIni: 0,
    totalBelumJt: 0,
    totalHarusDitagih: 0,
    maxHariOverdue: 0,
    perluDitagih: false,
    status: 'TIDAK_ADA_TAGIHAN',
    statusLabel: '',
  };

  for (const f of faktur) {
    r.totalOutstanding += f.sisa_tagihan;
    if (f.status === 'OVERDUE') {
      r.fakturOverdue++;
      r.totalOverdue += f.sisa_tagihan;
      r.maxHariOverdue = Math.max(r.maxHariOverdue, f.hariTerlambat);
    } else if (f.status === 'JATUH_TEMPO_HARI_INI') {
      r.fakturJtHariIni++;
      r.totalJtHariIni += f.sisa_tagihan;
    } else {
      r.fakturBelumJt++;
      r.totalBelumJt += f.sisa_tagihan;
    }
  }

  r.totalHarusDitagih = r.totalOverdue + r.totalJtHariIni;
  r.perluDitagih = r.fakturOverdue + r.fakturJtHariIni > 0;
  r.status =
    r.fakturOverdue > 0 ? 'OVERDUE' : r.fakturJtHariIni > 0 ? 'JATUH_TEMPO_HARI_INI' : 'TIDAK_ADA_TAGIHAN';
  r.statusLabel = labelStatusToko(r.status, r.maxHariOverdue);
  return r;
}

export function labelStatusToko(status: StatusToko, maxHariOverdue: number): string {
  if (status === 'OVERDUE') return `Overdue ${maxHariOverdue} hari`;
  if (status === 'JATUH_TEMPO_HARI_INI') return 'Jatuh Tempo Hari Ini';
  return 'Tidak ada tagihan';
}

export const LABEL_STATUS_FAKTUR: Record<StatusFaktur, string> = {
  OVERDUE: 'Overdue',
  JATUH_TEMPO_HARI_INI: 'Jatuh Tempo Hari Ini',
  BELUM_JATUH_TEMPO: 'Belum Jatuh Tempo',
};

/** Index faktur per kode toko (ternormalisasi). */
export type FakturIndex = Map<string, Faktur[]>;

export function indexFaktur(rovi: readonly Faktur[]): FakturIndex {
  const idx: FakturIndex = new Map();
  for (const f of rovi) {
    const k = normKode(f.kode_toko);
    const arr = idx.get(k);
    if (arr) arr.push(f);
    else idx.set(k, [f]);
  }
  return idx;
}

export function indexMaster(master: readonly MasterToko[]): Map<string, MasterToko> {
  const idx = new Map<string, MasterToko>();
  for (const m of master) {
    const k = normKode(m.kode_toko);
    if (!idx.has(k)) idx.set(k, m);
  }
  return idx;
}

export interface BarisKunjungan extends RingkasanTagihan {
  kode_toko: string;
  nama_toko: string;
  area: string;
  urutan: number | null;
}

export interface HasilKunjungan {
  D: ISODate;
  kode_salesman: string;
  nama_salesman: string;
  baris: BarisKunjungan[];
  jumlahKunjungan: number;
  jumlahPerluDitagih: number;
  totalTagihan: number;
}

/** BR-06: perlu ditagih → max hari overdue ↓ → punya JT hari ini → urutan rute ↑. */
export function bandingPrioritas(a: BarisKunjungan, b: BarisKunjungan): number {
  return (
    Number(b.perluDitagih) - Number(a.perluDitagih) ||
    b.maxHariOverdue - a.maxHariOverdue ||
    Number(b.fakturJtHariIni > 0) - Number(a.fakturJtHariIni > 0) ||
    bandingRute(a, b)
  );
}

export function bandingRute(a: BarisKunjungan, b: BarisKunjungan): number {
  const ua = a.urutan ?? Number.POSITIVE_INFINITY;
  const ub = b.urutan ?? Number.POSITIVE_INFINITY;
  return ua - ub || a.kode_toko.localeCompare(b.kode_toko);
}

export interface OpsiKunjungan {
  urutan?: UrutanMode;
  /** Index siap pakai (opsional, untuk performa). */
  fakturIdx?: FakturIndex;
  masterIdx?: Map<string, MasterToko>;
}

/** Daftar kunjungan salesman di tanggal D, lengkap dengan status tagihan tiap toko. */
export function hitungKunjungan(
  data: DataInti,
  kodeSalesman: string,
  D: ISODate,
  opsi: OpsiKunjungan = {},
): HasilKunjungan {
  const fakturIdx = opsi.fakturIdx ?? indexFaktur(data.rovi);
  const masterIdx = opsi.masterIdx ?? indexMaster(data.master);
  const sales = normKode(kodeSalesman);

  const jadwal = data.pjp.filter(
    (p: Kunjungan) => normKode(p.kode_salesman) === sales && p.tanggal_kunjungan === D,
  );

  const baris: BarisKunjungan[] = jadwal.map((p) => {
    const kode = normKode(p.kode_toko);
    const m = masterIdx.get(kode);
    const faktur = fakturIdx.get(kode) ?? []; // BR-09: tidak ada di ROVI → tidak ada tagihan
    return {
      ...ringkasTagihan(faktur, D),
      kode_toko: kode,
      nama_toko: m?.nama_toko || p.nama_toko || faktur[0]?.nama_toko || kode,
      area: m?.area ?? '',
      urutan: typeof p.urutan === 'number' && Number.isFinite(p.urutan) ? p.urutan : null,
    };
  });

  baris.sort(opsi.urutan === 'rute' ? bandingRute : bandingPrioritas);

  const namaSales =
    jadwal[0]?.nama_salesman ??
    data.master.find((m) => normKode(m.kode_salesman) === sales)?.nama_salesman ??
    data.pjp.find((p) => normKode(p.kode_salesman) === sales)?.nama_salesman ??
    sales;

  return {
    D,
    kode_salesman: sales,
    nama_salesman: namaSales,
    baris,
    jumlahKunjungan: baris.length,
    jumlahPerluDitagih: baris.filter((b) => b.perluDitagih).length,
    totalTagihan: baris.reduce((s, b) => s + b.totalHarusDitagih, 0),
  };
}

export interface BarisToko extends RingkasanTagihan {
  kode_toko: string;
  nama_toko: string;
  area: string;
  kode_salesman: string;
  nama_salesman: string;
}

export interface FilterToko {
  /** Toko yang punya ≥1 faktur aktif dengan status ini. */
  status?: StatusFaktur;
  kodeSalesman?: string;
  /** Cari di kode/nama toko (case-insensitive). */
  cari?: string;
}

/**
 * US-A3: semua toko (Master ∪ ROVI) + ringkasan tagihan relatif D.
 * Urut: overdue paling lama dulu → total harus ditagih ↓ → kode toko.
 */
export function daftarToko(data: DataInti, D: ISODate, filter: FilterToko = {}): BarisToko[] {
  const fakturIdx = indexFaktur(data.rovi);
  const masterIdx = indexMaster(data.master);
  const kodeSemua = new Set<string>([...masterIdx.keys(), ...fakturIdx.keys()]);
  const sales = filter.kodeSalesman ? normKode(filter.kodeSalesman) : '';
  const cari = (filter.cari ?? '').trim().toUpperCase();

  const out: BarisToko[] = [];
  for (const kode of kodeSemua) {
    const m = masterIdx.get(kode);
    const faktur = fakturIdx.get(kode) ?? [];
    if (sales && normKode(m?.kode_salesman) !== sales) continue;
    const nama = m?.nama_toko || faktur[0]?.nama_toko || kode;
    if (cari && !kode.includes(cari) && !nama.toUpperCase().includes(cari)) continue;
    const r = ringkasTagihan(faktur, D);
    if (filter.status && !r.faktur.some((f) => f.status === filter.status)) continue;
    out.push({
      ...r,
      kode_toko: kode,
      nama_toko: nama,
      area: m?.area ?? '',
      kode_salesman: m ? normKode(m.kode_salesman) : '',
      nama_salesman: m?.nama_salesman ?? '',
    });
  }
  return out.sort(
    (a, b) =>
      b.maxHariOverdue - a.maxHariOverdue ||
      b.totalHarusDitagih - a.totalHarusDitagih ||
      a.kode_toko.localeCompare(b.kode_toko),
  );
}

export interface DetailToko extends RingkasanTagihan {
  kode_toko: string;
  nama_toko: string;
  area: string;
  overdue: FakturDinilai[];
  jtHariIni: FakturDinilai[];
  belumJt: FakturDinilai[];
}

/** Detail faktur satu toko di tanggal D (US-S3 / US-A3). */
export function detailToko(
  data: Pick<DataSet, 'rovi' | 'master'>,
  kodeToko: string,
  D: ISODate,
  opsi: Pick<OpsiKunjungan, 'fakturIdx' | 'masterIdx'> = {},
): DetailToko {
  const kode = normKode(kodeToko);
  const faktur = (opsi.fakturIdx ?? indexFaktur(data.rovi)).get(kode) ?? [];
  const m = (opsi.masterIdx ?? indexMaster(data.master)).get(kode);
  const r = ringkasTagihan(faktur, D);
  return {
    ...r,
    kode_toko: kode,
    nama_toko: m?.nama_toko || faktur[0]?.nama_toko || kode,
    area: m?.area ?? '',
    overdue: r.faktur.filter((f) => f.status === 'OVERDUE'),
    jtHariIni: r.faktur.filter((f) => f.status === 'JATUH_TEMPO_HARI_INI'),
    belumJt: r.faktur.filter((f) => f.status === 'BELUM_JATUH_TEMPO'),
  };
}
