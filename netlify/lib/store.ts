/**
 * Penyimpanan data master hasil upload admin (satu baris per jenis data).
 * - Neon Postgres (gratis) bila env NETLIFY_DATABASE_URL / DATABASE_URL ada.
 * - In-memory bila STORE=memory (dev lokal / test).
 */
import { neon } from '@neondatabase/serverless';

/** Harus sama dengan SEMUA_TIPE di src/lib/parse.ts (dicek di test). */
export const TIPE = ['master', 'rovi', 'pjp', 'produk', 'rules', 'histori', 'msl', 'price'] as const;
export type Tipe = (typeof TIPE)[number];

export interface InfoData {
  version: number;
  updatedAt: string;
  jumlah: number;
}

export interface Store {
  meta(): Promise<Partial<Record<Tipe, InfoData>>>;
  /** Rows dalam bentuk JSON string (tanpa parse ulang), atau null bila belum ada. */
  ambil(tipe: Tipe): Promise<{ json: string; info: InfoData } | null>;
  /** baseVersion: bila diisi dan ≠ versi saat ini → lempar KonflikVersi (0 = belum ada di server). */
  simpan(tipe: Tipe, json: string, jumlah: number, baseVersion?: number): Promise<InfoData>;
  hapus(tipe: Tipe): Promise<void>;
  /** Operasi satu baris (CRUD). Baris dicari berdasarkan isi (`lama`), bukan indeks → aman dipakai bersamaan. */
  ubahBaris(tipe: Tipe, op: OpBaris): Promise<InfoData>;
}

/** CRUD satu baris. `lama` = isi baris persis seperti yang dibaca dari server. */
export type OpBaris = { op: 'tambah'; baru: unknown } | { op: 'ubah'; lama: unknown; baru: unknown } | { op: 'hapus'; lama: unknown };

export class BarisTidakAda extends Error {
  constructor() {
    super('Baris tidak ditemukan — mungkin sudah diubah/dihapus admin lain. Data dimuat ulang.');
  }
}

