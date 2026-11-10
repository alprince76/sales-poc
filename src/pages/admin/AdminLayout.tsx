import { Boxes, ClipboardList, Database, HandCoins, LayoutDashboard, Menu, Route as RouteIcon, ShoppingCart, Smartphone, Store, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { cn } from '../../components/ui';
import { formatTimestamp, latestUpdate, useData } from '../../state';

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/rute', label: 'Rute Salesman', icon: RouteIcon },
  { to: '/admin/toko', label: 'Toko & Faktur', icon: Store },
  { to: '/admin/penagihan', label: 'Penagihan', icon: HandCoins },
  { to: '/admin/po', label: 'Purchase Order', icon: ShoppingCart },
  { to: '/admin/stok', label: 'Cek Stok', icon: Boxes },
  { to: '/admin/data', label: 'Data & Upload', icon: Database },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { updatedAt, sumber } = useData();
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
      <nav className="flex-1 space-y-0.5 px-3" aria-label="Menu admin">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors', isActive ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white')
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="space-y-3 border-t border-white/10 p-4">
        <Link to="/sales" className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2.5 text-sm font-medium text-slate-200 hover:bg-white/10">
          <Smartphone size={16} /> Buka Sales App
        </Link>
        <p className="text-xs leading-relaxed text-slate-400">
          Data diperbarui {formatTimestamp(latestUpdate(updatedAt))}
          {pakaiDummy && <span className="block text-slate-500">Sebagian memakai data dummy</span>}
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
