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

const BASE = ((import.meta.env?.VITE_API_BASE as string | undefined) ?? '/api/data').replace(/\/+$/, '');

async function bacaJson<T>(res: Response): Promise<T> {
  const ct = res.headers.get('content-type') ?? '';
  // Tanpa function (vite dev / static) → SPA fallback mengembalikan index.html.
  if (!ct.includes('application/json')) throw new RemoteError('Server data tidak tersedia', 0);
  const body = (await res.json()) as { ok?: boolean; error?: string; data?: unknown };
  if (!res.ok || body.ok === false) throw new RemoteError(body.error ?? `HTTP ${res.status}`, res.status);
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

/** baseVersion: versi yang sedang diedit (0 = belum ada di server) → RemoteError 409 bila sudah berubah. */
export async function simpanData(tipe: TipeData, rows: unknown[], token: string, fetcher: typeof fetch = fetch, baseVersion?: number): Promise<InfoServer> {
  const text = JSON.stringify(rows);
  const zipped = await gzip(text);
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-admin-token': token };
  if (zipped) headers['x-body-encoding'] = 'gzip';
  if (baseVersion !== undefined) headers['x-base-version'] = String(baseVersion);
  let res: Response;
  try {
    res = await fetcher(`${BASE}/${tipe}`, { method: 'PUT', headers, body: zipped ?? text });
  } catch {
    throw new RemoteError('Server data tidak terjangkau', 0);
  }
  return bacaJson<InfoServer>(res);
}

export async function hapusData(tipe: TipeData, token: string, fetcher: typeof fetch = fetch): Promise<void> {
  const res = await fetcher(`${BASE}/${tipe}`, { method: 'DELETE', headers: { 'x-admin-token': token } });
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

const KEY_TOKEN = 'svdi-admin-token';
/** PIN admin dari sesi, atau minta lewat prompt (paksa = PIN tersimpan ditolak server). Kosong = batal. */
export function mintaToken(paksa = false): string {
  const ada = tokenAdmin();
  if (ada && !paksa) return ada;
  const t = window.prompt(paksa ? 'PIN admin salah. Masukkan PIN admin:' : 'Masukkan PIN admin untuk menyimpan ke server:')?.trim() ?? '';
  setTokenAdmin(t);
  return t;
}
export function tokenAdmin(): string {
  try {
    return sessionStorage.getItem(KEY_TOKEN) ?? '';
  } catch {
    return '';
  }
}
export function setTokenAdmin(t: string) {
  try {
    if (t) sessionStorage.setItem(KEY_TOKEN, t);
    else sessionStorage.removeItem(KEY_TOKEN);
  } catch {
    /* abaikan */
  }
}
