/**
 * API data master: /api/data/meta, /api/data/:tipe (GET publik; PUT/DELETE butuh header x-admin-token).
 * Body PUT = JSON array rows, boleh gzip (header x-body-encoding: gzip).
 * Header opsional x-base-version: versi yang diedit (0 = belum ada) → 409 bila sudah berubah.
 */
import { KonflikVersi, TIPE, type Store, type Tipe } from './store';

const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: HEADERS });
const gagal = (status: number, pesan: string) => json(status, { ok: false, error: pesan });

async function bacaBody(req: Request): Promise<string> {
  if (req.headers.get('x-body-encoding') === 'gzip' && req.body) {
    return new Response(req.body.pipeThrough(new DecompressionStream('gzip'))).text();
  }
  return req.text();
}

export async function handle(req: Request, store: Store | null, adminToken: string | undefined): Promise<Response> {
  const path = new URL(req.url).pathname.replace(/\/+$/, '');
  const seg = path.split('/').filter(Boolean); // ['api','data', ...]
  const target = seg[2] ?? 'meta';

  if (!store) return gagal(503, 'Database belum dikonfigurasi (set NETLIFY_DATABASE_URL / DATABASE_URL).');

  if (target === 'meta') {
    if (req.method !== 'GET') return gagal(405, 'Method tidak didukung');
    return json(200, { ok: true, data: await store.meta() });
  }
  if (!(TIPE as readonly string[]).includes(target)) return gagal(404, `Jenis data tidak dikenal: ${target}`);
  const tipe = target as Tipe;

  if (req.method === 'GET') {
    const d = await store.ambil(tipe);
    if (!d) return gagal(404, 'Belum ada data di server');
    return new Response(d.json, { status: 200, headers: { ...HEADERS, 'x-version': String(d.info.version), 'x-updated-at': d.info.updatedAt } });
  }

  if (req.method === 'PUT' || req.method === 'DELETE') {
    if (!adminToken) return gagal(503, 'ADMIN_TOKEN belum diset di server.');
    if (req.headers.get('x-admin-token') !== adminToken) return gagal(401, 'PIN admin salah');
    if (req.method === 'DELETE') {
      await store.hapus(tipe);
      return json(200, { ok: true });
    }
    let rows: unknown;
    try {
      rows = JSON.parse(await bacaBody(req));
    } catch {
      return gagal(400, 'Body bukan JSON yang valid');
    }
    if (!Array.isArray(rows)) return gagal(400, 'Body harus berupa array baris');
    const bv = req.headers.get('x-base-version');
    const base = bv === null || bv === '' ? undefined : Number(bv);
    if (base !== undefined && !Number.isInteger(base)) return gagal(400, 'x-base-version tidak valid');
    try {
      const info = await store.simpan(tipe, JSON.stringify(rows), rows.length, base);
      return json(200, { ok: true, data: info });
    } catch (e) {
      if (e instanceof KonflikVersi) return json(409, { ok: false, error: e.message, version: e.versiServer });
      throw e;
    }
  }

  return gagal(405, 'Method tidak didukung');
}
