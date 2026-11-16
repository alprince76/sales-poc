import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import { SyncToast } from './components/SyncToast';
import { boleh, halamanAwal, menuById } from './lib/akses';
import { AksesDitolak, GantiSandiPage, LoginPage } from './pages/LoginPage';
import { PenggunaPage } from './pages/admin/PenggunaPage';
import { PeranPage } from './pages/admin/PeranPage';
import { DataProvider } from './state';
import { Button } from './components/ui';
import { AdminLayout } from './pages/admin/AdminLayout';
import { PenagihanPage, POPage, RuteAdminPage, StokPage, TokoFakturPage } from './pages/admin/AdminPages';
import { DashboardGTPage, DashboardMTPage } from './pages/admin/DashboardPage';
import { DataPage } from './pages/admin/DataPage';
import { MasterPage } from './pages/admin/MasterPage';
import { SalesLayout } from './pages/sales/SalesLayout';
import { AktivitasPage, RutePage, TagihanPage } from './pages/sales/SalesPages';
import { SalesSessionProvider } from './pages/sales/session';
import { VisitPage } from './pages/sales/VisitPage';
import { useData } from './state';
import { MslPage } from './pages/admin/MslPage';
import { MtAktivitasPage, MtLayout, MtOrderPage, MtRutePage, MtTokoListPage } from './pages/mt/MtPages';
import { MtRedirect, MtTokoPage } from './pages/mt/MtStore';

function Splash({ teks = 'Memuat data…' }: { teks?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 text-sm text-slate-500">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-brand-600" aria-hidden />
      {teks}
    </div>
  );
}

/** Akar aplikasi: cek sesi → login / ganti sandi wajib → data (per akun) → rute. */
export function Root() {
  const { status, sesi } = useAuth();
  const loc = useLocation();
  if (status === 'cek') return <Splash teks="Memeriksa sesi…" />;
  if (loc.pathname === '/login') return sesi ? <Navigate to={halamanAwal(sesi.izin)} replace /> : <LoginPage />;
  if (!sesi) return <Navigate to={`/login?ke=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (sesi.pengguna.wajib_ganti && status !== 'offline') return <GantiSandiPage wajib />;
  return (
    <DataProvider key={sesi.pengguna.id} penggunaId={sesi.pengguna.id} lingkup={sesi.lingkup}>
      <App />
      <SyncToast />
    </DataProvider>
  );
}

/** Pengaman rute: butuh izin Lihat pada menu. */
function Wajib({ menu, children }: { menu: string; children: ReactNode }) {
  const { sesi } = useAuth();
  return boleh(sesi?.izin, menu, 'lihat') ? <>{children}</> : <AksesDitolak menu={menuById(menu)?.nama} />;
}

function KeAwal() {
  const { sesi } = useAuth();
  return <Navigate to={halamanAwal(sesi?.izin)} replace />;
}

export function App() {
  const { status, error } = useData();
  if (status === 'loading') return <Splash />;
  if (status === 'error')
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 text-center">
        <p className="font-semibold text-red-700">Data belum bisa dimuat</p>
        <p className="mt-1 text-sm text-slate-600">Periksa koneksi internet, lalu coba lagi. Data Anda aman dan tidak berubah.</p>
        <Button className="mt-4" onClick={() => window.location.reload()}>
          Coba lagi
        </Button>
        {error && (
          <details className="mt-4 text-xs text-slate-400">
            <summary className="cursor-pointer select-none">Detail untuk tim teknis</summary>
            <p className="mt-1">{error}</p>
          </details>
        )}
      </div>
    );

  return (
    <Routes>
      <Route path="/" element={<KeAwal />} />
      <Route path="/akun/sandi" element={<GantiSandiPage />} />
      <Route path="/akses-ditolak" element={<AksesDitolak />} />
      <Route path="/gt/*" element={<Navigate to="/sales" replace />} />
      <Route
        path="/mt/*"
        element={
          <Wajib menu="app.mt">
          <SalesSessionProvider channel="MT" storageKey="svdi-v2-mt-session">
            <Routes>
              <Route path="toko/:kode" element={<MtTokoPage />} />
              <Route path="toko/:kode/divisi/:divisi" element={<MtRedirect step="msl" />} />
              <Route path="toko/:kode/po" element={<MtRedirect step="summary" />} />
              <Route element={<MtLayout />}>
                <Route index element={<MtRutePage />} />
                <Route path="toko" element={<MtTokoListPage />} />
                <Route path="order" element={<MtOrderPage />} />
                <Route path="aktivitas" element={<MtAktivitasPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/mt" replace />} />
            </Routes>
          </SalesSessionProvider>
          </Wajib>
        }
      />
      <Route
        path="/sales/*"
        element={
          <Wajib menu="app.gt">
          <SalesSessionProvider>
            <Routes>
              <Route path="kunjungan/:kode" element={<VisitPage />} />
              <Route element={<SalesLayout />}>
                <Route index element={<RutePage />} />
                <Route path="tagihan" element={<TagihanPage />} />
                <Route path="toko" element={<Navigate to="/sales?tab=nonroute" replace />} />
                <Route path="aktivitas" element={<AktivitasPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/sales" replace />} />
            </Routes>
          </SalesSessionProvider>
          </Wajib>
        }
      />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Wajib menu="dashboard.gt"><DashboardGTPage /></Wajib>} />
        <Route path="mt" element={<Wajib menu="dashboard.mt"><DashboardMTPage /></Wajib>} />
        <Route path="rute" element={<Wajib menu="ops.rute"><RuteAdminPage /></Wajib>} />
        <Route path="toko" element={<Wajib menu="ops.toko"><TokoFakturPage /></Wajib>} />
        <Route path="penagihan" element={<Wajib menu="ops.collection"><PenagihanPage /></Wajib>} />
        <Route path="po" element={<Wajib menu="ops.po"><POPage /></Wajib>} />
        <Route path="stok" element={<Wajib menu="ops.stok"><StokPage /></Wajib>} />
        <Route path="msl" element={<Wajib menu="ops.msl"><MslPage /></Wajib>} />
        <Route path="data" element={<Wajib menu="data.upload"><DataPage /></Wajib>} />
        <Route path="master" element={<MasterPage />} />
        <Route path="master/:jenis" element={<MasterPage />} />
        <Route path="pengguna" element={<Wajib menu="pengguna.user"><PenggunaPage /></Wajib>} />
        <Route path="peran" element={<Wajib menu="pengguna.peran"><PeranPage /></Wajib>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
