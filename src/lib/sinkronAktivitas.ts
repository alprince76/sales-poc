/**
 * Sinkron aktivitas lapangan antar perangkat (pure + klien API).
 * Perangkat menyimpan perubahan di "kotak keluar" (outbox) lalu mengirimnya ke server; perangkat lain menarik delta via seq.
 * Offline-first: aktivitas tetap tercatat di HP saat tanpa sinyal dan terkirim begitu online.
 */
import { normKode } from './billing';
import { laporkan401, RemoteError } from './remote';
import type { Aktivitas, CekStok, Penagihan, PurchaseOrder, Retur, StatusKunjungan } from './types';

export type JenisAkt = keyof Aktivitas;
export const JENIS_AKT: JenisAkt[] = ['penagihan', 'stok', 'po', 'kunjungan', 'retur'];

type ItemDari<J extends JenisAkt> = Aktivitas[J][number];

export interface ItemKirim {
  jenis: JenisAkt;
  id: string;
  data: unknown;
  /** Waktu masuk outbox (ms) — untuk menghapus entri yang sudah terkirim tanpa menghapus revisi yang lebih baru. */
  t: number;
}

/** Kunci unik item: id untuk PO/penagihan; (SR, toko, tanggal) untuk cek stok & status kunjungan (satu per hari). */
export function kunciAkt<J extends JenisAkt>(jenis: J, x: ItemDari<J>): string {
  if (jenis === 'stok' || jenis === 'kunjungan') {
    const k = x as CekStok | StatusKunjungan;
    return `${normKode(k.kode_salesman)}|${normKode(k.kode_toko)}|${k.tanggal}`;
  }
  return (x as Penagihan | PurchaseOrder | Retur).id;
}

/** Item baru/berubah dari `lama` → `baru` (dibandingkan per kunci; objek sama = tidak berubah). */
/** Penanda hapus: dikirim seperti item biasa supaya perangkat lain ikut menghapus. */
export interface TandaHapus {
  _hapus: true;
  kode_salesman: string;
}
export const isTandaHapus = (d: unknown): d is TandaHapus => typeof d === 'object' && d !== null && (d as { _hapus?: unknown })._hapus === true;

export function bedaAkt(lama: Aktivitas, baru: Aktivitas, t = Date.now()): ItemKirim[] {
  const out: ItemKirim[] = [];
  for (const j of JENIS_AKT) {
    if (lama[j] === baru[j]) continue;
    const sebelum = new Map(((lama[j] ?? []) as ItemDari<typeof j>[]).map((x) => [kunciAkt(j, x), x]));
    const ada = new Set<string>();
    for (const x of (baru[j] ?? []) as ItemDari<typeof j>[]) {
      const k = kunciAkt(j, x);
      ada.add(k);
      const s = sebelum.get(k);
      if (s !== x && JSON.stringify(s) !== JSON.stringify(x)) out.push({ jenis: j, id: k, data: x, t });
    }
    // Item yang dihapus → kirim tanda hapus (kode_salesman untuk cek lingkup di server).
    for (const [k, x] of sebelum)
      if (!ada.has(k)) out.push({ jenis: j, id: k, data: { _hapus: true, kode_salesman: (x as { kode_salesman: string }).kode_salesman } satisfies TandaHapus, t });
  }
  return out;
}

/** Semua item (untuk mengirim aktivitas yang tercatat sebelum sinkron ada). */
export function semuaItem(a: Aktivitas, t = Date.now()): ItemKirim[] {
  return JENIS_AKT.flatMap((j) => (a[j] as ItemDari<typeof j>[]).map((x) => ({ jenis: j, id: kunciAkt(j, x), data: x, t })));
}

/** Tambah ke outbox; entri lama dengan kunci sama diganti (yang dikirim cukup versi terakhir). */
export function tambahOutbox(outbox: ItemKirim[], baru: ItemKirim[]): ItemKirim[] {
  if (!baru.length) return outbox;
  const ganti = new Set(baru.map((x) => `${x.jenis}|${x.id}`));
  return [...outbox.filter((x) => !ganti.has(`${x.jenis}|${x.id}`)), ...baru];
}

/** Buang entri yang sudah terkirim (kunci & t sama); revisi yang masuk setelah dikirim tetap tinggal. */
export function buangTerkirim(outbox: ItemKirim[], terkirim: ItemKirim[]): ItemKirim[] {
  const s = new Set(terkirim.map((x) => `${x.jenis}|${x.id}|${x.t}`));
  return outbox.filter((x) => !s.has(`${x.jenis}|${x.id}|${x.t}`));
}

/**
 * Gabungkan item dari server ke aktivitas lokal (upsert per kunci).
 * Kunci yang masih menunggu di outbox tidak ditimpa — versi di HP ini lebih baru.
 * Mengembalikan objek yang sama bila tidak ada perubahan (hindari render ulang).
 */
