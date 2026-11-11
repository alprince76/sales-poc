import { ChevronRight, LayoutDashboard, ListChecks, Store } from 'lucide-react';
import { Link } from 'react-router-dom';

const APPS = [
  {
    to: '/sales',
    icon: Store,
    title: 'Sales GT',
    tag: 'General Trade',
    desc: 'Rute PJP → Collection (penagihan) → Cek Stok → Purchase Order.',
    color: 'bg-brand-600',
  },
  {
    to: '/mt',
    icon: ListChecks,
    title: 'Sales MT',
    tag: 'Modern Trade',
    desc: 'Must Stock List: warning SKU yang belum transaksi > 30 hari → langsung tambah ke PO.',
    color: 'bg-violet-600',
  },
  {
    to: '/admin',
    icon: LayoutDashboard,
    title: 'Web Admin',
    tag: 'Supervisor',
    desc: 'Dashboard, rute salesman, penagihan, PO, MSL compliance, upload data.',
    color: 'bg-slate-900',
  },
];

export function Home() {
  return (
    <div className="min-h-dvh bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-bold text-slate-900">Sales Visit</h1>
        <p className="mt-1 text-sm text-slate-500">Pilih aplikasi (POC · data dummy).</p>
        <ul className="mt-6 space-y-3">
          {APPS.map(({ to, icon: Icon, title, tag, desc, color }) => (
            <li key={to}>
              <Link to={to} className="flex items-start gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card transition-colors hover:bg-slate-50 active:bg-slate-100">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white ${color}`}>
                  <Icon size={22} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-slate-900">{title}</span>
                    <span className="text-xs text-slate-500">{tag}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-slate-600">{desc}</p>
                </div>
                <ChevronRight size={20} className="mt-3 shrink-0 text-slate-300" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
