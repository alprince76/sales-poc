/**
 * Seed data master ke server (Neon Postgres) dari docs/Dummy_ROVI_PJP.xlsx (data asli MD + SKU NEFOKAM).
 *
 *   npm run seed                                  # langsung ke DB (DATABASE_URL / NETLIFY_DATABASE_URL, boleh dari .env)
 *   npm run seed -- --api=https://xxx.netlify.app --token=PIN   # lewat API site yang sudah deploy
 * Opsi: --only=rules,produk  --force (timpa yang sudah ada)  --file=path.xlsx
 * Default: hanya mengisi jenis yang BELUM ada di server (data upload admin tidak tertimpa).
 */
import { existsSync, readFileSync } from 'node:fs';
import { pilihTipeSeed } from '../netlify/lib/seed';
import { neonStore, type Tipe } from '../netlify/lib/store';
import { bacaDataSet, bacaWorkbook } from '../src/lib/parse';
import type { DataSet } from '../src/lib/types';

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=');
const flag = (k: string) => process.argv.includes(`--${k}`);

// .env sederhana (KEY=VALUE) bila ada.
if (existsSync('.env')) {
  for (const l of readFileSync('.env', 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

async function main() {
  const file = arg('file') ?? 'docs/Dummy_ROVI_PJP.xlsx';
  const p = bacaDataSet(bacaWorkbook(new Uint8Array(readFileSync(file))));
  const data = Object.fromEntries(Object.entries(p).map(([t, h]) => [t, h.valid])) as unknown as DataSet;

  const api = arg('api')?.replace(/\/+$/, '');
  const token = arg('token') ?? process.env.ADMIN_TOKEN ?? '';
  let ada: string[];
  let simpan: (t: Tipe, rows: unknown[]) => Promise<{ version: number }>;

  if (api) {
    if (!token) throw new Error('Mode --api butuh --token=PIN (atau env ADMIN_TOKEN).');
    const meta = await fetch(`${api}/api/data/meta`);
    const body = (await meta.json().catch(() => null)) as { ok?: boolean; data?: Record<string, unknown>; error?: string } | null;
    if (!meta.ok || !body?.ok) throw new Error(`API meta gagal (${meta.status}): ${body?.error ?? 'bukan JSON — cek URL & deploy function'}`);
    ada = Object.keys(body.data ?? {});
    simpan = async (t, rows) => {
      const r = await fetch(`${api}/api/data/${t}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-admin-token': token, ...(flag('force') ? {} : { 'x-base-version': '0' }) },
        body: JSON.stringify(rows),
      });
      const b = (await r.json().catch(() => ({}))) as { ok?: boolean; data?: { version: number }; error?: string };
      if (!r.ok || !b.ok) throw new Error(`${r.status} ${b.error ?? ''}`);
      return b.data!;
    };
  } else {
    const url = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error('Set DATABASE_URL (connection string Neon) di env / .env, atau pakai --api=… --token=…');
    const store = neonStore(url);
    ada = Object.keys(await store.meta());
    simpan = (t, rows) => store.simpan(t, JSON.stringify(rows), rows.length, flag('force') ? undefined : 0);
  }

  const { isi, lewati, tidakDikenal } = pilihTipeSeed(ada, { only: arg('only')?.split(','), force: flag('force') });
  if (tidakDikenal.length) throw new Error(`Jenis tidak dikenal: ${tidakDikenal.join(', ')}`);
  console.log(`Sumber: ${file}${api ? ` → ${api}` : ' → Neon (DATABASE_URL)'}`);
  for (const t of lewati) console.log(`  - ${t.padEnd(8)} dilewati (sudah ada di server; pakai --force untuk menimpa)`);
  for (const t of isi) {
    const rows = data[t] as unknown[];
    const info = await simpan(t, rows);
    console.log(`  ✓ ${t.padEnd(8)} ${rows.length.toLocaleString('id-ID').padStart(7)} baris → v${info.version}`);
  }
  console.log(isi.length ? 'Seed selesai.' : 'Tidak ada yang perlu di-seed.');
}

main().catch((e) => {
  console.error(`Seed gagal: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
