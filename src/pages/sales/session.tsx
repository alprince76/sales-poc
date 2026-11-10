import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { DEFAULT_DATE, useData } from '../../state';

const KEY = 'svdi-v2-sales-session';

interface Session {
  kode: string;
  setKode: (k: string) => void;
  D: string;
  setD: (d: string) => void;
  nama: string;
}

const Ctx = createContext<Session | null>(null);

function read(): { kode: string; D: string } {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return { kode: typeof v.kode === 'string' ? v.kode : '', D: typeof v.D === 'string' ? v.D : DEFAULT_DATE };
  } catch {
    return { kode: '', D: DEFAULT_DATE };
  }
}

/** SR yang dipilih (pengganti login) + tanggal kunjungan aktif. Disimpan per perangkat. */
export function SalesSessionProvider({ children }: { children: ReactNode }) {
  const { salesmen } = useData();
  const [s, setS] = useState(read);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* abaikan */
    }
  }, [s]);

  useEffect(() => {
    if (salesmen.length && !salesmen.some((x) => x.kode === s.kode)) setS((p) => ({ ...p, kode: salesmen[0].kode }));
  }, [salesmen, s.kode]);

  const nama = salesmen.find((x) => x.kode === s.kode)?.nama ?? s.kode;
  return (
    <Ctx.Provider value={{ kode: s.kode, D: s.D, nama, setKode: (kode) => setS((p) => ({ ...p, kode })), setD: (D) => setS((p) => ({ ...p, D })) }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSalesSession(): Session {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSalesSession di luar provider');
  return c;
}
