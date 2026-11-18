/**
 * Login + RBAC (tanpa vendor): pengguna, peran, sesi cookie, rate limit, audit — di Neon (atau memori untuk dev/test).
 *
 *   POST /api/auth/login          { email, password } | { kode_salesman, pin }
 *   POST /api/auth/logout
 *   GET  /api/auth/me
 *   POST /api/auth/ganti-sandi    { lama, baru }
 *   GET|POST /api/pengguna, PUT|DELETE /api/pengguna/:id, POST /api/pengguna/:id/reset-sandi, POST /api/pengguna/massal
 *   GET|POST /api/peran, PUT|DELETE /api/peran/:id
 *   GET  /api/audit
 */
import { createHash, randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { boleh, ID_SUPER_ADMIN, izinPenuh, normalIzin, peranBawaan, type Aksi, type Izin, type PeranDef } from '../../src/lib/akses';

// ───────────── Tipe ─────────────
export interface Pengguna {
  id: string;
  nama: string;
  email: string | null;
  kode_salesman: string | null;
  peran_id: string;
  /** Kode SR yang boleh dilihat (kosong = semua). Akun sales selalu hanya dirinya. */
  lingkup: string[];
  aktif: boolean;
  wajib_ganti: boolean;
  login_terakhir: string | null;
  /** Password diambil dari env SUPERADMIN_PASSWORD (disinkron tiap server start) sampai diganti/di-reset di aplikasi. */
  sandi_env?: boolean;
}
type PenggunaHash = Pengguna & { hash: string };

export interface Sesi {
  pengguna: Pengguna;
  peran: { id: string; nama: string };
  izin: Izin;
  /** null = semua salesman. */
  lingkup: string[] | null;
  /** Catat ke audit atas nama pengguna ini. */
  catat: (aksi: string, objek: string, detail?: unknown) => Promise<void>;
}

export interface EntriAudit {
  waktu: string;
  pengguna: string;
  aksi: string;
  objek: string;
  detail: unknown;
}

export interface AuthStore {
  siapkan(env: Record<string, string | undefined>): Promise<void>;
  daftarPeran(): Promise<PeranDef[]>;
  simpanPeran(p: PeranDef): Promise<void>;
  hapusPeran(id: string): Promise<void>;
  jumlahPenggunaPeran(id: string): Promise<number>;
  daftarPengguna(): Promise<Pengguna[]>;
  ambilPengguna(id: string): Promise<PenggunaHash | null>;
  cariLogin(by: { email?: string; kode_salesman?: string }): Promise<PenggunaHash | null>;
  simpanPengguna(p: PenggunaHash): Promise<void>;
  hapusPengguna(id: string): Promise<void>;
  buatSesi(tokenHash: string, penggunaId: string, kedaluwarsa: Date, perangkat: string): Promise<void>;
  ambilSesi(tokenHash: string): Promise<{ pengguna_id: string; kedaluwarsa: Date } | null>;
  perpanjangSesi(tokenHash: string, kedaluwarsa: Date): Promise<void>;
  hapusSesi(tokenHash: string): Promise<void>;
  hapusSesiPengguna(penggunaId: string, kecuali?: string): Promise<void>;
  gagalLogin(k: string, tambah: boolean): Promise<number>;
  resetGagal(k: string): Promise<void>;
  audit(e: Omit<EntriAudit, 'waktu'>): Promise<void>;
  daftarAudit(batas: number): Promise<EntriAudit[]>;
}

// ───────────── Kripto ─────────────
const scrypt = (pw: string, salt: Buffer) =>
  new Promise<Buffer>((res, rej) => scryptCb(pw, salt, 32, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? rej(e) : res(k))));

