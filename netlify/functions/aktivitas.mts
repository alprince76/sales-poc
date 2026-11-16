/**
 * Netlify Function (v2): sinkron aktivitas lapangan (PO, penagihan, cek stok, kunjungan) antar perangkat.
 * Env: DATABASE_URL atau NETLIFY_DATABASE_URL (Neon Postgres).
 */
import { handleAktivitas, pilihAktStore } from '../lib/aktivitas';
import { pilihAuthStore, sesiDari } from '../lib/auth';

export default async (req: Request): Promise<Response> => {
  try {
    return await handleAktivitas(req, pilihAktStore(process.env), await sesiDari(req, await pilihAuthStore(process.env)));
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
};

export const config = { path: '/api/aktivitas' };
