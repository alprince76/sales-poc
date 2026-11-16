/**
 * Aktivitas lapangan (PO, penagihan, cek stok, status kunjungan) — satu baris per item, disinkron ke semua perangkat.
 *
 *   GET    /api/aktivitas?sejak=N   item dengan seq > N (delta), + seq terbaru & id reset
 *   POST   /api/aktivitas           { items: [{ jenis, id, data }] } → upsert (id sama = timpa)
 *   DELETE /api/aktivitas           hapus semua aktivitas (Reset aktivitas di admin)
 *
 * `seq` naik setiap item ditulis, jadi perangkat cukup menarik yang berubah sejak terakhir.
 */
import { neon } from '@neondatabase/serverless';
import { BELUM_LOGIN, DITOLAK, tolak, type Sesi } from './auth';

export const JENIS_AKT = ['penagihan', 'stok', 'po', 'kunjungan', 'retur'] as const;
export type JenisAkt = (typeof JENIS_AKT)[number];

export interface ItemAkt {
  jenis: JenisAkt;
  id: string;
  data: unknown;
}
export interface ItemAktServer extends ItemAkt {
  seq: number;
}
export interface HasilTarik {
  items: ItemAktServer[];
  /** seq terbesar di server (bukan hanya di halaman ini). */
  seq: number;
  /** Id reset terakhir (0 = belum pernah). Berubah → perangkat harus membuang aktivitas lamanya. */
  reset: number;
  /** Masih ada item setelah halaman ini. */
  lanjut: boolean;
}

export interface AktStore {
  /** lingkup: kode SR yang boleh (null = semua). */
  tarik(sejak: number, batas: number, lingkup?: string[] | null): Promise<HasilTarik>;
  kirim(items: ItemAkt[]): Promise<{ seq: number }>;
  reset(): Promise<{ reset: number }>;
}

export const BATAS_TARIK = 5000;

const kodeSR = (data: unknown) => String((data as { kode_salesman?: unknown } | null)?.kode_salesman ?? '').trim().toUpperCase();
export const dalamLingkup = (data: unknown, lingkup?: string[] | null) => !lingkup || lingkup.includes(kodeSR(data));

/** Item terakhir per (jenis, id) — satu batch tidak boleh menulis kunci yang sama dua kali. */
function unik(items: ItemAkt[]): ItemAkt[] {
  const m = new Map<string, ItemAkt>();
  for (const it of items) m.set(`${it.jenis}\u0000${it.id}`, it);
  return [...m.values()];
}

export function memoryAktStore(): AktStore {
  const db = new Map<string, ItemAktServer>();
  let seq = 0;
  let resetId = 0;
  return {
    async tarik(sejak, batas, lingkup) {
      const semua = [...db.values()].filter((x) => x.seq > sejak && dalamLingkup(x.data, lingkup)).sort((a, b) => a.seq - b.seq);
      return { items: semua.slice(0, batas), seq, reset: resetId, lanjut: semua.length > batas };
    },
    async kirim(items) {
      for (const it of unik(items)) db.set(`${it.jenis}\u0000${it.id}`, { ...it, seq: ++seq });
      return { seq };
    },
    async reset() {
      db.clear();
      resetId = Math.max(Date.now(), resetId + 1);
      return { reset: resetId };
    },
  };
}

type BarisAkt = { jenis: JenisAkt; id: string; data: string; seq: string | number };