export async function hashSandi(pw: string): Promise<string> {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('base64')}$${(await scrypt(pw, salt)).toString('base64')}`;
}

export async function cocokSandi(pw: string, simpanan: string): Promise<boolean> {
  const [alg, s, h] = simpanan.split('$');
  if (alg !== 'scrypt' || !s || !h) return false;
  const want = Buffer.from(h, 'base64');
  const got = await scrypt(pw, Buffer.from(s, 'base64'));
  return want.length === got.length && timingSafeEqual(want, got);
}

const sha = (t: string) => createHash('sha256').update(t).digest('hex');
export const buatToken = () => randomBytes(32).toString('base64url');
export const pinAcak = () => String(randomInt(0, 1_000_000)).padStart(6, '0');
const uuid = () => randomBytes(16).toString('hex');
const kode = (k: string | null | undefined) => (k ? String(k).trim().toUpperCase() : null);
const email = (e: string | null | undefined) => (e ? String(e).trim().toLowerCase() : null);

export const DURASI_ADMIN = 12 * 3600_000;
export const DURASI_SALES = 30 * 24 * 3600_000;
export const MAKS_GAGAL = 5;
const COOKIE = 'sv_sesi';

// ───────────── Memory store ─────────────
export function memoryAuthStore(): AuthStore {
  const peran = new Map<string, PeranDef>();
  const pengguna = new Map<string, PenggunaHash>();
  const sesi = new Map<string, { pengguna_id: string; kedaluwarsa: Date }>();
  const gagal = new Map<string, { n: number; sampai: number }>();
  const log: EntriAudit[] = [];
  return {
    async siapkan(env) {
      for (const p of peranBawaan()) if (!peran.has(p.id)) peran.set(p.id, p);
      await bootstrap(this, env);
    },
    async daftarPeran() {
      return [...peran.values()];
    },
    async simpanPeran(p) {
      peran.set(p.id, p);
    },
    async hapusPeran(id) {
      peran.delete(id);
    },
    async jumlahPenggunaPeran(id) {
      return [...pengguna.values()].filter((u) => u.peran_id === id).length;
    },
    async daftarPengguna() {
      return [...pengguna.values()].map(tanpaHash);
    },
    async ambilPengguna(id) {
      return pengguna.get(id) ?? null;
    },
    async cariLogin(by) {
      const e = email(by.email);
      const k = kode(by.kode_salesman);
      return [...pengguna.values()].find((u) => (e && u.email === e) || (k && u.kode_salesman === k)) ?? null;
    },
    async simpanPengguna(p) {
      pengguna.set(p.id, p);
    },
    async hapusPengguna(id) {
      pengguna.delete(id);
    },
    async buatSesi(t, id, exp) {
      sesi.set(t, { pengguna_id: id, kedaluwarsa: exp });
    },
    async ambilSesi(t) {
      return sesi.get(t) ?? null;
    },
    async perpanjangSesi(t, exp) {
      const s = sesi.get(t);
      if (s) s.kedaluwarsa = exp;
    },
    async hapusSesi(t) {
      sesi.delete(t);
    },
    async hapusSesiPengguna(id, kecuali) {
      for (const [t, s] of sesi) if (s.pengguna_id === id && t !== kecuali) sesi.delete(t);
    },
    async gagalLogin(k, tambah) {
      const now = Date.now();
      let g = gagal.get(k);
      if (!g || g.sampai < now) g = { n: 0, sampai: now + 15 * 60_000 };
      if (tambah) g.n++;
      gagal.set(k, g);
      return g.n;
    },
    async resetGagal(k) {
      gagal.delete(k);
    },
    async audit(e) {
      log.push({ ...e, waktu: new Date().toISOString() });
    },
    async daftarAudit(n) {
      return log.slice(-n).reverse();
    },
  };
}

const tanpaHash = ({ hash: _h, ...u }: PenggunaHash): Pengguna => {
  void _h;
  return u;
};

// ───────────── Neon store ─────────────
type BarisPengguna = {
  id: string;
  nama: string;
  email: string | null;
  kode_salesman: string | null;
  peran_id: string;
  lingkup: string[] | null;
  aktif: boolean;
  wajib_ganti: boolean;
  login_terakhir: string | Date | null;
  hash: string;
  sandi_env: boolean | null;
};
const keP = (r: BarisPengguna): PenggunaHash => ({
  ...r,
  lingkup: r.lingkup ?? [],
  login_terakhir: r.login_terakhir ? new Date(r.login_terakhir).toISOString() : null,
  sandi_env: !!r.sandi_env,
});

export function neonAuthStore(url: string): AuthStore {
  const sql = neon(url);
  let siap: Promise<unknown> | null = null;
  const init = () =>
    (siap ??= (async () => {
      await sql`CREATE TABLE IF NOT EXISTS peran (id text PRIMARY KEY, nama text NOT NULL, sistem boolean NOT NULL DEFAULT false, izin jsonb NOT NULL DEFAULT '{}'::jsonb)`;
      await sql`CREATE TABLE IF NOT EXISTS pengguna (
        id text PRIMARY KEY,
        nama text NOT NULL,
        email text UNIQUE,
        kode_salesman text UNIQUE,
        hash text NOT NULL,
        peran_id text NOT NULL REFERENCES peran(id),
        lingkup text[] NOT NULL DEFAULT '{}',
        aktif boolean NOT NULL DEFAULT true,
        wajib_ganti boolean NOT NULL DEFAULT true,
        login_terakhir timestamptz,
        dibuat timestamptz NOT NULL DEFAULT now()
      )`;
      await sql`ALTER TABLE pengguna ADD COLUMN IF NOT EXISTS sandi_env boolean NOT NULL DEFAULT false`;
      await sql`CREATE TABLE IF NOT EXISTS sesi (
        token_hash text PRIMARY KEY,
        pengguna_id text NOT NULL REFERENCES pengguna(id) ON DELETE CASCADE,
        kedaluwarsa timestamptz NOT NULL,
        perangkat text,
        dibuat timestamptz NOT NULL DEFAULT now()
      )`;
      await sql`CREATE TABLE IF NOT EXISTS batas_login (k text PRIMARY KEY, n integer NOT NULL, sampai timestamptz NOT NULL)`;
      await sql`CREATE TABLE IF NOT EXISTS audit (id bigserial PRIMARY KEY, waktu timestamptz NOT NULL DEFAULT now(), pengguna text NOT NULL, aksi text NOT NULL, objek text NOT NULL, detail jsonb)`;
    })().catch((e) => {
      siap = null;
      throw e;
    }));
  const P = sql;
  const store: AuthStore = {
    async siapkan(env) {
      await init();
      for (const p of peranBawaan())
        await P`INSERT INTO peran (id, nama, sistem, izin) VALUES (${p.id}, ${p.nama}, ${p.sistem}, ${JSON.stringify(p.izin)}::jsonb) ON CONFLICT (id) DO NOTHING`;
      await bootstrap(store, env);
    },
    async daftarPeran() {
      await init();
      const r = (await P`SELECT id, nama, sistem, izin FROM peran ORDER BY sistem DESC, nama`) as PeranDef[];
      return r;
    },
    async simpanPeran(p) {
      await init();
      await P`INSERT INTO peran (id, nama, sistem, izin) VALUES (${p.id}, ${p.nama}, ${p.sistem}, ${JSON.stringify(p.izin)}::jsonb)
        ON CONFLICT (id) DO UPDATE SET nama = EXCLUDED.nama, izin = EXCLUDED.izin`;
    },
    async hapusPeran(id) {
      await init();
      await P`DELETE FROM peran WHERE id = ${id} AND NOT sistem`;
    },
    async jumlahPenggunaPeran(id) {
      await init();
      const r = (await P`SELECT count(*)::int AS n FROM pengguna WHERE peran_id = ${id}`) as { n: number }[];
      return r[0]?.n ?? 0;
    },
    async daftarPengguna() {
      await init();
      const r = (await P`SELECT * FROM pengguna ORDER BY nama`) as BarisPengguna[];
      return r.map((x) => tanpaHash(keP(x)));
    },
    async ambilPengguna(id) {
      await init();
      const r = (await P`SELECT * FROM pengguna WHERE id = ${id}`) as BarisPengguna[];
      return r[0] ? keP(r[0]) : null;
    },
    async cariLogin(by) {
      await init();
      const e = email(by.email);
      const k = kode(by.kode_salesman);
      const r = (e
        ? await P`SELECT * FROM pengguna WHERE email = ${e}`
        : await P`SELECT * FROM pengguna WHERE kode_salesman = ${k}`) as BarisPengguna[];
      return r[0] ? keP(r[0]) : null;
    },
    async simpanPengguna(p) {
      await init();
      await P`INSERT INTO pengguna (id, nama, email, kode_salesman, hash, peran_id, lingkup, aktif, wajib_ganti, login_terakhir, sandi_env)
        VALUES (${p.id}, ${p.nama}, ${p.email}, ${p.kode_salesman}, ${p.hash}, ${p.peran_id}, ${p.lingkup}, ${p.aktif}, ${p.wajib_ganti}, ${p.login_terakhir}, ${!!p.sandi_env})
        ON CONFLICT (id) DO UPDATE SET nama = EXCLUDED.nama, email = EXCLUDED.email, kode_salesman = EXCLUDED.kode_salesman, hash = EXCLUDED.hash,
          peran_id = EXCLUDED.peran_id, lingkup = EXCLUDED.lingkup, aktif = EXCLUDED.aktif, wajib_ganti = EXCLUDED.wajib_ganti, login_terakhir = EXCLUDED.login_terakhir,
          sandi_env = EXCLUDED.sandi_env`;
    },
    async hapusPengguna(id) {
      await init();
      await P`DELETE FROM pengguna WHERE id = ${id}`;
    },
    async buatSesi(t, id, exp, perangkat) {
      await init();
      await P`INSERT INTO sesi (token_hash, pengguna_id, kedaluwarsa, perangkat) VALUES (${t}, ${id}, ${exp.toISOString()}, ${perangkat.slice(0, 200)})`;
      // Bersihkan sesi kedaluwarsa sesekali.
      if (Math.random() < 0.05) await P`DELETE FROM sesi WHERE kedaluwarsa < now()`;
    },
    async ambilSesi(t) {
      await init();
      const r = (await P`SELECT pengguna_id, kedaluwarsa FROM sesi WHERE token_hash = ${t}`) as { pengguna_id: string; kedaluwarsa: string | Date }[];
      return r[0] ? { pengguna_id: r[0].pengguna_id, kedaluwarsa: new Date(r[0].kedaluwarsa) } : null;
    },
    async perpanjangSesi(t, exp) {
      await P`UPDATE sesi SET kedaluwarsa = ${exp.toISOString()} WHERE token_hash = ${t}`;
    },
    async hapusSesi(t) {
      await init();
      await P`DELETE FROM sesi WHERE token_hash = ${t}`;
    },
    async hapusSesiPengguna(id, kecuali) {
      await init();
      await P`DELETE FROM sesi WHERE pengguna_id = ${id} AND token_hash <> ${kecuali ?? ''}`;
    },
    async gagalLogin(k, tambah) {
      await init();
      const r = (await P`
        INSERT INTO batas_login (k, n, sampai) VALUES (${k}, ${tambah ? 1 : 0}, now() + interval '15 minutes')
        ON CONFLICT (k) DO UPDATE SET
          n = CASE WHEN batas_login.sampai < now() THEN EXCLUDED.n ELSE batas_login.n + EXCLUDED.n END,
          sampai = CASE WHEN batas_login.sampai < now() THEN EXCLUDED.sampai ELSE batas_login.sampai END
        RETURNING n`) as { n: number }[];
      return r[0]?.n ?? 0;
    },
    async resetGagal(k) {
      await P`DELETE FROM batas_login WHERE k = ${k}`;
    },
    async audit(e) {
      await init();
      await P`INSERT INTO audit (pengguna, aksi, objek, detail) VALUES (${e.pengguna}, ${e.aksi}, ${e.objek}, ${JSON.stringify(e.detail ?? null)}::jsonb)`;
    },
    async daftarAudit(n) {
      await init();
      const r = (await P`SELECT waktu, pengguna, aksi, objek, detail FROM audit ORDER BY id DESC LIMIT ${n}`) as (EntriAudit & { waktu: string | Date })[];
      return r.map((x) => ({ ...x, waktu: new Date(x.waktu).toISOString() }));
    },
  };
  return store;
}

/** Buat Super Admin pertama dari env bila belum ada pengguna sama sekali. */
/**
 * Super Admin dari env (SUPERADMIN_EMAIL + SUPERADMIN_PASSWORD), dijalankan tiap server start:
 * - email belum ada → dibuat (password = env, tanpa wajib ganti);
 * - sudah ada & password-nya masih "dari env" (belum pernah diganti/di-reset di aplikasi) → disamakan dengan env,
 *   diaktifkan, dan kunci percobaan login dibuka. Begitu diganti/di-reset di aplikasi, env tidak menimpa lagi.
 */
async function bootstrap(store: AuthStore, env: Record<string, string | undefined>) {
  const e = email(env.SUPERADMIN_EMAIL);
  const pw = env.SUPERADMIN_PASSWORD;
  if (!e || !pw) return;
  const ada = await store.cariLogin({ email: e });
  // Akun lama (sebelum ada penanda sandi_env) yang belum pernah ganti password dianggap masih "dari env".
  const dariEnv = ada && (ada.sandi_env || (ada.peran_id === ID_SUPER_ADMIN && ada.wajib_ganti));
  if (ada && !dariEnv) return;
  if (ada && dariEnv && (await cocokSandi(pw, ada.hash)) && ada.aktif && ada.peran_id === ID_SUPER_ADMIN && !ada.wajib_ganti && ada.sandi_env) {
    await store.resetGagal(`e:${e}`);
    return;
  }
  await store.simpanPengguna({
    id: ada?.id ?? uuid(),
    nama: ada?.nama ?? 'Super Admin',
    email: e,
    kode_salesman: null,
    hash: await hashSandi(pw),
    peran_id: ID_SUPER_ADMIN,
    lingkup: [],
    aktif: true,
    wajib_ganti: false,
    login_terakhir: ada?.login_terakhir ?? null,
    sandi_env: true,
  });
  if (ada) await store.hapusSesiPengguna(ada.id);
  await store.resetGagal(`e:${e}`);
}

let memo: { store: AuthStore; siap: Promise<void> } | null = null;
/** Store auth sesuai env (sudah disiapkan: tabel, peran bawaan, Super Admin awal). */
export async function pilihAuthStore(env: Record<string, string | undefined>): Promise<AuthStore | null> {
  if (!memo) {
    const url = env.NETLIFY_DATABASE_URL || env.DATABASE_URL;
    const store = env.STORE === 'memory' ? memoryAuthStore() : url ? neonAuthStore(url) : null;
    if (!store) return null;
    memo = { store, siap: store.siapkan(env) };
    memo.siap.catch(() => (memo = null));
  }
  await memo.siap;
  return memo.store;
}

// ───────────── Sesi dari request ─────────────
function bacaCookie(req: Request, nama: string): string | null {
  const c = req.headers.get('cookie') ?? '';
  for (const bag of c.split(';')) {
    const [k, ...v] = bag.trim().split('=');
    if (k === nama) return decodeURIComponent(v.join('='));
  }
  return null;
}

function cookieSesi(req: Request, token: string, maxAgeMs: number) {
  const aman = new URL(req.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAgeMs / 1000)}${aman}`;
}

