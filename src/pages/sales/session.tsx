import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { DEFAULT_DATE, useData, type Channel } from '../../state';

const KEY = 'svdi-v2-sales-session';

interface Session {
  kode: string;
  setKode: (k: string) => void;
  D: string;
  setD: (d: string) => void;
  nama: string;
  /** SR untuk channel aplikasi ini. */
  salesmen: { kode: string; nama: string; channel: Channel }[];
}

const Ctx = createContext<Session | null>(null);

function read(key: string): { kode: string; D: string } {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? '{}');
    return { kode: typeof v.kode === 'string' ? v.kode : '', D: typeof v.D === 'string' ? v.D : DEFAULT_DATE };
  } catch {
    return { kode: '', D: DEFAULT_DATE };
  }
}

/** SR yang dipilih (pengganti login) + tanggal kunjungan aktif. Disimpan per perangkat. */
export function SalesSessionProvider({ children, channel = 'GT', storageKey = KEY }: { children: ReactNode; channel?: Channel; storageKey?: string }) {
  const { salesmen: semua } = useData();
  const salesmen = semua.filter((x) => x.channel === channel);
  const [s, setS] = useState(() => read(storageKey));

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(s));
    } catch {
      /* abaikan */
    }
  }, [s, storageKey]);

  useEffect(() => {
    if (salesmen.length && !salesmen.some((x) => x.kode === s.kode)) setS((p) => ({ ...p, kode: salesmen[0].kode }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salesmen.map((x) => x.kode).join(), s.kode]);

  const nama = salesmen.find((x) => x.kode === s.kode)?.nama ?? s.kode;
  return (
    <Ctx.Provider value={{ kode: s.kode, D: s.D, nama, salesmen, setKode: (kode) => setS((p) => ({ ...p, kode })), setD: (D) => setS((p) => ({ ...p, D })) }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSalesSession(): Session {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSalesSession di luar provider');
  return c;
}
