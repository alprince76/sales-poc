import { Boxes, ChevronDown, ClipboardList, Database, HandCoins, KeyRound, LayoutDashboard, ListChecks, LogOut, Menu, Route as RouteIcon, ShoppingCart, Smartphone, Store, Table2, Users, X } from 'lucide-react';
import { useAuth } from '../../auth';
import { boleh } from '../../lib/akses';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { cn } from '../../components/ui';
import { JENIS_DATA } from '../../lib/jenisData';
import { formatJam, formatTimestamp, latestUpdate, useData } from '../../state';

const NAV = [
  { to: '/admin', label: 'Dashboard GT', icon: LayoutDashboard, end: true, menu: 'dashboard.gt' },
  { to: '/admin/mt', label: 'Dashboard MT', icon: LayoutDashboard, menu: 'dashboard.mt' },
  { to: '/admin/rute', label: 'Rute Salesman', icon: RouteIcon, menu: 'ops.rute' },
  { to: '/admin/toko', label: 'Toko & Faktur', icon: Store, menu: 'ops.toko' },
  { to: '/admin/penagihan', label: 'Collection', icon: HandCoins, menu: 'ops.collection' },
  { to: '/admin/po', label: 'Purchase Order', icon: ShoppingCart, menu: 'ops.po' },
  { to: '/admin/stok', label: 'Cek Stok', icon: Boxes, menu: 'ops.stok' },
  { to: '/admin/msl', label: 'SKU Listed Compliance (MT)', icon: ListChecks, menu: 'ops.msl' },
];

const navCls = ({ isActive }: { isActive: boolean }) =>
  cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors', isActive ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white');

