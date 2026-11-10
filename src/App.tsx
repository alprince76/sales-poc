import { Navigate, Route, Routes } from 'react-router-dom';
import { Button } from './components/ui';
import { AdminLayout } from './pages/admin/AdminLayout';
import { PenagihanPage, POPage, RuteAdminPage, StokPage, TokoFakturPage } from './pages/admin/AdminPages';
import { DashboardPage } from './pages/admin/DashboardPage';
import { DataPage } from './pages/admin/DataPage';
import { SalesLayout } from './pages/sales/SalesLayout';
import { AktivitasPage, RutePage, TagihanPage, TokoPage } from './pages/sales/SalesPages';
import { SalesSessionProvider } from './pages/sales/session';
import { VisitPage } from './pages/sales/VisitPage';
import { useData } from './state';

function Splash() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 text-sm text-slate-500">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-brand-600" aria-hidden />
      Memuat data…
    </div>
  );
}

export function App() {
  const { status, error, resetDummy } = useData();
  if (status === 'loading') return <Splash />;
  if (status === 'error')
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 text-center">
        <p className="font-semibold text-red-700">Gagal memuat data</p>
        <p className="mt-1 text-sm text-slate-600">{error}</p>
        <Button className="mt-4" onClick={() => void resetDummy()}>
          Coba lagi
        </Button>
      </div>
    );

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/sales" replace />} />
      <Route
        path="/sales/*"
        element={
          <SalesSessionProvider>
            <Routes>
              <Route path="kunjungan/:kode" element={<VisitPage />} />
              <Route element={<SalesLayout />}>
                <Route index element={<RutePage />} />
                <Route path="tagihan" element={<TagihanPage />} />
                <Route path="toko" element={<TokoPage />} />
                <Route path="aktivitas" element={<AktivitasPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/sales" replace />} />
            </Routes>
          </SalesSessionProvider>
        }
      />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="rute" element={<RuteAdminPage />} />
        <Route path="toko" element={<TokoFakturPage />} />
        <Route path="penagihan" element={<PenagihanPage />} />
        <Route path="po" element={<POPage />} />
        <Route path="stok" element={<StokPage />} />
        <Route path="data" element={<DataPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/sales" replace />} />
    </Routes>
  );
}
