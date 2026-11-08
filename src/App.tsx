import { useEffect, useState } from 'react';
import { AdminPage } from './pages/AdminPage';
import { SalesPage } from './pages/SalesPage';
import { useData } from './state';

type Route = 'sales' | 'admin';

/** Routing sederhana: /sales dan /admin (path). Root → /sales. */
function readRoute(): Route {
  return window.location.pathname.replace(/\/+$/, '').endsWith('/admin') ? 'admin' : 'sales';
}

export function App() {
  const [route, setRoute] = useState<Route>(readRoute);
  const { status, error, resetDummy } = useData();

  useEffect(() => {
    const onPop = () => setRoute(readRoute());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const go = (r: Route) => {
    window.history.pushState(null, '', `/${r}`);
    setRoute(r);
  };

  const tab = (r: Route, label: string) => (
    <button
      type="button"
      onClick={() => go(r)}
      aria-current={route === r ? 'page' : undefined}
      className={`rounded-md px-3 py-1.5 text-sm font-medium ${route === r ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <nav className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-2">
          <span className="truncate text-sm font-semibold text-slate-700">Due Invoice Tracker · POC</span>
          <div className="flex gap-1">
            {tab('sales', 'Sales')}
            {tab('admin', 'Admin')}
          </div>
        </div>
      </nav>

      {status === 'loading' ? (
        <p className="py-16 text-center text-sm text-slate-500">Memuat data…</p>
      ) : status === 'error' ? (
        <div className="mx-auto max-w-md px-4 py-16 text-center">
          <p className="font-medium text-red-700">Gagal memuat data</p>
          <p className="mt-1 text-sm text-slate-600">{error}</p>
          <button type="button" onClick={() => void resetDummy()} className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">
            Coba lagi
          </button>
        </div>
      ) : route === 'admin' ? (
        <AdminPage />
      ) : (
        <SalesPage />
      )}
    </div>
  );
}
