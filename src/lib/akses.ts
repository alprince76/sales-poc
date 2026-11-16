/**
 * RBAC: daftar menu × aksi (Tambah/Lihat/Ubah/Hapus). Satu sumber untuk sidebar, route guard, matriks peran & API.
 * Pure — dipakai client (src) dan server (netlify/lib).
 */
import { JENIS_DATA } from './jenisData';
import type { TipeData } from './parse';

export type Aksi = 'tambah' | 'lihat' | 'ubah' | 'hapus';
export const AKSI: Aksi[] = ['tambah', 'lihat', 'ubah', 'hapus'];
export const LABEL_AKSI: Record<Aksi, string> = { tambah: 'Tambah', lihat: 'Lihat', ubah: 'Ubah', hapus: 'Hapus' };

export interface MenuAkses {
  /** Kunci unik, mis. "master.sku". */
  id: string;
  grup: string;
  nama: string;
  /** Path admin/app yang dijaga menu ini. */
  path?: string;
  /** Aksi yang berlaku (lainnya ditampilkan nonaktif di matriks). */
  aksi: Aksi[];
  /** Arti aksi untuk tooltip di matriks. */
  ket?: Partial<Record<Aksi, string>>;
}

const L: Aksi[] = ['lihat'];
const CRUD: Aksi[] = ['tambah', 'lihat', 'ubah', 'hapus'];

export const MENU: MenuAkses[] = [
  { id: 'dashboard.gt', grup: 'Dashboard', nama: 'Dashboard GT', path: '/admin', aksi: L },
  { id: 'dashboard.mt', grup: 'Dashboard', nama: 'Dashboard MT', path: '/admin/mt', aksi: L },
  { id: 'ops.rute', grup: 'Operasional', nama: 'Rute Salesman', path: '/admin/rute', aksi: L },
  { id: 'ops.toko', grup: 'Operasional', nama: 'Toko & Faktur', path: '/admin/toko', aksi: L },
  { id: 'ops.collection', grup: 'Operasional', nama: 'Collection', path: '/admin/penagihan', aksi: L },
  { id: 'ops.po', grup: 'Operasional', nama: 'Purchase Order', path: '/admin/po', aksi: ['lihat', 'ubah'], ket: { ubah: 'Export ke ERP' } },
  { id: 'ops.stok', grup: 'Operasional', nama: 'Cek Stok', path: '/admin/stok', aksi: L },
  { id: 'ops.msl', grup: 'Operasional', nama: 'SKU Listed Compliance (MT)', path: '/admin/msl', aksi: L },
  ...JENIS_DATA.map((j) => ({ id: `master.${j.id}`, grup: 'Master Data', nama: j.menu, path: `/admin/master/${j.id}`, aksi: CRUD })),
  {
    id: 'data.upload',
    grup: 'Data & Upload',
    nama: 'Upload Excel',
    path: '/admin/data',
    aksi: ['tambah', 'lihat', 'hapus'],
    ket: { tambah: 'Upload Excel & seed server', hapus: 'Reset ke data dummy & reset aktivitas' },
  },
  { id: 'pengguna.user', grup: 'Pengguna', nama: 'Pengguna', path: '/admin/pengguna', aksi: CRUD },
  { id: 'pengguna.peran', grup: 'Pengguna', nama: 'Peran & Akses', path: '/admin/peran', aksi: CRUD },
  { id: 'app.gt', grup: 'Aplikasi Sales', nama: 'Sales GT', path: '/sales', aksi: ['tambah', 'lihat'], ket: { tambah: 'Input PO, penagihan, cek stok, kunjungan' } },
  { id: 'app.mt', grup: 'Aplikasi Sales', nama: 'Sales MT', path: '/mt', aksi: ['tambah', 'lihat'], ket: { tambah: 'Input PO & kunjungan MT' } },
];

export const menuById = (id: string) => MENU.find((m) => m.id === id);

/** { menu: { aksi: true } } — yang tidak disebut = tidak boleh. */
export type Izin = Record<string, Partial<Record<Aksi, boolean>>>;

export const ID_SUPER_ADMIN = 'super_admin';

/** Semua menu & aksi (dipakai Super Admin). */
export function izinPenuh(): Izin {
  return Object.fromEntries(MENU.map((m) => [m.id, Object.fromEntries(m.aksi.map((a) => [a, true]))]));
}

export function boleh(izin: Izin | null | undefined, menu: string, aksi: Aksi): boolean {
  return !!izin?.[menu]?.[aksi];
}