const durasi = (p: Pengguna) => (p.kode_salesman ? DURASI_SALES : DURASI_ADMIN);

async function izinPeran(store: AuthStore, peranId: string): Promise<{ peran: { id: string; nama: string }; izin: Izin }> {
  if (peranId === ID_SUPER_ADMIN) return { peran: { id: ID_SUPER_ADMIN, nama: 'Super Admin' }, izin: izinPenuh() };
  const p = (await store.daftarPeran()).find((x) => x.id === peranId);
  return p ? { peran: { id: p.id, nama: p.nama }, izin: normalIzin(p.izin) } : { peran: { id: peranId, nama: peranId }, izin: {} };
}

export function lingkupEfektif(p: Pengguna): string[] | null {
  if (p.kode_salesman) return [p.kode_salesman];
  return p.lingkup.length ? p.lingkup.map((x) => x.toUpperCase()) : null;
}

async function bentukSesi(store: AuthStore, p: Pengguna): Promise<Sesi> {
  const { peran, izin } = await izinPeran(store, p.peran_id);
  const label = p.email ?? p.kode_salesman ?? p.id;
  return {
    pengguna: p,
    peran,
    izin,
    lingkup: lingkupEfektif(p),
    catat: (aksi, objek, detail) => store.audit({ pengguna: label, aksi, objek, detail }).catch(() => undefined),
  };
}

