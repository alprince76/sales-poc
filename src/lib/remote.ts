/** Klien API data master (Netlify Function /api/data). Gagal/HTML → dianggap server tidak tersedia. */
import type { TipeData } from './parse';

export interface InfoServer {
  version: number;
  updatedAt: string;
  jumlah: number;
}
export type MetaServer = Partial<Record<TipeData, InfoServer>>;

export class RemoteError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Event global: API mana pun membalas 401 → sesi login habis (AuthProvider mengarahkan ke /login). */
export const EVENT_401 = 'sv:401';
export function laporkan401(status: number) {
  if (status === 401 && typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT_401));
}

const BASE = ((import.meta.env?.VITE_API_BASE as string | undefined) ?? '/api/data').replace(/\/+$/, '');

async function bacaJson<T>(res: Response): Promise<T> {
  const ct = res.headers.get('content-type') ?? '';
  // Tanpa function (vite dev / static) → SPA fallback mengembalikan index.html.
  // Bukan JSON: SPA fallback (200 → server data tidak ada) atau halaman error proxy (413/502/504 → simpan statusnya).
  if (!ct.includes('application/json')) throw new RemoteError('Server data tidak tersedia', res.ok ? 0 : res.status);
  let body: { ok?: boolean; error?: string; data?: unknown };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    throw new RemoteError('Respons server tidak terbaca', res.ok ? 0 : res.status);
  }
  if (!res.ok || body.ok === false) {
    laporkan401(res.status);
    throw new RemoteError(body.error ?? `HTTP ${res.status}`, res.status);
  }
  return (body.data ?? body) as T;
}

export async function ambilMeta(fetcher: typeof fetch = fetch): Promise<MetaServer> {
  let res: Response;
  try {
    res = await fetcher(`${BASE}/meta`, { cache: 'no-store' });
  } catch {
    throw new RemoteError('Server data tidak terjangkau', 0);
  }
  return bacaJson<MetaServer>(res);
}

export async function ambilData<T = unknown>(tipe: TipeData, fetcher: typeof fetch = fetch): Promise<T[]> {
  const res = await fetcher(`${BASE}/${tipe}`, { cache: 'no-store' });
  const rows = await bacaJson<unknown>(res);
  if (!Array.isArray(rows)) throw new RemoteError('Format data server tidak valid', res.status);
  return rows as T[];
}

async function gzip(text: string): Promise<Blob | null> {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
    return await new Response(stream).blob();
  } catch {
    return null;
  }
}

/** Ganti semua baris (upload / seed). baseVersion 0 = hanya bila belum ada di server (409 bila sudah). */
export async function simpanData(tipe: TipeData, rows: unknown[], fetcher: typeof fetch = fetch, baseVersion?: number): Promise<InfoServer> {
  const text = JSON.stringify(rows);
  const kirim = async (zipped: Blob | null) => {
    // Body gzip = biner → wajib content-type biner; kalau 'application/json', proxy Netlify membacanya sebagai teks UTF-8 dan merusaknya.
    const headers: Record<string, string> = { 'content-type': zipped ? 'application/octet-stream' : 'application/json' };
    if (zipped) headers['x-body-encoding'] = 'gzip';
    if (baseVersion !== undefined) headers['x-base-version'] = String(baseVersion);
    let res: Response;
    try {
      res = await fetcher(`${BASE}/${tipe}`, { method: 'PUT', headers, body: zipped ?? text });
    } catch {
      throw new RemoteError('Server data tidak terjangkau', 0);
    }
    return bacaJson<InfoServer>(res);
  };
  const zipped = await gzip(text);
  const sekali = async () => {
    if (!zipped) return kirim(null);
    try {
      return await kirim(zipped);
    } catch (e) {
      // Body gzip ditolak/rusak di jalan → ulangi sekali sebagai JSON polos.
      if (e instanceof RemoteError && e.status === 400) return kirim(null);
      throw e;
    }
  };
  // Gangguan sementara (jaringan putus sesaat, DB baru bangun, timeout) → coba lagi otomatis. PUT aman diulang.
  for (let coba = 0; ; coba++) {
    try {
      return await sekali();
    } catch (e) {
      if (coba >= JEDA_ULANG.length || !(e instanceof RemoteError && SEMENTARA(e.status))) throw e;
      await new Promise((r) => setTimeout(r, JEDA_ULANG[coba]));
    }
  }
}

/** Jeda sebelum percobaan ulang simpan (ms). */
export const JEDA_ULANG = [800, 2500];
const SEMENTARA = (status: number) => status === 0 || status === 500 || status === 502 || status === 504;

/** CRUD satu baris. `lama` = isi baris persis seperti yang dibaca dari server. */
export type OpBaris = { op: 'tambah'; baru: unknown } | { op: 'ubah'; lama: unknown; baru: unknown } | { op: 'hapus'; lama: unknown };

export async function ubahBaris(tipe: TipeData, op: OpBaris, fetcher: typeof fetch = fetch): Promise<InfoServer> {
  let res: Response;
  try {
    res = await fetcher(`${BASE}/${tipe}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(op) });
  } catch {
    throw new RemoteError('Server data tidak terjangkau', 0);
  }
  return bacaJson<InfoServer>(res);
}

export async function hapusData(tipe: TipeData, fetcher: typeof fetch = fetch): Promise<void> {
  const res = await fetcher(`${BASE}/${tipe}`, { method: 'DELETE' });
  await bacaJson(res);
}

/**
 * Bandingkan versi lokal vs server.
 * - unduh: ada di server & versinya beda dari lokal
 * - hilang: dulu dari server, sekarang tidak ada lagi (dihapus admin → kembali ke dummy)
 */
export function bandingVersi(
  lokal: Partial<Record<TipeData, number | null>>,
  sumber: Partial<Record<TipeData, string>>,
  server: MetaServer,
  semua: readonly TipeData[],
): { unduh: TipeData[]; hilang: TipeData[] } {
  const unduh: TipeData[] = [];
  const hilang: TipeData[] = [];
  for (const t of semua) {
    const s = server[t];
    if (s) {
      if (sumber[t] !== 'server' || lokal[t] !== s.version) unduh.push(t);
    } else if (sumber[t] === 'server') hilang.push(t);
  }
  return { unduh, hilang };
}
