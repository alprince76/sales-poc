/**
 * Aplikasi MT: Must Stock List (MSL) & warning SKU untransacted.
 * Warning menyala untuk SKU **listed** yang tidak ada transaksi > 30 hari (atau belum pernah order).
 * Dinamis: PO yang disubmit di aplikasi ikut dihitung sebagai transaksi → warning langsung hilang.
 */
import { normKode } from './billing';
import { diffDays, formatTanggal, type ISODate } from './dates';
import type { ProdukLengkap } from './order';
import type { HistoriSales, MslListing, PurchaseOrder } from './types';

export const BATAS_HARI = 30;

export type WarningMSL = 'NO_ORDER_30' | 'BELUM_PERNAH' | null;

export interface SkuMSL extends ProdukLengkap {
  listed: boolean;
  lastOrder: ISODate | null;
  /** D − lastOrder; null bila belum pernah order. */
  hariSejak: number | null;
  /** Warning sebelum memperhitungkan keranjang PO yang sedang dibuat. */
  warningAwal: WarningMSL;
  /** Warning setelah keranjang diperhitungkan (SKU di keranjang = akan ditransaksikan). */
  warning: WarningMSL;
  /** SKU ada di keranjang PO saat ini. */
  diPO: boolean;
}

/** Index transaksi per toko: kode_toko → (kode_sku → daftar tanggal). Histori + PO aplikasi. */
export type IndexTransaksi = Map<string, Map<string, ISODate[]>>;

export function indexTransaksi(histori: readonly HistoriSales[], po: readonly PurchaseOrder[] = []): IndexTransaksi {
  const idx: IndexTransaksi = new Map();
  const add = (toko: string, sku: string, tgl: ISODate) => {
    const t = normKode(toko);
    let m = idx.get(t);
    if (!m) idx.set(t, (m = new Map()));
    const k = normKode(sku);
    const arr = m.get(k);
    if (arr) arr.push(tgl);
    else m.set(k, [tgl]);
  };
  for (const h of histori) add(h.kode_toko, h.kode_sku, h.tanggal_po);
  for (const p of po) for (const i of p.items) if (i.qty > 0) add(p.kode_toko, i.kode_sku, p.tanggal);
  return idx;
}

/** Tanggal transaksi terakhir ≤ D per SKU untuk satu toko. */
export function lastOrderToko(idx: IndexTransaksi, kodeToko: string, D: ISODate): Map<string, ISODate> {
  const out = new Map<string, ISODate>();
  for (const [sku, tgl] of idx.get(normKode(kodeToko)) ?? []) {
    let last: ISODate | null = null;
    for (const t of tgl) if (t <= D && (!last || t > last)) last = t;
    if (last) out.set(sku, last);
  }
  return out;
}

/** Index MSL: kode_toko → set SKU listed. */
export function indexMsl(msl: readonly MslListing[]): Map<string, Set<string>> {
  const idx = new Map<string, Set<string>>();
  for (const m of msl) {
    if (!m.status_listed) continue;
    const t = normKode(m.kode_toko);
    let s = idx.get(t);
    if (!s) idx.set(t, (s = new Set()));
    s.add(normKode(m.kode_sku));
  }
  return idx;
}

export function nilaiWarning(listed: boolean, hariSejak: number | null): WarningMSL {
  if (!listed) return null;
  if (hariSejak === null) return 'BELUM_PERNAH';
  return hariSejak > BATAS_HARI ? 'NO_ORDER_30' : null;
}

const bandingSku = (a: SkuMSL, b: SkuMSL) =>
  Number(!!b.warning) - Number(!!a.warning) ||
  Number(b.diPO) - Number(a.diPO) ||
  // Belum pernah order dianggap paling lama.
  (b.hariSejak ?? Number.POSITIVE_INFINITY) - (a.hariSejak ?? Number.POSITIVE_INFINITY) ||
  Number(b.listed) - Number(a.listed) ||
  a.nama_sku.localeCompare(b.nama_sku);

