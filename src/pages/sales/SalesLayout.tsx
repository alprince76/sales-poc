import { Activity, CloudUpload, KeyRound, LogOut, ReceiptText, Route as RouteIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../auth';
import { cn, DateNav } from '../../components/ui';
import { useData } from '../../state';
import { todayJakarta } from '../../lib/dates';
import { useSalesSession } from './session';

export type NavItem = { to: string; label: string; icon: typeof RouteIcon; end?: boolean };

const NAV: NavItem[] = [
  { to: '/sales', label: 'Rute', icon: RouteIcon, end: true },
  { to: '/sales/tagihan', label: 'Tagihan', icon: ReceiptText },
  { to: '/sales/aktivitas', label: 'Aktivitas', icon: Activity },
];

export function SalesHeader({ title, right, badge }: { title: string; right?: ReactNode; badge?: ReactNode }) {
  const { nama, kode, D, setD } = useSalesSession();
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/90 backdrop-blur">
      <div className="mx-auto max-w-md space-y-2.5 px-4 pb-3 pt-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white" aria-hidden>
              {nama.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold leading-tight text-slate-900">{title}</h1>
              <p className="flex items-center gap-1.5 truncate text-xs text-slate-500">
                {badge}
                {nama} · {kode}
              </p>
            </div>
          </div>
          {right ?? (
            <button type="button" onClick={() => setD(todayJakarta())} className="shrink-0 rounded-lg px-2 py-1 text-sm font-medium text-brand-700 hover:bg-brand-50">
              Hari ini
            </button>
          )}
        </div>
        <DateNav value={D} onChange={setD} />
      </div>
    </header>
  );
}

/** Data yang dicatat di HP tapi belum sampai ke database (offline). Terkirim otomatis begitu online. */
export function BelumTerkirim({ inline = false }: { inline?: boolean }) {
  const { aktTertunda, sinkronAktivitas } = useData();
  if (!aktTertunda) return null;
  if (inline)
    return (
      <button
        type="button"
        role="status"
        onClick={() => void sinkronAktivitas()}
        className="mt-2 flex w-full items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-left text-xs text-amber-900 ring-1 ring-amber-200"
      >
        <CloudUpload size={14} className="shrink-0" />
        <span className="flex-1">
          <b>{aktTertunda} data belum terkirim</b> · aman di HP, dikirim otomatis saat ada sinyal
        </span>
      </button>
    );
  return (
    <div role="status" className="fixed inset-x-0 bottom-[calc(7.5rem+env(safe-area-inset-bottom))] z-30 px-3 pb-2">
      <button
        type="button"
        onClick={() => void sinkronAktivitas()}
        className="mx-auto flex w-full max-w-md items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-left text-xs text-amber-900 shadow-card ring-1 ring-amber-200"
      >
        <CloudUpload size={16} className="shrink-0" />
        <span className="flex-1">
          <b>{aktTertunda} data belum terkirim</b> ke kantor. Aman tersimpan di HP ini, dikirim otomatis saat ada sinyal.
        </span>
        <span className="font-semibold text-amber-800">Kirim</span>
      </button>
    </div>
  );
}

export function SalesLayout({ nav = NAV }: { nav?: NavItem[] }) {
  return (
    <div className="min-h-dvh bg-slate-50 pb-[calc(8rem+env(safe-area-inset-bottom))]">
      <Outlet />
      <BelumTerkirim />
      <nav aria-label="Menu utama" className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 shadow-bar backdrop-blur pb-netlify">
        <ul className="mx-auto grid max-w-md" style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}>
          {nav.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn('flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors', isActive ? 'text-brand-700' : 'text-slate-500 hover:text-slate-800')
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={cn('flex h-7 w-12 items-center justify-center rounded-full transition-colors', isActive && 'bg-brand-50')}>
                      <Icon size={20} strokeWidth={isActive ? 2.4 : 2} />
                    </span>
                    {label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

export function SalesBody({ children }: { children: ReactNode }) {
  return <main className="mx-auto max-w-md space-y-3 px-4 py-4">{children}</main>;
}

/** Nama akun login + Ganti PIN + Keluar (data yang belum terkirim diperingatkan dulu). */
export function KotakAkunSales() {
  const { sesi, keluar } = useAuth();
  const { aktTertunda } = useData();
  if (!sesi) return null;
  const pin = !!sesi.pengguna.kode_salesman;
  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-800">
        <b>{sesi.pengguna.nama}</b>
        <span className="text-slate-500"> · {sesi.pengguna.kode_salesman ? `SR ${sesi.pengguna.kode_salesman}` : sesi.pengguna.email} · {sesi.peran.nama}</span>
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Link to="/akun/sandi" className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800 hover:bg-slate-50">
          <KeyRound size={16} /> Ganti {pin ? 'PIN' : 'password'}
        </Link>
        <button
          type="button"
          onClick={() => {
            if (aktTertunda && !window.confirm(`${aktTertunda} data belum terkirim ke kantor. Data tetap tersimpan di HP ini dan terkirim saat Anda login lagi. Keluar sekarang?`)) return;
            void keluar();
          }}
          className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-red-700 hover:bg-red-50"
        >
          <LogOut size={16} /> Keluar
        </button>
      </div>
    </div>
  );
}