export function gabungServer(lokal: Aktivitas, items: { jenis: string; id: string; data: unknown }[], tertunda: ItemKirim[]): Aktivitas {
  if (!items.length) return lokal;
  const tahan = new Set(tertunda.map((x) => `${x.jenis}|${x.id}`));
  const per = new Map<JenisAkt, Map<string, unknown>>();
  for (const it of items) {
    if (!(JENIS_AKT as string[]).includes(it.jenis) || tahan.has(`${it.jenis}|${it.id}`)) continue;
    const j = it.jenis as JenisAkt;
    if (!per.has(j)) per.set(j, new Map());
    per.get(j)!.set(it.id, it.data);
  }
  if (!per.size) return lokal;
  const out = { ...lokal };
  let berubah = false;
  for (const [j, masuk] of per) {
    const list = (lokal[j] ?? []) as ItemDari<typeof j>[];
    const sisa = new Map(masuk);
    let jBerubah = false;
    const next: ItemDari<typeof j>[] = [];
    for (const x of list) {
      const k = kunciAkt(j, x);
      if (!sisa.has(k)) {
        next.push(x);
        continue;
      }
      const d = sisa.get(k);
      sisa.delete(k);
      if (isTandaHapus(d)) {
        jBerubah = true; // dihapus di perangkat lain
        continue;
      }
      if (JSON.stringify(d) === JSON.stringify(x)) next.push(x);
      else {
        jBerubah = true;
        next.push(d as ItemDari<typeof j>);
      }
    }
    const tambahan = [...sisa.values()].filter((d) => !isTandaHapus(d)) as ItemDari<typeof j>[];
    if (tambahan.length) {
      jBerubah = true;
      next.push(...tambahan);
    }
    if (jBerubah) {
      berubah = true;
      // Urut waktu dibuat supaya daftar konsisten di semua perangkat.
      if (j === 'po' || j === 'penagihan' || j === 'stok' || j === 'retur')
        (next as { createdAt?: string }[]).sort((a, b) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')));
      (out as Record<JenisAkt, unknown[]>)[j] = next;
    }
  }
  return berubah ? out : lokal;
}

/**
 * Nomor PO unik lintas perangkat tanpa menunggu server: PO/2026/11/<kode SR>-0001.
 * Satu SR biasanya memakai satu HP, jadi urutan per SR per bulan tidak bentrok.
 */
export function nomorPO(semua: PurchaseOrder[], kodeSalesman: string, tanggal: string): string {
  const [y, m] = tanggal.split('-');
  const prefix = `PO/${y}/${m}/${normKode(kodeSalesman)}-`;
  const maks = semua.reduce((n, p) => (p.no_po.startsWith(prefix) ? Math.max(n, Number(p.no_po.slice(prefix.length)) || 0) : n), 0);
  return `${prefix}${String(maks + 1).padStart(4, '0')}`;
}

// ── Klien API /api/aktivitas ──
const BASE = ((import.meta.env?.VITE_API_AKT as string | undefined) ?? '/api/aktivitas').replace(/\/+$/, '');

async function baca<T>(res: Response): Promise<T> {
  if (!(res.headers.get('content-type') ?? '').includes('application/json')) throw new RemoteError('Server data tidak tersedia', res.ok ? 0 : res.status);
  const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; data?: T } | null;
  if (!body || !res.ok || body.ok === false) {
    laporkan401(res.status);
    throw new RemoteError(body?.error ?? `HTTP ${res.status}`, res.status);
  }
  return body.data as T;
}

export interface HasilTarik {
  items: { jenis: string; id: string; data: unknown; seq: number }[];
  seq: number;
  reset: number;
  lanjut: boolean;
}

export async function tarikAkt(sejak: number, fetcher: typeof fetch = fetch): Promise<HasilTarik> {
  let res: Response;
  try {
    res = await fetcher(`${BASE}?sejak=${Math.max(0, Math.floor(sejak))}`, { cache: 'no-store' });
  } catch {
    throw new RemoteError('Server data tidak terjangkau', 0);
  }
  return baca<HasilTarik>(res);
}

export async function kirimAkt(items: ItemKirim[], fetcher: typeof fetch = fetch): Promise<{ seq: number }> {
  let res: Response;
  try {
    res = await fetcher(BASE, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items: items.map(({ jenis, id, data }) => ({ jenis, id, data })) }),
    });
  } catch {
    throw new RemoteError('Server data tidak terjangkau', 0);
  }
  return baca<{ seq: number }>(res);
}

export async function resetAktServer(fetcher: typeof fetch = fetch): Promise<{ reset: number }> {
  let res: Response;
  try {
    res = await fetcher(BASE, { method: 'DELETE' });
  } catch {
    throw new RemoteError('Server data tidak terjangkau', 0);
  }
  return baca<{ reset: number }>(res);
}

/** Tarik ulang sedikit ke belakang: tulis yang selesai tidak berurutan (seq kecil commit belakangan) tetap terambil. */
export const TUMPANG_SEQ = 200;

/** Buang aktivitas yang dibuat sebelum `batasMs` (reset admin). batasMs 0 = tidak ada reset. */
export function saringSetelah(a: Aktivitas, batasMs: number): Aktivitas {
  if (!batasMs) return a;
  const lolos = (w: string | undefined) => !w || Date.parse(w) > batasMs;
  return {
    penagihan: a.penagihan.filter((x) => lolos(x.createdAt)),
    stok: a.stok.filter((x) => lolos(x.createdAt)),
    po: a.po.filter((x) => lolos(x.createdAt)),
    kunjungan: a.kunjungan.filter((x) => lolos(x.selesaiAt ?? `${x.tanggal}T23:59:59+07:00`)),
    retur: (a.retur ?? []).filter((x) => lolos(x.createdAt)),
  };
}