/** Kesamaan isi baris seperti jsonb (urutan key tidak berpengaruh). */
export function samaIsi(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b as object).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => samaIsi((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

export class KonflikVersi extends Error {
  constructor(readonly versiServer: number) {
    super('Data sudah diubah admin lain. Muat ulang lalu coba lagi.');
  }
}

export function memoryStore(): Store {
  const db = new Map<Tipe, { json: string; info: InfoData }>();
  return {
    async meta() {
      return Object.fromEntries([...db].map(([t, v]) => [t, v.info]));
    },
    async ambil(tipe) {
      return db.get(tipe) ?? null;
    },
    async simpan(tipe, json, jumlah, baseVersion) {
      const kini = db.get(tipe)?.info.version ?? 0;
      if (baseVersion !== undefined && baseVersion !== kini) throw new KonflikVersi(kini);
      const info = { version: kini + 1, updatedAt: new Date().toISOString(), jumlah };
      db.set(tipe, { json, info });
      return info;
    },
    async hapus(tipe) {
      db.delete(tipe);
    },
    async ubahBaris(tipe, op) {
      const ada = db.get(tipe);
      const rows: unknown[] = ada ? JSON.parse(ada.json) : [];
      if (op.op === 'tambah') rows.push(op.baru);
      else {
        const i = rows.findIndex((r) => samaIsi(r, op.lama));
        if (i < 0) throw new BarisTidakAda();
        if (op.op === 'ubah') rows[i] = op.baru;
        else rows.splice(i, 1);
      }
      const info = { version: (ada?.info.version ?? 0) + 1, updatedAt: new Date().toISOString(), jumlah: rows.length };
      db.set(tipe, { json: JSON.stringify(rows), info });
      return info;
    },
  };
}

type Baris = { tipe: Tipe; version: number; updated_at: string | Date; jumlah: number; rows?: string };
const iso = (v: string | Date) => new Date(v).toISOString();

export function neonStore(url: string): Store {
  const sql = neon(url);
  let siap: Promise<unknown> | null = null;
  const init = () =>
    (siap ??= sql`CREATE TABLE IF NOT EXISTS dataset (
      tipe text PRIMARY KEY,
      rows jsonb NOT NULL,
      jumlah integer NOT NULL DEFAULT 0,
      version integer NOT NULL DEFAULT 1,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`.catch((e) => {
      siap = null;
      throw e;
    }));
  return {
    async meta() {
      await init();
      const rows = (await sql`SELECT tipe, version, jumlah, updated_at FROM dataset`) as Baris[];
      return Object.fromEntries(rows.map((r) => [r.tipe, { version: r.version, jumlah: r.jumlah, updatedAt: iso(r.updated_at) }]));
    },
    async ambil(tipe) {
      await init();
      const rows = (await sql`SELECT rows::text AS rows, version, jumlah, updated_at FROM dataset WHERE tipe = ${tipe}`) as Baris[];
      const r = rows[0];
      return r ? { json: r.rows ?? '[]', info: { version: r.version, jumlah: r.jumlah, updatedAt: iso(r.updated_at) } } : null;
    },
    async simpan(tipe, json, jumlah, baseVersion) {
      await init();
      const hasil = (r: Baris[]) => ({ version: r[0].version, jumlah: r[0].jumlah, updatedAt: iso(r[0].updated_at) });
      if (baseVersion === undefined) {
        return hasil((await sql`
          INSERT INTO dataset (tipe, rows, jumlah, version, updated_at)
          VALUES (${tipe}, ${json}::jsonb, ${jumlah}, 1, now())
          ON CONFLICT (tipe) DO UPDATE
            SET rows = EXCLUDED.rows, jumlah = EXCLUDED.jumlah, version = dataset.version + 1, updated_at = now()
          RETURNING version, jumlah, updated_at`) as Baris[]);
      }
      if (baseVersion === 0) {
        const r = (await sql`
          INSERT INTO dataset (tipe, rows, jumlah, version, updated_at)
          VALUES (${tipe}, ${json}::jsonb, ${jumlah}, 1, now())
          ON CONFLICT (tipe) DO NOTHING
          RETURNING version, jumlah, updated_at`) as Baris[];
        if (r.length) return hasil(r);
      } else {
        const r = (await sql`
          UPDATE dataset SET rows = ${json}::jsonb, jumlah = ${jumlah}, version = version + 1, updated_at = now()
          WHERE tipe = ${tipe} AND version = ${baseVersion}
          RETURNING version, jumlah, updated_at`) as Baris[];
        if (r.length) return hasil(r);
      }
      const kini = (await sql`SELECT version FROM dataset WHERE tipe = ${tipe}`) as Baris[];
      throw new KonflikVersi(kini[0]?.version ?? 0);
    },
    async hapus(tipe) {
      await init();
      await sql`DELETE FROM dataset WHERE tipe = ${tipe}`;
    },
    async ubahBaris(tipe, op) {
      await init();
      const hasil = (r: Baris[]) => {
        if (!r.length) throw new BarisTidakAda();
        return { version: r[0].version, jumlah: r[0].jumlah, updatedAt: iso(r[0].updated_at) };
      };
      if (op.op === 'tambah') {
        return hasil((await sql`
          INSERT INTO dataset (tipe, rows, jumlah, version, updated_at)
          VALUES (${tipe}, jsonb_build_array(${JSON.stringify(op.baru)}::jsonb), 1, 1, now())
          ON CONFLICT (tipe) DO UPDATE
            SET rows = dataset.rows || EXCLUDED.rows, jumlah = dataset.jumlah + 1, version = dataset.version + 1, updated_at = now()
          RETURNING version, jumlah, updated_at`) as Baris[]);
      }
      const lama = JSON.stringify(op.lama);
      if (op.op === 'ubah') {
        return hasil((await sql`
          WITH idx AS (
            SELECT (e.o - 1)::int AS i
            FROM dataset d, jsonb_array_elements(d.rows) WITH ORDINALITY AS e(v, o)
            WHERE d.tipe = ${tipe} AND e.v = ${lama}::jsonb
            LIMIT 1
          )
          UPDATE dataset
            SET rows = jsonb_set(rows, ARRAY[(SELECT i FROM idx)::text], ${JSON.stringify(op.baru)}::jsonb),
                version = version + 1, updated_at = now()
          WHERE tipe = ${tipe} AND EXISTS (SELECT 1 FROM idx)
          RETURNING version, jumlah, updated_at`) as Baris[]);
      }
      return hasil((await sql`
        WITH idx AS (
          SELECT (e.o - 1)::int AS i
          FROM dataset d, jsonb_array_elements(d.rows) WITH ORDINALITY AS e(v, o)
          WHERE d.tipe = ${tipe} AND e.v = ${lama}::jsonb
          LIMIT 1
        )
        UPDATE dataset
          SET rows = rows - (SELECT i FROM idx), jumlah = jumlah - 1, version = version + 1, updated_at = now()
        WHERE tipe = ${tipe} AND EXISTS (SELECT 1 FROM idx)
        RETURNING version, jumlah, updated_at`) as Baris[]);
    },
  };
}

let memo: Store | null = null;
/** Store sesuai env, atau null bila DB belum dikonfigurasi. */
export function pilihStore(env: Record<string, string | undefined>): Store | null {
  if (memo) return memo;
  if (env.STORE === 'memory') return (memo = memoryStore());
  const url = env.NETLIFY_DATABASE_URL || env.DATABASE_URL;
  return url ? (memo = neonStore(url)) : null;
}