export interface KonteksMSL {
  produk: readonly ProdukLengkap[];
  mslIdx: Map<string, Set<string>>;
  trxIdx: IndexTransaksi;
}

/**
 * SKU yang tampil di toko = listed ∪ pernah dibeli, hanya SKU aktif.
 * `keranjang` (kode_sku → qty): SKU dengan qty > 0 dianggap akan ditransaksikan → warning hilang.
 * Urut: warning di atas (pin) → masuk PO → hari sejak order terlama → listed → nama.
 */
export function daftarSkuMSL(ctx: KonteksMSL, kodeToko: string, D: ISODate, keranjang: Record<string, number> = {}): SkuMSL[] {
  const toko = normKode(kodeToko);
  const listed = ctx.mslIdx.get(toko) ?? new Set<string>();
  const last = lastOrderToko(ctx.trxIdx, toko, D);
  const out: SkuMSL[] = [];
  for (const p of ctx.produk) {
    if (p.status_aktif === false) continue;
    const isListed = listed.has(p.kode_sku);
    const lo = last.get(p.kode_sku) ?? null;
    if (!isListed && !lo) continue;
    const hariSejak = lo ? diffDays(D, lo) : null;
    const warningAwal = nilaiWarning(isListed, hariSejak);
    const diPO = (keranjang[p.kode_sku] ?? 0) > 0;
    out.push({ ...p, listed: isListed, lastOrder: lo, hariSejak, warningAwal, warning: diPO ? null : warningAwal, diPO });
  }
  return out.sort(bandingSku);
}

export interface RingkasPrincipal {
  principal: string;
  total: number;
  listed: number;
  warning: number;
}

/** Counter per principal (field `divisi` di Master Produk). */
export function ringkasPrincipal(list: readonly SkuMSL[]): RingkasPrincipal[] {
  const m = new Map<string, RingkasPrincipal>();
  for (const s of list) {
    const r = m.get(s.divisi) ?? { principal: s.divisi, total: 0, listed: 0, warning: 0 };
    r.total++;
    if (s.listed) r.listed++;
    if (s.warning) r.warning++;
    m.set(s.divisi, r);
  }
  return [...m.values()].sort((a, b) => b.warning - a.warning || a.principal.localeCompare(b.principal));
}

export interface Compliance {
  listed: number;
  warning: number;
  belumPernah: number;
  aktif: number;
  /** % SKU listed yang order ≤ 30 hari (0–100, dibulatkan). */
  persen: number;
}

/** `saat`: 'sesudah' (default) = memperhitungkan keranjang; 'sebelum' = kondisi sebelum PO. */
export function compliance(list: readonly SkuMSL[], saat: 'sebelum' | 'sesudah' = 'sesudah'): Compliance {
  const listed = list.filter((s) => s.listed);
  const w = (s: SkuMSL) => (saat === 'sebelum' ? s.warningAwal : s.warning);
  const warning = listed.filter(w).length;
  const aktif = listed.length - warning;
  return {
    listed: listed.length,
    warning,
    belumPernah: listed.filter((s) => w(s) === 'BELUM_PERNAH').length,
    aktif,
    persen: listed.length ? Math.round((aktif / listed.length) * 100) : 100,
  };
}

export function labelWarning(w: WarningMSL): string {
  if (w === 'NO_ORDER_30') return `No Order > ${BATAS_HARI} Hari`;
  if (w === 'BELUM_PERNAH') return 'Belum pernah order';
  return '';
}

/** "Terakhir order: 12 Sep 2026 (45 hari lalu)" / "Belum pernah order". */
export function teksTerakhirOrder(s: Pick<SkuMSL, 'lastOrder' | 'hariSejak'>): string {
  if (!s.lastOrder || s.hariSejak === null) return 'Belum pernah order';
  const kapan = s.hariSejak === 0 ? 'hari ini' : `${s.hariSejak} hari lalu`;
  return `Terakhir order: ${formatTanggal(s.lastOrder)} (${kapan})`;
}