export function neonAktStore(url: string): AktStore {
  const sql = neon(url);
  let siap: Promise<unknown> | null = null;
  const init = () =>
    (siap ??= (async () => {
      await sql`CREATE SEQUENCE IF NOT EXISTS aktivitas_seq`;
      await sql`CREATE TABLE IF NOT EXISTS aktivitas (
        jenis text NOT NULL,
        id text NOT NULL,
        data jsonb NOT NULL,
        seq bigint NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (jenis, id)
      )`;
      await sql`CREATE INDEX IF NOT EXISTS aktivitas_seq_idx ON aktivitas (seq)`;
      await sql`CREATE TABLE IF NOT EXISTS aktivitas_info (k text PRIMARY KEY, v bigint NOT NULL)`;
    })().catch((e) => {
      siap = null;
      throw e;
    }));
  const angka = (v: unknown) => Number(v ?? 0);
  return {
    async tarik(sejak, batas, lingkup) {
      await init();
      const rows = (await (lingkup
        ? sql`SELECT jenis, id, data::text AS data, seq FROM aktivitas
            WHERE seq > ${sejak} AND upper(data->>'kode_salesman') = ANY(${lingkup}::text[]) ORDER BY seq LIMIT ${batas + 1}`
        : sql`SELECT jenis, id, data::text AS data, seq FROM aktivitas
            WHERE seq > ${sejak} ORDER BY seq LIMIT ${batas + 1}`)) as BarisAkt[];
      const [info] = (await sql`
        SELECT (SELECT COALESCE(MAX(seq), 0) FROM aktivitas) AS seq,
               (SELECT COALESCE(MAX(v), 0) FROM aktivitas_info WHERE k = 'reset') AS reset`) as { seq: string; reset: string }[];
      return {
        items: rows.slice(0, batas).map((r) => ({ jenis: r.jenis, id: r.id, data: JSON.parse(r.data), seq: angka(r.seq) })),
        seq: angka(info?.seq),
        reset: angka(info?.reset),
        lanjut: rows.length > batas,
      };
    },
    async kirim(items) {
      await init();
      const u = unik(items);
      if (!u.length) return { seq: 0 };
      const r = (await sql`
        INSERT INTO aktivitas (jenis, id, data, seq, updated_at)
        SELECT x.jenis, x.id, x.data, nextval('aktivitas_seq'), now()
        FROM jsonb_to_recordset(${JSON.stringify(u)}::jsonb) AS x(jenis text, id text, data jsonb)
        ON CONFLICT (jenis, id) DO UPDATE SET data = EXCLUDED.data, seq = EXCLUDED.seq, updated_at = now()
        RETURNING seq`) as { seq: string }[];
      return { seq: Math.max(0, ...r.map((x) => angka(x.seq))) };
    },
    async reset() {
      await init();
      const id = Date.now();
      await sql`DELETE FROM aktivitas`;
      const r = (await sql`
        INSERT INTO aktivitas_info (k, v) VALUES ('reset', ${id})
        ON CONFLICT (k) DO UPDATE SET v = GREATEST(${id}, aktivitas_info.v + 1)
        RETURNING v`) as { v: string }[];
      return { reset: angka(r[0]?.v) };
    },
  };
}

let memo: AktStore | null = null;
export function pilihAktStore(env: Record<string, string | undefined>): AktStore | null {
  if (memo) return memo;
  if (env.STORE === 'memory') return (memo = memoryAktStore());
  const url = env.NETLIFY_DATABASE_URL || env.DATABASE_URL;
  return url ? (memo = neonAktStore(url)) : null;
}

const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: HEADERS });
const gagal = (status: number, pesan: string) => json(status, { ok: false, error: pesan });

function itemValid(x: unknown): x is ItemAkt {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  return (JENIS_AKT as readonly string[]).includes(o.jenis as string) && typeof o.id === 'string' && o.id.length > 0 && o.id.length <= 200 && typeof o.data === 'object' && o.data !== null;
}

export async function handleAktivitas(req: Request, store: AktStore | null, sesi: Sesi | null): Promise<Response> {
  if (!store) return gagal(503, 'Database belum dikonfigurasi (set DATABASE_URL / NETLIFY_DATABASE_URL).');
  if (!sesi) return BELUM_LOGIN();
  if (req.method === 'GET') {
    const s = Number(new URL(req.url).searchParams.get('sejak') ?? 0);
    return json(200, { ok: true, data: await store.tarik(Number.isFinite(s) && s > 0 ? Math.floor(s) : 0, BATAS_TARIK, sesi.lingkup) });
  }
  if (req.method === 'DELETE') {
    const t = tolak(sesi, 'data.upload', 'hapus');
    if (t) return t;
    const r = await store.reset();
    await sesi.catat('reset', 'aktivitas');
    return json(200, { ok: true, data: r });
  }
  if (req.method === 'POST') {
    let body: unknown;
    try {
      body = JSON.parse(await req.text());
    } catch {
      return gagal(400, 'Body bukan JSON yang valid');
    }
    const items = (body as { items?: unknown })?.items;
    if (!Array.isArray(items) || !items.every(itemValid)) return gagal(400, 'Format item aktivitas salah');
    if (items.length > 2000) return gagal(413, 'Terlalu banyak item sekaligus');
    const t = tolak(sesi, ['app.gt', 'app.mt'], 'tambah');
    if (t) return t;
    // Hanya boleh menulis aktivitas atas nama SR dalam lingkupnya (akun sales: dirinya sendiri).
    if (!items.every((x) => dalamLingkup(x.data, sesi.lingkup))) return DITOLAK();
    return json(200, { ok: true, data: await store.kirim(items) });
  }
  return gagal(405, 'Method tidak didukung');
}