/** Menu dengan submenu (Master Data, Pengguna). Hanya submenu yang boleh dilihat. */
function MenuGrup({
  label,
  icon: Icon,
  prefix,
  items,
  onNavigate,
}: {
  label: string;
  icon: typeof Table2;
  prefix: string;
  items: { to: string; label: string }[];
  onNavigate?: () => void;
}) {
  const loc = useLocation();
  const aktif = items.some((i) => loc.pathname === i.to || loc.pathname.startsWith(`${i.to}/`)) || (prefix !== '' && loc.pathname.startsWith(`${prefix}/`));
  const [buka, setBuka] = useState(aktif);
  useEffect(() => {
    if (aktif) setBuka(true);
  }, [aktif]);
  if (!items.length) return null;
  const id = `submenu-${label.toLowerCase().replace(/\W+/g, '-')}`;
  return (
    <div>
      <button
        type="button"
        aria-expanded={buka}
        aria-controls={id}
        onClick={() => setBuka((b) => !b)}
        className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors', aktif ? 'text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white')}
      >
        <Icon size={18} />
        <span className="flex-1 text-left">{label}</span>
        <ChevronDown size={16} className={cn('transition-transform', buka && 'rotate-180')} aria-hidden />
      </button>
      {buka && (
        <div id={id} className="ml-5 mt-0.5 space-y-0.5 border-l border-white/10 pl-3">
          {items.map((j) => (
            <NavLink
              key={j.to}
              to={j.to}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn('block rounded-lg px-3 py-1.5 text-sm transition-colors', isActive ? 'bg-white/10 font-medium text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white')
              }
            >
              {j.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

/** Nama + peran, Ganti password, Keluar. */
function KotakAkun({ onNavigate }: { onNavigate?: () => void }) {
  const { sesi, keluar } = useAuth();
  if (!sesi) return null;
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-white/5 px-3 py-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white" aria-hidden>
        {sesi.pengguna.nama.slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{sesi.pengguna.nama}</p>
        <p className="truncate text-xs text-slate-400">{sesi.peran.nama}</p>
      </div>
      <Link to="/akun/sandi" onClick={onNavigate} aria-label="Ganti password" title="Ganti password" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white">
        <KeyRound size={16} />
      </Link>
      <button type="button" onClick={() => void keluar()} aria-label="Keluar" title="Keluar" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white">
        <LogOut size={16} />
      </button>
    </div>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { updatedAt, sumber, koneksi, aktTerakhir, aktTertunda } = useData();
  const { sesi } = useAuth();
  const lihat = (menu: string) => boleh(sesi?.izin, menu, 'lihat');
  const pakaiDummy = Object.values(sumber).some((s) => s === 'dummy');
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white">
          <ClipboardList size={18} />
        </div>
        <div>
          <div className="text-sm font-bold leading-tight text-white">Sales Visit</div>
          <div className="text-xs text-slate-400">Web Admin · POC</div>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3" aria-label="Menu admin">
        {NAV.filter((n) => lihat(n.menu)).map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={navCls}
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
        <MenuGrup
          label="Master Data"
          icon={Table2}
          prefix="/admin/master"
          items={JENIS_DATA.filter((j) => lihat(`master.${j.id}`)).map((j) => ({ to: `/admin/master/${j.id}`, label: j.menu }))}
          onNavigate={onNavigate}
        />
        {lihat('data.upload') && (
          <NavLink to="/admin/data" onClick={onNavigate} className={navCls}>
            <Database size={18} />
            Data &amp; Upload
          </NavLink>
        )}
        <MenuGrup
          label="Pengguna"
          icon={Users}
          prefix=""
          items={[
            ...(lihat('pengguna.user') ? [{ to: '/admin/pengguna', label: 'Pengguna' }] : []),
            ...(lihat('pengguna.peran') ? [{ to: '/admin/peran', label: 'Peran & Akses' }] : []),
          ]}
          onNavigate={onNavigate}
        />
      </nav>
      <div className="space-y-3 border-t border-white/10 p-4">
        <KotakAkun onNavigate={onNavigate} />
        {(lihat('app.gt') || lihat('app.mt')) && (
          <div className="grid grid-cols-2 gap-2">
            {lihat('app.gt') && (
              <Link to="/sales" className="flex items-center justify-center gap-1.5 rounded-xl bg-white/5 px-2 py-2.5 text-sm font-medium text-slate-200 hover:bg-white/10">
                <Smartphone size={15} /> Sales GT
              </Link>
            )}
            {lihat('app.mt') && (
              <Link to="/mt" className="flex items-center justify-center gap-1.5 rounded-xl bg-white/5 px-2 py-2.5 text-sm font-medium text-slate-200 hover:bg-white/10">
                <Smartphone size={15} /> Sales MT
              </Link>
            )}
          </div>
        )}
        <p className="text-xs leading-relaxed text-slate-400">
          Data diperbarui {formatTimestamp(latestUpdate(updatedAt))}
          {pakaiDummy && <span className="block text-slate-500">Sebagian memakai data dummy</span>}
          <span className="block">
            {koneksi === 'server'
              ? `PO & aktivitas sales tersinkron ${aktTerakhir ? formatJam(aktTerakhir) : '…'}`
              : 'PO & aktivitas sales: belum tersambung'}
            {aktTertunda > 0 && <span className="text-amber-300"> · {aktTertunda} belum terkirim</span>}
          </span>
        </p>
      </div>
    </div>
  );
}

export function AdminLayout() {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  return (
    <div className="min-h-dvh bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-slate-900 lg:block">
        <SidebarContent />
      </aside>
      <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-slate-200 bg-white/95 px-3 py-2 backdrop-blur lg:hidden">
        <button type="button" aria-label="Buka menu" onClick={() => setOpen(true)} className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100">
          <Menu size={20} />
        </button>
        <span className="text-sm font-bold text-slate-900">Sales Visit · Admin</span>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-slate-900/50" onClick={() => setOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-72 animate-drawer-in bg-slate-900 shadow-xl">
            <button type="button" aria-label="Tutup menu" onClick={() => setOpen(false)} className="absolute right-3 top-4 flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10">
              <X size={18} />
            </button>
            <SidebarContent onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
      <div className="lg:pl-64">
        <Outlet />
      </div>
    </div>
  );
}

export function AdminPage({ title, description, actions, children }: { title: string; description?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{title}</h1>
          {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

/** Tabel responsif dengan header lengket. */
export function Table({ head, children, empty, maxH = 'max-h-[70vh]' }: { head: ReactNode; children: ReactNode; empty?: ReactNode; maxH?: string }) {
  return (
    <div className={cn('overflow-auto', maxH)}>
      <table className="w-full min-w-[640px] text-sm">
        <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500 [&_th]:whitespace-nowrap [&_th]:px-3 [&_th]:py-2.5">
          {head}
        </thead>
        <tbody className="divide-y divide-slate-100 [&_td]:px-3 [&_td]:py-2">{children}</tbody>
      </table>
      {empty}
    </div>
  );
}