/** Boleh salah satu menu (mis. tambah di Sales GT atau Sales MT). */
export const bolehSalah = (izin: Izin | null | undefined, menu: string[], aksi: Aksi) => menu.some((m) => boleh(izin, m, aksi));

export function menuTerlihat(izin: Izin | null | undefined): MenuAkses[] {
  return MENU.filter((m) => boleh(izin, m.id, 'lihat'));
}

/**
 * Rapikan izin: hanya menu & aksi yang dikenal; Tambah/Ubah/Hapus otomatis + Lihat.
 * Dipakai server sebelum menyimpan peran (input dari client tidak dipercaya).
 */
export function normalIzin(input: unknown): Izin {
  const out: Izin = {};
  const src = (typeof input === 'object' && input) || {};
  for (const m of MENU) {
    const v = (src as Record<string, unknown>)[m.id];
    if (typeof v !== 'object' || !v) continue;
    const a: Partial<Record<Aksi, boolean>> = {};
    for (const x of m.aksi) if ((v as Record<string, unknown>)[x] === true) a[x] = true;
    if (a.tambah || a.ubah || a.hapus) a.lihat = m.aksi.includes('lihat') ? true : a.lihat;
    if (Object.keys(a).length) out[m.id] = a;
  }
  return out;
}

/** Menu Master Data untuk baris tipe data tertentu (Store/PJP per channel). */
export function menuMasterUntuk(tipe: TipeData, channel?: 'GT' | 'MT'): string[] {
  const j = JENIS_DATA.filter((x) => x.tipe === tipe && (!x.channel || !channel || x.channel === channel));
  return j.map((x) => `master.${x.id}`);
}

/** Boleh membuka path ini? (menu dengan path terpanjang yang cocok; path tanpa menu = boleh). */
export function bolehPath(izin: Izin | null | undefined, path: string): boolean {
  // Dashboard GT ada di "/admin" persis — jangan jadikan awalan semua halaman admin.
  const cocok = (p: string) => (p === '/admin' ? path === '/admin' : path === p || path.startsWith(`${p}/`));
  const m = MENU.filter((x) => x.path && cocok(x.path)).sort((a, b) => b.path!.length - a.path!.length)[0];
  if (m) return boleh(izin, m.id, 'lihat');
  if (path === '/admin/master') return MENU.some((x) => x.id.startsWith('master.') && boleh(izin, x.id, 'lihat'));
  // Halaman admin lain yang tidak terdaftar: harus punya minimal satu menu admin.
  if (path.startsWith('/admin')) return MENU.some((x) => x.path?.startsWith('/admin') && boleh(izin, x.id, 'lihat'));
  return true;
}

/** Path pertama yang boleh dibuka (tujuan setelah login). */
export function halamanAwal(izin: Izin | null | undefined): string {
  const admin = MENU.find((m) => m.path?.startsWith('/admin') && boleh(izin, m.id, 'lihat'));
  if (admin) return admin.path!;
  if (boleh(izin, 'app.gt', 'lihat')) return '/sales';
  if (boleh(izin, 'app.mt', 'lihat')) return '/mt';
  return '/akses-ditolak';
}

// ── Peran bawaan ──
const lihatSemua = (grup: string[]) => Object.fromEntries(MENU.filter((m) => grup.includes(m.grup)).map((m) => [m.id, { lihat: true }]));

export interface PeranDef {
  id: string;
  nama: string;
  sistem: boolean;
  izin: Izin;
}

export function peranBawaan(): PeranDef[] {
  const penuh = izinPenuh();
  const admin = Object.fromEntries(Object.entries(penuh).filter(([k]) => !k.startsWith('pengguna.')));
  return [
    { id: ID_SUPER_ADMIN, nama: 'Super Admin', sistem: true, izin: penuh },
    { id: 'admin', nama: 'Admin', sistem: false, izin: admin },
    { id: 'supervisor', nama: 'Supervisor', sistem: false, izin: { ...lihatSemua(['Dashboard', 'Operasional']), 'app.gt': { lihat: true }, 'app.mt': { lihat: true } } },
    { id: 'sales_gt', nama: 'Sales GT', sistem: false, izin: { 'app.gt': { lihat: true, tambah: true } } },
    { id: 'sales_mt', nama: 'Sales MT', sistem: false, izin: { 'app.mt': { lihat: true, tambah: true } } },
  ];
}
