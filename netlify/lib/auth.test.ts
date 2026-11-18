/** v14: login, sesi, RBAC per menu × aksi, lingkup salesman. */
import { describe, expect, it } from 'vitest';
import { boleh, halamanAwal, izinPenuh, menuMasterUntuk, normalIzin } from '../../src/lib/akses';
import { handleAktivitas, memoryAktStore } from './aktivitas';
import { cocokSandi, handleAuth, hashSandi, memoryAuthStore, sesiDari, type AuthStore } from './auth';
import { handle } from './handler';
import { memoryStore } from './store';

/** Server mini: rute sama seperti Netlify + cookie jar per "perangkat". */
async function server() {
  const auth: AuthStore = memoryAuthStore();
  await auth.siapkan({ SUPERADMIN_EMAIL: 'Boss@Contoh.id', SUPERADMIN_PASSWORD: 'rahasia-awal' });
  const data = memoryStore();
  const akt = memoryAktStore();
  const kirim = async (req: Request) => {
    const p = new URL(req.url).pathname;
    if (p.startsWith('/api/data')) return handle(req, data, await sesiDari(req, auth));
    if (p.startsWith('/api/aktivitas')) return handleAktivitas(req, akt, await sesiDari(req, auth));
    return handleAuth(req, auth);
  };
  const perangkat = () => {
    let cookie = '';
    const f = async (path: string, method = 'GET', body?: unknown) => {
      const res = await kirim(
        new Request(`https://app.test${path}`, {
          method,
          headers: { cookie, 'content-type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
      );
      const sc = res.headers.get('set-cookie');
      if (sc) cookie = sc.split(';')[0];
      return { status: res.status, cookie: sc, body: (await res.json()) as { ok: boolean; error?: string; data?: any } }; // eslint-disable-line @typescript-eslint/no-explicit-any
    };
    return f;
  };
  return { auth, perangkat };
}

describe('akses (pure)', () => {
  it('normalIzin: hanya menu/aksi dikenal; Tambah/Ubah/Hapus → + Lihat; aksi yang tidak berlaku dibuang', () => {
    const n = normalIzin({ 'master.sku': { ubah: true }, 'dashboard.gt': { hapus: true, lihat: true }, palsu: { lihat: true }, 'ops.po': { tambah: true } });
    expect(n).toEqual({ 'master.sku': { ubah: true, lihat: true }, 'dashboard.gt': { lihat: true } });
    expect(boleh(n, 'master.sku', 'lihat')).toBe(true);
    expect(boleh(n, 'master.sku', 'hapus')).toBe(false);
  });
  it('menu Master per tipe & channel; halaman awal sesuai izin', () => {
    expect(menuMasterUntuk('master', 'MT')).toEqual(['master.store-mt']);
    expect(menuMasterUntuk('pjp')).toEqual(['master.pjp-gt', 'master.pjp-mt']);
    expect(menuMasterUntuk('rules')).toEqual(['master.moq-gt']);
    expect(halamanAwal(izinPenuh())).toBe('/admin');
    expect(halamanAwal({ 'ops.collection': { lihat: true } })).toBe('/admin/penagihan');
    expect(halamanAwal({ 'app.mt': { lihat: true } })).toBe('/mt');
    expect(halamanAwal({})).toBe('/akses-ditolak');
  });
  it('hash scrypt', async () => {
    const h = await hashSandi('123456');
    expect(h).toMatch(/^scrypt\$/);
    expect(await cocokSandi('123456', h)).toBe(true);
    expect(await cocokSandi('123457', h)).toBe(false);
  });
});

describe('login & sesi', () => {
  it('Super Admin dari env → login (email tidak peka huruf besar) tanpa wajib ganti → ganti password → me → logout', async () => {
    const { perangkat } = await server();
    const hp = perangkat();
    expect((await hp('/api/auth/me')).status).toBe(401);
    const l = await hp('/api/auth/login', 'POST', { email: 'boss@contoh.id', password: 'rahasia-awal' });
    expect(l.status).toBe(200);
    expect(l.cookie).toMatch(/sv_sesi=.+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=43200; Secure/);
    expect(l.body.data).toMatchObject({ peran: { id: 'super_admin' }, lingkup: null, pengguna: { wajib_ganti: false, sandi_env: true } });
    expect((await hp('/api/auth/ganti-sandi', 'POST', { lama: 'salah', baru: 'rahasia-baru-1' })).status).toBe(400);
    expect((await hp('/api/auth/ganti-sandi', 'POST', { lama: 'rahasia-awal', baru: 'pendek' })).body.error).toMatch(/minimal 8/);
    const g = await hp('/api/auth/ganti-sandi', 'POST', { lama: 'rahasia-awal', baru: 'rahasia-baru-1' });
    expect(g.body.data.pengguna.wajib_ganti).toBe(false);
    expect((await hp('/api/auth/me')).status).toBe(200);
    await hp('/api/auth/logout', 'POST');
    expect((await hp('/api/auth/me')).status).toBe(401);
  });

  it('password Super Admin mengikuti env (termasuk #) sampai diganti/di-reset di aplikasi; restart membuka kunci', async () => {
    const auth = memoryAuthStore();
    const login = async (pw: string) => (await handleAuth(new Request('https://x/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'admin@perusahaan.co.id', password: pw }) }), auth)).status;
    await auth.siapkan({ SUPERADMIN_EMAIL: 'admin@perusahaan.co.id', SUPERADMIN_PASSWORD: 'contoh#Rahasia1' });
    expect(await login('contoh#Rahasia1')).toBe(200);
    // 5× salah → terkunci; "restart server" (siapkan ulang) membuka kunci akun env.
    for (let i = 0; i < 5; i++) await login('salah');
    expect(await login('contoh#Rahasia1')).toBe(429);
    await auth.siapkan({ SUPERADMIN_EMAIL: 'admin@perusahaan.co.id', SUPERADMIN_PASSWORD: 'contoh#Rahasia1' });
    expect(await login('contoh#Rahasia1')).toBe(200);
    // Env diubah → ikut berubah.
    await auth.siapkan({ SUPERADMIN_EMAIL: 'admin@perusahaan.co.id', SUPERADMIN_PASSWORD: 'baru$456' });
    expect(await login('contoh#Rahasia1')).toBe(401);
    expect(await login('baru$456')).toBe(200);
    // Ganti di aplikasi → env tidak menimpa lagi.
    const l = await handleAuth(new Request('https://x/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'admin@perusahaan.co.id', password: 'baru$456' }) }), auth);
    const cookie = l.headers.get('set-cookie')!.split(';')[0];
    expect((await handleAuth(new Request('https://x/api/auth/ganti-sandi', { method: 'POST', headers: { cookie }, body: JSON.stringify({ lama: 'baru$456', baru: 'pilihan-saya-1' }) }), auth)).status).toBe(200);
    await auth.siapkan({ SUPERADMIN_EMAIL: 'admin@perusahaan.co.id', SUPERADMIN_PASSWORD: 'baru$456' });
    expect(await login('baru$456')).toBe(401);
    expect(await login('pilihan-saya-1')).toBe(200);
    expect((await auth.daftarPengguna()).filter((u) => u.peran_id === 'super_admin')).toHaveLength(1);
  });

  it('akun Super Admin lama (dibuat sebelum penanda env, belum pernah ganti password) ikut disinkron ke env', async () => {
    const auth = memoryAuthStore();
    await auth.siapkan({});
    await auth.simpanPengguna({ id: 'lama', nama: 'SA', email: 'admin@perusahaan.co.id', kode_salesman: null, hash: await hashSandi('admin'), peran_id: 'super_admin', lingkup: [], aktif: true, wajib_ganti: true, login_terakhir: null });
    for (let i = 0; i < 5; i++) await auth.gagalLogin('e:admin@perusahaan.co.id', true);
    await auth.siapkan({ SUPERADMIN_EMAIL: 'admin@perusahaan.co.id', SUPERADMIN_PASSWORD: 'contoh#Rahasia1' });
    const r = await handleAuth(new Request('https://x/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'admin@perusahaan.co.id', password: 'contoh#Rahasia1' }) }), auth);
    expect(r.status).toBe(200);
    expect(((await r.json()) as { data: { pengguna: { wajib_ganti: boolean } } }).data.pengguna.wajib_ganti).toBe(false);
  });

  it('salah 5× → dikunci 15 menit (pesan tidak membocorkan akun mana yang ada)', async () => {
    const { perangkat } = await server();
    const hp = perangkat();
    const a = await hp('/api/auth/login', 'POST', { email: 'tidak@ada.id', password: 'x' });
    const b = await hp('/api/auth/login', 'POST', { email: 'boss@contoh.id', password: 'x' });
    expect(a.body.error).toBe(b.body.error);
    for (let i = 0; i < 4; i++) await hp('/api/auth/login', 'POST', { email: 'boss@contoh.id', password: 'x' });
    const c = await hp('/api/auth/login', 'POST', { email: 'boss@contoh.id', password: 'rahasia-awal' });
    expect(c.status).toBe(429);
  });
});

describe('RBAC & lingkup', () => {
  async function siap() {
    const s = await server();
    const admin = s.perangkat();
    await admin('/api/auth/login', 'POST', { email: 'boss@contoh.id', password: 'rahasia-awal' });
    return { ...s, admin };
  }

  it('peran kustom: hanya Lihat Collection → PATCH master/upload/reset ditolak 403; baca master boleh', async () => {
    const { admin, perangkat } = await siap();
    const p = await admin('/api/peran', 'POST', { nama: 'Supervisor Bandung', izin: { 'ops.collection': { lihat: true }, 'dashboard.gt': { lihat: true } } });
    expect(p.status).toBe(200);
    const u = await admin('/api/pengguna', 'POST', { nama: 'Spv', email: 'spv@contoh.id', peran_id: p.body.data.id, lingkup: ['000033'], sandi: 'spv-12345' });
    expect(u.status).toBe(200);
    expect((await admin('/api/data/rules', 'PUT', [{ kode_sku: '1', satuan: 'Pcs', moq: 1 }])).status).toBe(200);

    const spv = perangkat();
    const l = await spv('/api/auth/login', 'POST', { email: 'spv@contoh.id', password: 'spv-12345' });
    expect(l.body.data).toMatchObject({ izin: { 'ops.collection': { lihat: true } }, lingkup: ['000033'] });
    expect((await spv('/api/data/rules')).status).toBe(200);
    expect((await spv('/api/data/rules', 'PATCH', { op: 'tambah', baru: { kode_sku: '2', satuan: 'Pcs', moq: 1 } })).status).toBe(403);
    expect((await spv('/api/data/rules', 'PUT', [])).status).toBe(403);
    expect((await spv('/api/aktivitas', 'DELETE')).status).toBe(403);
    expect((await spv('/api/pengguna')).status).toBe(403);
    expect((await perangkat()('/api/data/rules')).status).toBe(401);
  });

  it('izin Master per channel: boleh ubah Store GT tapi tidak Store MT', async () => {
    const { admin, perangkat } = await siap();
    const p = await admin('/api/peran', 'POST', { nama: 'Admin GT', izin: { 'master.store-gt': { tambah: true } } });
    await admin('/api/pengguna', 'POST', { nama: 'GT', email: 'gt@contoh.id', peran_id: p.body.data.id, sandi: 'admin-gt-1' });
    const gt = perangkat();
    await gt('/api/auth/login', 'POST', { email: 'gt@contoh.id', password: 'admin-gt-1' });
    expect((await gt('/api/data/master', 'PATCH', { op: 'tambah', baru: { kode_toko: 'A', channel: 'GT' } })).status).toBe(200);
    expect((await gt('/api/data/master', 'PATCH', { op: 'tambah', baru: { kode_toko: 'B', channel: 'MT' } })).status).toBe(403);
  });

  it('akun sales massal → login kode + PIN → hanya aktivitas miliknya; tulis atas nama SR lain 403', async () => {
    const { admin, perangkat } = await siap();
    const m = await admin('/api/pengguna/massal', 'POST', { salesmen: [{ kode: '000033', nama: 'Yudha' }, { kode: '000024', nama: 'Arli' }, { kode: 'M01', nama: 'Dewi', channel: 'MT' }] });
    expect(m.body.data.map((x: { kode_salesman: string; peran: string }) => `${x.kode_salesman}:${x.peran}`)).toEqual(['000033:Sales GT', '000024:Sales GT', 'M01:Sales MT']);
    // Ulang → tidak dobel
    expect((await admin('/api/pengguna/massal', 'POST', { salesmen: [{ kode: '000033', nama: 'Yudha' }] })).body.data).toEqual([]);
    const pin = (k: string) => m.body.data.find((x: { kode_salesman: string }) => x.kode_salesman === k).pin as string;

    const yudha = perangkat();
    const l = await yudha('/api/auth/login', 'POST', { kode_salesman: '000033', pin: pin('000033') });
    expect(l.cookie).toMatch(/Max-Age=2592000/);
    expect(l.body.data).toMatchObject({ lingkup: ['000033'], peran: { id: 'sales_gt' } });
    // Login sales dengan form admin tidak bisa (dan sebaliknya).
    expect((await perangkat()('/api/auth/login', 'POST', { email: 'boss@contoh.id', pin: pin('000033') })).status).toBe(401);

    const po = (id: string, sr: string) => ({ jenis: 'po', id, data: { id, kode_salesman: sr, no_po: id } });
    expect((await yudha('/api/aktivitas', 'POST', { items: [po('a', '000033')] })).status).toBe(200);
    expect((await yudha('/api/aktivitas', 'POST', { items: [po('b', '000024')] })).status).toBe(403);
    const arli = perangkat();
    await arli('/api/auth/login', 'POST', { kode_salesman: '000024', pin: pin('000024') });
    await arli('/api/aktivitas', 'POST', { items: [po('c', '000024')] });
    expect((await yudha('/api/aktivitas')).body.data.items.map((x: { id: string }) => x.id)).toEqual(['a']);
    expect((await admin('/api/aktivitas')).body.data.items.map((x: { id: string }) => x.id)).toEqual(['a', 'c']);
    // Sales tidak bisa upload master.
    expect((await yudha('/api/data/rules', 'PUT', [])).status).toBe(403);
  });

  it('nonaktifkan → sesi dicabut; reset PIN → wajib ganti; Super Admin terakhir tidak bisa dihapus; peran sistem terkunci', async () => {
    const { admin, perangkat, auth } = await siap();
    const m = await admin('/api/pengguna/massal', 'POST', { salesmen: [{ kode: '000033', nama: 'Yudha' }] });
    const hp = perangkat();
    await hp('/api/auth/login', 'POST', { kode_salesman: '000033', pin: m.body.data[0].pin });
    const u = (await auth.daftarPengguna()).find((x) => x.kode_salesman === '000033')!;
    await admin(`/api/pengguna/${u.id}`, 'PUT', { aktif: false });
    expect((await hp('/api/auth/me')).status).toBe(401);
    expect((await hp('/api/auth/login', 'POST', { kode_salesman: '000033', pin: m.body.data[0].pin })).body.error).toMatch(/dinonaktifkan/);
    await admin(`/api/pengguna/${u.id}`, 'PUT', { aktif: true });
    const r = await admin(`/api/pengguna/${u.id}/reset-sandi`, 'POST');
    expect(r.body.data.sandi).toMatch(/^\d{6}$/);
    const l = await hp('/api/auth/login', 'POST', { kode_salesman: '000033', pin: r.body.data.sandi });
    expect(l.body.data.pengguna.wajib_ganti).toBe(true);

    const sa = (await auth.daftarPengguna()).find((x) => x.peran_id === 'super_admin')!;
    expect((await admin(`/api/pengguna/${sa.id}`, 'DELETE')).body.error).toMatch(/akun sendiri/);
    expect((await admin('/api/peran/super_admin', 'PUT', { izin: {} })).status).toBe(400);
    expect((await admin('/api/peran/super_admin', 'DELETE')).status).toBe(400);
    expect((await admin('/api/peran/sales_gt', 'DELETE')).body.error).toMatch(/masih dipakai 1 pengguna/);
    const peran = (await admin('/api/peran')).body.data as { id: string; izin: object }[];
    expect(peran.find((p) => p.id === 'super_admin')!.izin).toEqual(izinPenuh());
  });

  it('reset PIN massal: hanya sales yang belum ganti PIN, PIN lama tidak berlaku, PIN baru bisa dipakai', async () => {
    const { admin, perangkat } = await siap();
    const m = await admin('/api/pengguna/massal', 'POST', { salesmen: [{ kode: '000033', nama: 'Yudha' }, { kode: '000024', nama: 'Arli' }] });
    // Arli sudah login & ganti PIN → tidak ikut direset.
    const arli = perangkat();
    await arli('/api/auth/login', 'POST', { kode_salesman: '000024', pin: m.body.data[1].pin });
    await arli('/api/auth/ganti-sandi', 'POST', { lama: m.body.data[1].pin, baru: '482915' });
    const r = await admin('/api/pengguna/reset-massal', 'POST', {});
    expect(r.body.data.map((x: { kode_salesman: string }) => x.kode_salesman)).toEqual(['000033']);
    const hp = perangkat();
    expect((await hp('/api/auth/login', 'POST', { kode_salesman: '000033', pin: m.body.data[0].pin })).status).toBe(401);
    expect((await hp('/api/auth/login', 'POST', { kode_salesman: '000033', pin: r.body.data[0].pin })).status).toBe(200);
    expect((await perangkat()('/api/auth/login', 'POST', { kode_salesman: '000024', pin: '482915' })).status).toBe(200);
  });

  it('audit mencatat login, upload, dan perubahan pengguna', async () => {
    const { admin } = await siap();
    await admin('/api/data/rules', 'PUT', [{ kode_sku: '1', satuan: 'Pcs', moq: 1 }]);
    const a = (await admin('/api/audit')).body.data as { aksi: string; objek: string; pengguna: string }[];
    expect(a.map((x) => `${x.aksi}:${x.objek}`)).toEqual(['upload:data:rules', 'login:auth']);
    expect(a[0].pengguna).toBe('boss@contoh.id');
  });
});

describe('bolehPath', () => {
  it('tujuan setelah login hanya bila menu boleh dilihat', async () => {
    const { bolehPath } = await import('../../src/lib/akses');
    const spv = { 'ops.collection': { lihat: true } };
    expect(bolehPath(spv, '/admin/penagihan')).toBe(true);
    expect(bolehPath(spv, '/admin/po')).toBe(false);
    expect(bolehPath(spv, '/admin')).toBe(false);
    expect(bolehPath({ 'app.gt': { lihat: true } }, '/sales/kunjungan/012419')).toBe(true);
    expect(bolehPath({ 'app.gt': { lihat: true } }, '/admin/penagihan')).toBe(false);
    expect(bolehPath({ 'master.sku': { lihat: true } }, '/admin/master')).toBe(true);
    expect(bolehPath({}, '/akun/sandi')).toBe(true);
  });
});