/** Sesi aktif dari cookie, atau null. Sesi diperpanjang otomatis bila tinggal < separuh umur. */
export async function sesiDari(req: Request, store: AuthStore | null): Promise<Sesi | null> {
  if (!store) return null;
  const token = bacaCookie(req, COOKIE);
  if (!token) return null;
  const th = sha(token);
  const s = await store.ambilSesi(th);
  if (!s || s.kedaluwarsa.getTime() < Date.now()) return null;
  const p = await store.ambilPengguna(s.pengguna_id);
  if (!p || !p.aktif) return null;
  const umur = durasi(p);
  if (s.kedaluwarsa.getTime() - Date.now() < umur / 2) await store.perpanjangSesi(th, new Date(Date.now() + umur)).catch(() => undefined);
  return bentukSesi(store, tanpaHash(p));
}

// ───────────── HTTP ─────────────
const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
export const json = (status: number, body: unknown, extra?: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...HEADERS, ...extra } });
export const gagal = (status: number, pesan: string) => json(status, { ok: false, error: pesan });
export const BELUM_LOGIN = () => gagal(401, 'Sesi berakhir, silakan login lagi.');
export const DITOLAK = () => gagal(403, 'Anda tidak punya akses untuk tindakan ini.');

/** Cek izin; kembalikan Response penolakan atau null bila boleh. */
export function tolak(sesi: Sesi | null, menu: string | string[], aksi: Aksi): Response | null {
  if (!sesi) return BELUM_LOGIN();
  const ok = (Array.isArray(menu) ? menu : [menu]).some((m) => boleh(sesi.izin, m, aksi));
  return ok ? null : DITOLAK();
}

