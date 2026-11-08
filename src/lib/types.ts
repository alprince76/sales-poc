import type { ISODate } from './dates';

/** Satu baris Master Toko (mapping salesman ↔ toko). */
export interface MasterToko {
  kode_salesman: string;
  nama_salesman: string;
  salesman_bw?: string;
  kode_toko: string;
  nama_toko: string;
  area?: string;
}

/** Satu baris ROVI = satu faktur. Uang = integer rupiah. */
export interface Faktur {
  kode_toko: string;
  nama_toko: string;
  no_faktur: string;
  tanggal_faktur: ISODate;
  tanggal_jatuh_tempo: ISODate;
  nilai_faktur: number;
  sisa_tagihan: number;
}

/** Satu baris PJP = satu jadwal kunjungan. */
export interface Kunjungan {
  kode_salesman: string;
  nama_salesman: string;
  tanggal_kunjungan: ISODate;
  hari?: string;
  kode_toko: string;
  nama_toko?: string;
  urutan?: number;
}

export interface DataSet {
  master: MasterToko[];
  rovi: Faktur[];
  pjp: Kunjungan[];
}

export type StatusFaktur = 'OVERDUE' | 'JATUH_TEMPO_HARI_INI' | 'BELUM_JATUH_TEMPO';
export type StatusToko = 'OVERDUE' | 'JATUH_TEMPO_HARI_INI' | 'TIDAK_ADA_TAGIHAN';
export type UrutanMode = 'prioritas' | 'rute';
