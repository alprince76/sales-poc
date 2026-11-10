import type { ISODate } from './dates';

/** Satu baris Master Toko / Master Outlet (mapping salesman ↔ toko). */
export interface MasterToko {
  kode_salesman: string;
  nama_salesman: string;
  salesman_bw?: string;
  kode_toko: string;
  nama_toko: string;
  area?: string;
  alamat?: string;
  tipe_outlet?: string;
  /** Rupiah; kosong = tanpa limit. */
  limit_kredit?: number;
  status_blokir?: boolean;
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

/** Master Produk (SKU). */
export interface Produk {
  kode_sku: string;
  nama_sku: string;
  divisi: string;
  kategori?: string;
  /** Price list terakhir, rupiah per satuan. */
  harga: number;
  /** "GT" = terdaftar di channel General Trade. */
  channel?: string;
}

/** Master Order Rules. */
export interface OrderRule {
  kode_sku: string;
  satuan: string;
  moq: number;
  kelipatan?: number;
}

/** Historical Sales: satu baris = satu pembelian SKU oleh toko. */
export interface HistoriSales {
  kode_toko: string;
  kode_sku: string;
  tanggal_po: ISODate;
  qty: number;
}

export interface DataSet {
  master: MasterToko[];
  rovi: Faktur[];
  pjp: Kunjungan[];
  produk: Produk[];
  rules: OrderRule[];
  histori: HistoriSales[];
}

export type StatusFaktur = 'OVERDUE' | 'JATUH_TEMPO_HARI_INI' | 'BELUM_JATUH_TEMPO';
export type StatusToko = 'OVERDUE' | 'JATUH_TEMPO_HARI_INI' | 'TIDAK_ADA_TAGIHAN';
export type UrutanMode = 'prioritas' | 'rute';

// ───────────────────────── Aktivitas SR (input di lapangan) ─────────────────────────

export type StatusBayar = 'PAID' | 'PARTIAL' | 'JANJI_BAYAR' | 'BAD_DEBT';

export interface Penagihan {
  id: string;
  no_faktur: string;
  kode_toko: string;
  kode_salesman: string;
  /** Tanggal kunjungan saat penagihan dicatat. */
  tanggal: ISODate;
  status: StatusBayar;
  /** Nominal yang diterima (PAID/PARTIAL); 0 untuk JANJI_BAYAR/BAD_DEBT. */
  nominal: number;
  tanggal_janji?: ISODate;
  alasan?: string;
  createdAt: string;
}

export interface StokInternal {
  kode_sku: string;
  display: number;
  backroom: number;
}

export interface StokKompetitor {
  nama_produk: string;
  qty: number;
}

export interface CekStok {
  id: string;
  kode_toko: string;
  kode_salesman: string;
  tanggal: ISODate;
  internal: StokInternal[];
  kompetitor: StokKompetitor[];
  createdAt: string;
}

export interface ItemPO {
  kode_sku: string;
  nama_sku: string;
  divisi: string;
  satuan: string;
  qty: number;
  harga: number;
  subtotal: number;
}

export interface PurchaseOrder {
  id: string;
  no_po: string;
  kode_toko: string;
  kode_salesman: string;
  tanggal: ISODate;
  items: ItemPO[];
  total: number;
  status: 'TERKIRIM';
  createdAt: string;
}

export type LangkahKunjungan = 'collection' | 'stok' | 'po';
export type HasilLangkah = 'SELESAI' | 'DILEWATI';

export interface StatusKunjungan {
  kode_toko: string;
  kode_salesman: string;
  tanggal: ISODate;
  langkah: Partial<Record<LangkahKunjungan, HasilLangkah>>;
  selesaiAt?: string;
}

export interface Aktivitas {
  penagihan: Penagihan[];
  stok: CekStok[];
  po: PurchaseOrder[];
  kunjungan: StatusKunjungan[];
}