async function body<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

const SALAH_LOGIN = 'Kode/PIN atau email/password salah.';

export function validasiSandi(p: { kode_salesman: string | null }, baru: string): string | null {
  if (p.kode_salesman) return /^\d{6}$/.test(baru) ? null : 'PIN harus 6 angka.';
  return baru.length >= 8 ? null : 'Password minimal 8 karakter.';
}

export function publik(s: Sesi) {
  return { pengguna: s.pengguna, peran: s.peran, izin: s.izin, lingkup: s.lingkup };
}

export async function handleAuth(req: Request, store: AuthStore | null): Promise<Response> {
  if (!store) return gagal(503, 'Database belum dikonfigurasi (set DATABASE_URL / NETLIFY_DATABASE_URL).');
  const url = new URL(req.url);
  const seg = url.pathname.replace(/\/+$/, '').split('/').filter(Boolean); // ['api', 'auth'|'pengguna'|'peran'|'audit', ...]
  const area = seg[1];
  const m = req.method;

  if (area === 'auth' && seg[2] === 'login' && m === 'POST') {
    const b = await body<{ email?: string; password?: string; kode_salesman?: string; pin?: string }>(req);
    const id = b?.email ? `e:${email(b.email)}` : b?.kode_salesman ? `k:${kode(b.kode_salesman)}` : null;
    const sandi = b?.password ?? b?.pin ?? '';
    if (!id || !sandi) return gagal(400, 'Isi kode SR + PIN, atau email + password.');
    if ((await store.gagalLogin(id, false)) >= MAKS_GAGAL) return gagal(429, 'Terlalu banyak percobaan. Coba lagi 15 menit lagi.');
    const p = await store.cariLogin(b?.email ? { email: b.email } : { kode_salesman: b?.kode_salesman });
    const cocok = p ? await cocokSandi(sandi, p.hash) : (await hashSandi(sandi), false); // samakan waktu respons
    if (!p || !cocok || !p.aktif || (b?.email ? !!p.kode_salesman : !p.kode_salesman)) {
      const n = await store.gagalLogin(id, true);
      if (n >= MAKS_GAGAL) return gagal(429, 'Terlalu banyak percobaan. Coba lagi 15 menit lagi.');
      return gagal(401, p && cocok && !p.aktif ? 'Akun dinonaktifkan. Hubungi admin.' : SALAH_LOGIN);
    }
    await store.resetGagal(id);
    const token = buatToken();
    const umur = durasi(p);
    await store.buatSesi(sha(token), p.id, new Date(Date.now() + umur), req.headers.get('user-agent') ?? '');
    const baru = { ...p, login_terakhir: new Date().toISOString() };
    await store.simpanPengguna(baru);
    const s = await bentukSesi(store, tanpaHash(baru));
    await s.catat('login', 'auth');
    return json(200, { ok: true, data: publik(s) }, { 'set-cookie': cookieSesi(req, token, umur) });
  }

  if (area === 'auth' && seg[2] === 'logout' && m === 'POST') {
    const token = bacaCookie(req, COOKIE);
    if (token) await store.hapusSesi(sha(token));
    return json(200, { ok: true }, { 'set-cookie': cookieSesi(req, '', 0) });
  }

  const sesi = await sesiDari(req, store);

  if (area === 'auth' && seg[2] === 'me' && m === 'GET') {
    return sesi ? json(200, { ok: true, data: publik(sesi) }) : BELUM_LOGIN();
  }

  if (area === 'auth' && seg[2] === 'ganti-sandi' && m === 'POST') {
    if (!sesi) return BELUM_LOGIN();
    const b = await body<{ lama?: string; baru?: string }>(req);
    const p = await store.ambilPengguna(sesi.pengguna.id);
    if (!p || !b?.lama || !b.baru || !(await cocokSandi(b.lama, p.hash))) return gagal(400, p?.kode_salesman ? 'PIN lama salah.' : 'Password lama salah.');
    const err = validasiSandi(p, b.baru);
    if (err) return gagal(400, err);
    if (b.baru === b.lama) return gagal(400, p.kode_salesman ? 'PIN baru harus berbeda dari PIN lama.' : 'Password baru harus berbeda.');
    await store.simpanPengguna({ ...p, hash: await hashSandi(b.baru), wajib_ganti: false, sandi_env: false });
    const token = bacaCookie(req, COOKIE);
    await store.hapusSesiPengguna(p.id, token ? sha(token) : undefined);
    await sesi.catat('ganti-sandi', 'auth');
    return json(200, { ok: true, data: publik({ ...sesi, pengguna: { ...sesi.pengguna, wajib_ganti: false } }) });
  }

  // ── Peran ──
  if (area === 'peran') {
    const id = seg[2] ? decodeURIComponent(seg[2]) : null;
    if (m === 'GET') {
      // Form pengguna butuh daftar peran.
      const t = tolak(sesi, ['pengguna.peran', 'pengguna.user'], 'lihat');
      if (t) return t;
      const list = (await store.daftarPeran()).map((p) => (p.id === ID_SUPER_ADMIN ? { ...p, izin: izinPenuh() } : { ...p, izin: normalIzin(p.izin) }));
      return json(200, { ok: true, data: list });
    }
    const b = await body<{ nama?: string; izin?: unknown }>(req);
    if (m === 'POST' && !id) {
      const t = tolak(sesi, 'pengguna.peran', 'tambah');
      if (t) return t;
      const nama = String(b?.nama ?? '').trim();
      if (!nama) return gagal(400, 'Nama peran wajib diisi.');
      const daftar = await store.daftarPeran();
      if (daftar.some((p) => p.nama.toLowerCase() === nama.toLowerCase())) return gagal(400, `Peran "${nama}" sudah ada.`);
      const p: PeranDef = { id: `p_${uuid().slice(0, 10)}`, nama, sistem: false, izin: normalIzin(b?.izin) };
      await store.simpanPeran(p);
      await sesi!.catat('tambah', 'peran', { id: p.id, nama });
      return json(200, { ok: true, data: p });
    }
    if (!id) return gagal(405, 'Method tidak didukung');
    const ada = (await store.daftarPeran()).find((p) => p.id === id);
    if (!ada) return gagal(404, 'Peran tidak ditemukan.');
    if (m === 'PUT') {
      const t = tolak(sesi, 'pengguna.peran', 'ubah');
      if (t) return t;
      if (ada.sistem) return gagal(400, 'Peran Super Admin tidak bisa diubah.');
      const nama = String(b?.nama ?? ada.nama).trim() || ada.nama;
      const p = { ...ada, nama, izin: b?.izin === undefined ? normalIzin(ada.izin) : normalIzin(b.izin) };
      await store.simpanPeran(p);
      await sesi!.catat('ubah', 'peran', { id, nama });
      return json(200, { ok: true, data: p });
    }
    if (m === 'DELETE') {
      const t = tolak(sesi, 'pengguna.peran', 'hapus');
      if (t) return t;
      if (ada.sistem) return gagal(400, 'Peran Super Admin tidak bisa dihapus.');
      const n = await store.jumlahPenggunaPeran(id);
      if (n) return gagal(400, `Peran masih dipakai ${n} pengguna. Pindahkan pengguna ke peran lain dulu.`);
      await store.hapusPeran(id);
      await sesi!.catat('hapus', 'peran', { id, nama: ada.nama });
      return json(200, { ok: true });
    }
    return gagal(405, 'Method tidak didukung');
  }

  // ── Pengguna ──
  if (area === 'pengguna') {
    const id = seg[2] && seg[2] !== 'massal' && seg[2] !== 'reset-massal' ? decodeURIComponent(seg[2]) : null;
    if (m === 'GET' && !id) {
      const t = tolak(sesi, 'pengguna.user', 'lihat');
      return t ?? json(200, { ok: true, data: await store.daftarPengguna() });
    }
    type Input = { nama?: string; email?: string | null; kode_salesman?: string | null; peran_id?: string; lingkup?: string[]; aktif?: boolean; sandi?: string };
    const peranAda = async (pid: string | undefined) => !!pid && (await store.daftarPeran()).some((p) => p.id === pid);
    const bentrok = async (p: { id: string; email: string | null; kode_salesman: string | null }) => {
      const semua = await store.daftarPengguna();
      if (p.email && semua.some((u) => u.id !== p.id && u.email === p.email)) return `Email ${p.email} sudah dipakai.`;
      if (p.kode_salesman && semua.some((u) => u.id !== p.id && u.kode_salesman === p.kode_salesman)) return `Kode SR ${p.kode_salesman} sudah punya akun.`;
      return null;
    };
    const lingkupBersih = (l: unknown) => (Array.isArray(l) ? [...new Set(l.map((x) => String(x).trim().toUpperCase()).filter(Boolean))] : []);

    // Reset PIN banyak akun sales sekaligus (default: semua sales yang belum pernah ganti PIN).
    if (m === 'POST' && seg[2] === 'reset-massal') {
      const t = tolak(sesi, 'pengguna.user', 'ubah');
      if (t) return t;
      const b = await body<{ ids?: string[] }>(req);
      const semua = await store.daftarPengguna();
      const target = semua.filter((u) => u.kode_salesman && (b?.ids?.length ? b.ids.includes(u.id) : u.wajib_ganti));
      const hasil: { kode_salesman: string; nama: string; peran: string; pin: string }[] = [];
      const peranNama = new Map((await store.daftarPeran()).map((p) => [p.id, p.nama]));
      for (const u of target) {
        const ada = await store.ambilPengguna(u.id);
        if (!ada) continue;
        const pin = pinAcak();
        await store.simpanPengguna({ ...ada, hash: await hashSandi(pin), wajib_ganti: true, sandi_env: false });
        await store.hapusSesiPengguna(u.id);
        await store.resetGagal(`k:${u.kode_salesman}`);
        hasil.push({ kode_salesman: u.kode_salesman!, nama: u.nama, peran: peranNama.get(u.peran_id) ?? u.peran_id, pin });
      }
      await sesi!.catat('reset-sandi-massal', 'pengguna', { jumlah: hasil.length });
      return json(200, { ok: true, data: hasil });
    }

    if (m === 'POST' && seg[2] === 'massal') {
      const t = tolak(sesi, 'pengguna.user', 'tambah');
      if (t) return t;
      const b = await body<{ salesmen?: { kode: string; nama: string; channel?: string }[] }>(req);
      const semua = await store.daftarPengguna();
      const punya = new Set(semua.map((u) => u.kode_salesman).filter(Boolean));
      const hasil: { kode_salesman: string; nama: string; peran: string; pin: string }[] = [];
      for (const s of b?.salesmen ?? []) {
        const k = kode(s.kode);
        if (!k || punya.has(k)) continue;
        const peran_id = String(s.channel).toUpperCase() === 'MT' ? 'sales_mt' : 'sales_gt';
        if (!(await peranAda(peran_id))) continue;
        const pin = pinAcak();
        await store.simpanPengguna({ id: uuid(), nama: String(s.nama || k).trim(), email: null, kode_salesman: k, hash: await hashSandi(pin), peran_id, lingkup: [], aktif: true, wajib_ganti: true, login_terakhir: null });
        punya.add(k);
        hasil.push({ kode_salesman: k, nama: String(s.nama || k).trim(), peran: peran_id === 'sales_mt' ? 'Sales MT' : 'Sales GT', pin });
      }
      await sesi!.catat('tambah-massal', 'pengguna', { jumlah: hasil.length });
      return json(200, { ok: true, data: hasil });
    }

    if (m === 'POST' && !id) {
      const t = tolak(sesi, 'pengguna.user', 'tambah');
      if (t) return t;
      const b = await body<Input>(req);
      const p: PenggunaHash = {
        id: uuid(),
        nama: String(b?.nama ?? '').trim(),
        email: email(b?.email),
        kode_salesman: kode(b?.kode_salesman),
        hash: '',
        peran_id: String(b?.peran_id ?? ''),
        lingkup: lingkupBersih(b?.lingkup),
        aktif: b?.aktif !== false,
        wajib_ganti: true,
        login_terakhir: null,
      };
      if (!p.nama) return gagal(400, 'Nama wajib diisi.');
      if (!p.email === !p.kode_salesman) return gagal(400, 'Isi email (akun admin) atau kode SR (akun sales), salah satu.');
      if (p.email && !/^[^\s@]+@[^\s@]+$/.test(p.email)) return gagal(400, 'Format email tidak valid.');
      if (!(await peranAda(p.peran_id))) return gagal(400, 'Pilih peran.');
      if (p.peran_id === ID_SUPER_ADMIN && sesi!.peran.id !== ID_SUPER_ADMIN) return DITOLAK();
      const b2 = await bentrok(p);
      if (b2) return gagal(400, b2);
      const sandi = b?.sandi?.trim() || (p.kode_salesman ? pinAcak() : buatToken().slice(0, 12));
      const err = validasiSandi(p, sandi);
      if (err) return gagal(400, err);
      p.hash = await hashSandi(sandi);
      await store.simpanPengguna(p);
      await sesi!.catat('tambah', 'pengguna', { id: p.id, nama: p.nama, peran: p.peran_id });
      return json(200, { ok: true, data: { pengguna: tanpaHash(p), sandi } });
    }

    if (!id) return gagal(405, 'Method tidak didukung');
    const ada = await store.ambilPengguna(id);
    if (!ada) return gagal(404, 'Pengguna tidak ditemukan.');
    // Hanya Super Admin yang boleh mengubah akun Super Admin.
    if (ada.peran_id === ID_SUPER_ADMIN && sesi?.peran.id !== ID_SUPER_ADMIN && m !== 'GET') return sesi ? DITOLAK() : BELUM_LOGIN();

    if (m === 'PUT') {
      const t = tolak(sesi, 'pengguna.user', 'ubah');
      if (t) return t;
      const b = await body<Input>(req);
      const p: PenggunaHash = {
        ...ada,
        nama: b?.nama !== undefined ? String(b.nama).trim() || ada.nama : ada.nama,
        email: b?.email !== undefined ? email(b.email) : ada.email,
        kode_salesman: b?.kode_salesman !== undefined ? kode(b.kode_salesman) : ada.kode_salesman,
        peran_id: b?.peran_id ?? ada.peran_id,
        lingkup: b?.lingkup !== undefined ? lingkupBersih(b.lingkup) : ada.lingkup,
        aktif: b?.aktif ?? ada.aktif,
      };
      if (!p.email === !p.kode_salesman) return gagal(400, 'Isi email (akun admin) atau kode SR (akun sales), salah satu.');
      if (!(await peranAda(p.peran_id))) return gagal(400, 'Pilih peran.');
      if (p.peran_id === ID_SUPER_ADMIN && sesi!.peran.id !== ID_SUPER_ADMIN) return DITOLAK();
      if (p.id === sesi!.pengguna.id && (!p.aktif || p.peran_id !== ada.peran_id)) return gagal(400, 'Tidak bisa menonaktifkan atau mengganti peran akun sendiri.');
      const b2 = await bentrok(p);
      if (b2) return gagal(400, b2);
      await store.simpanPengguna(p);
      if (!p.aktif || p.peran_id !== ada.peran_id) await store.hapusSesiPengguna(p.id);
      await sesi!.catat('ubah', 'pengguna', { id, nama: p.nama, aktif: p.aktif, peran: p.peran_id });
      return json(200, { ok: true, data: tanpaHash(p) });
    }
    if (m === 'POST' && seg[3] === 'reset-sandi') {
      const t = tolak(sesi, 'pengguna.user', 'ubah');
      if (t) return t;
      const sandi = ada.kode_salesman ? pinAcak() : buatToken().slice(0, 12);
      await store.simpanPengguna({ ...ada, hash: await hashSandi(sandi), wajib_ganti: true, sandi_env: false });
      await store.hapusSesiPengguna(id);
      await store.resetGagal(ada.email ? `e:${ada.email}` : `k:${ada.kode_salesman}`);
      await sesi!.catat('reset-sandi', 'pengguna', { id, nama: ada.nama });
      return json(200, { ok: true, data: { sandi } });
    }
    if (m === 'DELETE') {
      const t = tolak(sesi, 'pengguna.user', 'hapus');
      if (t) return t;
      if (id === sesi!.pengguna.id) return gagal(400, 'Tidak bisa menghapus akun sendiri.');
      if (ada.peran_id === ID_SUPER_ADMIN && (await store.daftarPengguna()).filter((u) => u.peran_id === ID_SUPER_ADMIN && u.aktif).length <= 1)
        return gagal(400, 'Minimal harus ada satu Super Admin aktif.');
      await store.hapusSesiPengguna(id);
      await store.hapusPengguna(id);
      await sesi!.catat('hapus', 'pengguna', { id, nama: ada.nama });
      return json(200, { ok: true });
    }
    return gagal(405, 'Method tidak didukung');
  }

  if (area === 'audit' && m === 'GET') {
    const t = tolak(sesi, 'pengguna.user', 'lihat');
    return t ?? json(200, { ok: true, data: await store.daftarAudit(200) });
  }

  return gagal(404, 'Tidak ditemukan');
}

/** Sesi buatan untuk test (default: Super Admin, semua salesman). */
export function sesiUji(o: { peran?: string; izin?: Izin; lingkup?: string[] | null; kode_salesman?: string | null } = {}): Sesi {
  const peran = o.peran ?? ID_SUPER_ADMIN;
  return {
    pengguna: { id: 'uji', nama: 'Uji', email: o.kode_salesman ? null : 'uji@x', kode_salesman: o.kode_salesman ?? null, peran_id: peran, lingkup: o.lingkup ?? [], aktif: true, wajib_ganti: false, login_terakhir: null },
    peran: { id: peran, nama: peran },
    izin: o.izin ?? izinPenuh(),
    lingkup: o.kode_salesman ? [o.kode_salesman] : (o.lingkup ?? null),
    catat: async () => undefined,
  };
}
