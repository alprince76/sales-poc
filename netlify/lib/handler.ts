/**
 * API data master (wajib login; izin per menu — lihat src/lib/akses.ts):
 *   GET    /api/data/meta          versi & jumlah per jenis
 *   GET    /api/data/:tipe         semua baris
 *   PUT    /api/data/:tipe         ganti semua baris (upload Excel / seed). Body = JSON array, boleh gzip (x-body-encoding: gzip).
 *                                  Header opsional x-base-version (0 = hanya bila belum ada) → 409 bila sudah berubah.
 *   PATCH  /api/data/:tipe         CRUD satu baris: { op: 'tambah', baru } | { op: 'ubah', lama, baru } | { op: 'hapus', lama }
 *   DELETE /api/data/:tipe         hapus jenis data (kembali ke dummy)
 */
import { menuMasterUntuk } from '../../src/lib/akses';
import { BELUM_LOGIN, tolak, type Sesi } from './auth';
import { BarisTidakAda, KonflikVersi, TIPE, type OpBaris, type Store, type Tipe } from './store';

const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: HEADERS });
const gagal = (status: number, pesan: string) => json(status, { ok: false, error: pesan });

class BodyRusak extends Error {}

async function bacaBody(req: Request): Promise<string> {
  if (req.headers.get('x-body-encoding') !== 'gzip') return req.text();
  const buf = new Uint8Array(await req.arrayBuffer());
  try {
    return await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  } catch {
    // Ternyata bukan gzip (mis. sudah didekompres proxy) → pakai apa adanya bila teks JSON.
    const teks = new TextDecoder().decode(buf).trim();
    if (teks.startsWith('[') || teks.startsWith('{')) return teks;
    throw new BodyRusak('Body gzip rusak di jalan. Coba upload ulang.');
  }
}

const objek = (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v);
function opValid(b: unknown): b is OpBaris {
  if (!objek(b)) return false;
  const o = b as Record<string, unknown>;
  if (o.op === 'tambah') return objek(o.baru);
  if (o.op === 'ubah') return objek(o.lama) && objek(o.baru);
  if (o.op === 'hapus') return objek(o.lama);
  return false;
}

/** Aksi Master Data untuk operasi baris. */
const AKSI_OP = { tambah: 'tambah', ubah: 'ubah', hapus: 'hapus' } as const;
const channelBaris = (b: unknown): 'GT' | 'MT' | undefined => {
  const c = String((b as { channel?: unknown } | null)?.channel ?? '').trim().toUpperCase();
  return c === 'MT' ? 'MT' : c ? 'GT' : undefined;
};

export async function handle(req: Request, store: Store | null, sesi: Sesi | null): Promise<Response> {
  const path = new URL(req.url).pathname.replace(/\/+$/, '');
  const seg = path.split('/').filter(Boolean); // ['api','data', ...]
  const target = seg[2] ?? 'meta';

  if (!store) return gagal(503, 'Database belum dikonfigurasi (set DATABASE_URL / NETLIFY_DATABASE_URL).');
  // Semua pengguna yang login boleh membaca master data (aplikasi sales butuh); menulis butuh izin.
  if (!sesi) return BELUM_LOGIN();

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

  if (req.method === 'DELETE') {
    const t = tolak(sesi, 'data.upload', 'hapus');
    if (t) return t;
    await store.hapus(tipe);
    await sesi.catat('hapus-semua', `data:${tipe}`);
    return json(200, { ok: true });
  }

  let body: unknown;
  try {
    body = JSON.parse(await bacaBody(req));
  } catch (e) {
    return gagal(400, e instanceof BodyRusak ? e.message : 'Body bukan JSON yang valid');
  }

  if (req.method === 'PATCH') {
    if (!opValid(body)) return gagal(400, "Format operasi salah. Pakai { op: 'tambah'|'ubah'|'hapus', lama?, baru? }");
    const ch = tipe === 'master' ? channelBaris('baru' in body ? body.baru : body.lama) ?? 'GT' : undefined;
    const t = tolak(sesi, menuMasterUntuk(tipe, ch), AKSI_OP[body.op]);
    if (t) return t;
    try {
      const info = await store.ubahBaris(tipe, body);
      await sesi.catat(body.op, `data:${tipe}`, body);
      return json(200, { ok: true, data: info });
    } catch (e) {
      if (e instanceof BarisTidakAda) return gagal(404, e.message);
      throw e;
    }
  }

  if (req.method === 'PUT') {
    const t = tolak(sesi, 'data.upload', 'tambah');
    if (t) return t;
    if (!Array.isArray(body)) return gagal(400, 'Body harus berupa array baris');
    const bv = req.headers.get('x-base-version');
    const base = bv === null || bv === '' ? undefined : Number(bv);
    if (base !== undefined && !Number.isInteger(base)) return gagal(400, 'x-base-version tidak valid');
    try {
      const info = await store.simpan(tipe, JSON.stringify(body), body.length, base);
      await sesi.catat(base === 0 ? 'seed' : 'upload', `data:${tipe}`, { jumlah: body.length, version: info.version });
      return json(200, { ok: true, data: info });
    } catch (e) {
      if (e instanceof KonflikVersi) return json(409, { ok: false, error: e.message, version: e.versiServer });
      throw e;
    }
  }

  return gagal(405, 'Method tidak didukung');
}
