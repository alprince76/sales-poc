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
  /** Bill address 1–4 (customer master); digabung untuk tampilan. */
  alamat_1?: string;
  alamat_2?: string;
  alamat_3?: string;
  alamat_4?: string;
  tipe_outlet?: string;
  /** Customer group MT, mis. "BORMA DAKOTA GROUP". */
  cust_group?: string;
  /** Average sales (kolom RPP13), rupiah. */
  rpp13?: number;
  /** Rupiah; kosong = tanpa limit. */
  limit_kredit?: number;
  status_blokir?: boolean;
  /** "GT" (General Trade) / "MT" (Modern Trade). Kosong = GT. */
  channel?: string;
  /** TUNAI / KREDIT. Kosong = KREDIT. */
  tipe_bayar?: string;
  /** Term of Payment (hari). 0 = tunai. */
  top_hari?: number;
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
  /** Kode divisi faktur, mis. DNE / CBN / MRS. */
  divisi?: string;
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
  /** Sub brand, mis. "Perlengkapan Bayi". */
  sub_brand?: string;
  /** Nama lengkap SKU (kolom "new material"); bila ada dipakai sebagai nama. */
  new_material?: string;
  /** Price list terakhir, rupiah per satuan. */
  harga: number;
  /** "GT" = terdaftar di channel General Trade. */
  channel?: string;
  /** Kosong = aktif. */
  status_aktif?: boolean;
}

/** Mapping Toko – SKU Listing (Must Stock List). */
export interface MslListing {
  kode_toko: string;
  kode_sku: string;
  status_listed: boolean;
}

/** Master Order Rules. */
export interface OrderRule {
  kode_sku: string;
  satuan: string;
  moq: number;
  /** Tidak lagi dipakai untuk validasi (MOQ ≠ kelipatan); tetap diterima saat upload. */
  kelipatan?: number;
  /** Isi per karton (CAR) dalam satuan dasar. */
  isi_karton?: number;
}

/** Price List: harga per SKU, opsional per channel (kosong = semua channel). */
export interface PriceList {
  kode_sku: string;
  harga: number;
  channel?: string;
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
  msl: MslListing[];
  price: PriceList[];
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

export type SatuanInput = 'CAR' | 'PCS';

export interface StokKompetitor {
  nama_produk: string;
  qty: number;
  /** Label satuan input (tanpa konversi). */
  satuan_input?: SatuanInput;
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
  /** Qty dalam satuan dasar. */
  qty: number;
  harga: number;
  subtotal: number;
  isi_karton?: number;
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
  /** Toko diblokir saat PO dibuat → PO berpotensi tidak release. */
  berpotensi_tidak_release?: boolean;
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
