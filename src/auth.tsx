/** Sesi login (cookie httpOnly di server) + izin RBAC di client. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AKSI, boleh, type Aksi, type Izin } from './lib/akses';
import { EVENT_401, laporkan401, RemoteError } from './lib/remote';

export interface PenggunaSesi {
  id: string;
  nama: string;
  email: string | null;
  kode_salesman: string | null;
  peran_id: string;
  lingkup: string[];
  aktif: boolean;
  wajib_ganti: boolean;
  login_terakhir: string | null;
}
export interface DataSesi {
  pengguna: PenggunaSesi;
  peran: { id: string; nama: string };
  izin: Izin;
  /** null = semua salesman. */
  lingkup: string[] | null;
}

/** fetch JSON ke API auth; error → RemoteError dengan pesan dari server. */
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new RemoteError('Tidak bisa terhubung ke server. Cek koneksi internet.', 0);
  }
  const ct = res.headers.get('content-type') ?? '';
  const j = ct.includes('application/json') ? ((await res.json().catch(() => null)) as { ok?: boolean; error?: string; data?: T } | null) : null;
  if (!res.ok || !j || j.ok === false) {
    if (!path.startsWith('/api/auth/login')) laporkan401(res.status);
    throw new RemoteError(j?.error ?? (res.status >= 500 ? 'Server sedang bermasalah. Coba lagi sebentar.' : 'Permintaan gagal.'), res.status);
  }
  return j.data as T;
}

type Status = 'cek' | 'masuk' | 'keluar' | 'offline';
interface Ctx {
  status: Status;
  sesi: DataSesi | null;
  masuk: (kred: { email: string; password: string } | { kode_salesman: string; pin: string }) => Promise<DataSesi>;
  keluar: () => Promise<void>;
  gantiSandi: (lama: string, baru: string) => Promise<void>;
  muatUlang: () => Promise<void>;
}
const AuthCtx = createContext<Ctx | null>(null);

/** Sesi terakhir di HP — supaya sales tetap bisa membuka aplikasi saat offline (server tetap mengecek cookie saat online). */
const KEY_SESI = 'svdi-v2-sesi';
const bacaSesiLokal = (): DataSesi | null => {
  try {
    return JSON.parse(localStorage.getItem(KEY_SESI) ?? 'null') as DataSesi | null;
  } catch {
    return null;
  }
};
const simpanSesiLokal = (s: DataSesi | null) => {
  try {
    if (s) localStorage.setItem(KEY_SESI, JSON.stringify(s));
    else localStorage.removeItem(KEY_SESI);
  } catch {
    /* abaikan */
  }
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sesi, setSesiState] = useState<DataSesi | null>(null);
  const [status, setStatus] = useState<Status>('cek');
  const setSesi = useCallback((s: DataSesi | null) => {
    setSesiState(s);
    simpanSesiLokal(s);
    setStatus(s ? 'masuk' : 'keluar');
  }, []);

  const muatUlang = useCallback(async () => {
    try {
      setSesi(await api<DataSesi>('/api/auth/me'));
    } catch (e) {
      if (e instanceof RemoteError && e.status === 401) setSesi(null);
      else {
        // Offline / server tidak terjangkau: pakai sesi terakhir di HP (data tetap aman; dikirim saat online).
        const lokal = bacaSesiLokal();
        setSesiState(lokal);
        setStatus(lokal ? 'offline' : 'keluar');
      }
    }
  }, [setSesi]);

  useEffect(() => {
    void muatUlang();
  }, [muatUlang]);

  useEffect(() => {
    const habis = () => setSesi(null);
    window.addEventListener(EVENT_401, habis);
    return () => window.removeEventListener(EVENT_401, habis);
  }, [setSesi]);

  const masuk = useCallback<Ctx['masuk']>(
    async (kred) => {
      const s = await api<DataSesi>('/api/auth/login', 'POST', kred);
      setSesi(s);
      return s;
    },
    [setSesi],
  );
  const nav = useNavigate();
  const keluar = useCallback(async () => {
    await api('/api/auth/logout', 'POST').catch(() => undefined);
    // Ke /login tanpa "?ke=" — halaman terakhir milik akun ini, bukan akun berikutnya.
    nav('/login', { replace: true });
    setSesi(null);
  }, [setSesi, nav]);
  const gantiSandi = useCallback<Ctx['gantiSandi']>(
    async (lama, baru) => {
      setSesi(await api<DataSesi>('/api/auth/ganti-sandi', 'POST', { lama, baru }));
    },
    [setSesi],
  );

  const value = useMemo(() => ({ status, sesi, masuk, keluar, gantiSandi, muatUlang }), [status, sesi, masuk, keluar, gantiSandi, muatUlang]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): Ctx {
  const c = useContext(AuthCtx);
  if (!c) throw new Error('useAuth di luar AuthProvider');
  return c;
}

/** Izin satu menu: { tambah, lihat, ubah, hapus }. */
export function useIzin(menu: string): Record<Aksi, boolean> {
  const { sesi } = useAuth();
  return useMemo(() => Object.fromEntries(AKSI.map((a) => [a, boleh(sesi?.izin, menu, a)])) as Record<Aksi, boolean>, [sesi, menu]);
}
