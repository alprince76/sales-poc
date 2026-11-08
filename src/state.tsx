import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { indexFaktur, indexMaster, type FakturIndex } from './lib/billing';
import { bacaDataSet, bacaWorkbook, type TipeData } from './lib/parse';
import type { DataSet, MasterToko } from './lib/types';

/** Tanggal default demo (data dummy minggu 9–14 Nov 2026). */
export const DEFAULT_DATE = '2026-11-09';
const STORAGE_KEY = 'svdi-poc-data-v1';
const DUMMY_URL = `${import.meta.env.BASE_URL}Dummy_ROVI_PJP.xlsx`;

interface Persisted extends DataSet {
  /** ISO timestamp (waktu nyata) per tipe data. */
  updatedAt: Record<TipeData, string | null>;
}

function loadStorage(): Persisted | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Persisted;
    if (!Array.isArray(p.master) || !Array.isArray(p.rovi) || !Array.isArray(p.pjp)) return null;
    return p;
  } catch {
    return null;
  }
}

function saveStorage(p: Persisted) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* storage penuh / diblokir — data tetap di memory */
  }
}

async function loadDummy(): Promise<Persisted> {
  const res = await fetch(DUMMY_URL);
  if (!res.ok) throw new Error(`Gagal memuat data dummy (${res.status})`);
  const parsed = bacaDataSet(bacaWorkbook(new Uint8Array(await res.arrayBuffer())));
  const now = new Date().toISOString();
  return {
    master: parsed.master.valid,
    rovi: parsed.rovi.valid,
    pjp: parsed.pjp.valid,
    updatedAt: { master: now, rovi: now, pjp: now },
  };
}

interface Ctx {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  data: DataSet;
  updatedAt: Record<TipeData, string | null>;
  fakturIdx: FakturIndex;
  masterIdx: Map<string, MasterToko>;
  salesmen: { kode: string; nama: string }[];
  replace: <K extends TipeData>(tipe: K, rows: DataSet[K]) => void;
  resetDummy: () => Promise<void>;
}

const DataContext = createContext<Ctx | null>(null);

const EMPTY: Persisted = { master: [], rovi: [], pjp: [], updatedAt: { master: null, rovi: null, pjp: null } };

export function DataProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<Persisted>(() => loadStorage() ?? EMPTY);
  const [status, setStatus] = useState<Ctx['status']>(() => (loadStorage() ? 'ready' : 'loading'));
  const [error, setError] = useState<string | null>(null);

  const resetDummy = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const p = await loadDummy();
      setStore(p);
      saveStorage(p);
      setStatus('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    if (status === 'loading' && !loadStorage()) void resetDummy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const replace = useCallback<Ctx['replace']>((tipe, rows) => {
    setStore((prev) => {
      const next: Persisted = { ...prev, [tipe]: rows, updatedAt: { ...prev.updatedAt, [tipe]: new Date().toISOString() } };
      saveStorage(next);
      return next;
    });
  }, []);

  const value = useMemo<Ctx>(() => {
    const data: DataSet = { master: store.master, rovi: store.rovi, pjp: store.pjp };
    const seen = new Map<string, string>();
    for (const r of [...data.master, ...data.pjp]) if (!seen.has(r.kode_salesman)) seen.set(r.kode_salesman, r.nama_salesman);
    const salesmen = [...seen].map(([kode, nama]) => ({ kode, nama })).sort((a, b) => a.kode.localeCompare(b.kode));
    return {
      status,
      error,
      data,
      updatedAt: store.updatedAt,
      fakturIdx: indexFaktur(data.rovi),
      masterIdx: indexMaster(data.master),
      salesmen,
      replace,
      resetDummy,
    };
  }, [store, status, error, replace, resetDummy]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): Ctx {
  const c = useContext(DataContext);
  if (!c) throw new Error('useData di luar DataProvider');
  return c;
}

/** "9 Nov 2026, 06:30" (waktu Asia/Jakarta). */
export function formatTimestamp(iso: string | null): string {
  if (!iso) return 'belum pernah';
  const d = new Date(iso);
  const tgl = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric' })
    .format(d)
    .replace('.', '');
  const jam = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false })
    .format(d)
    .replace('.', ':');
  return `${tgl}, ${jam}`;
}

/** Timestamp terbaru dari ROVI/PJP (data yang dipakai sales). */
export function latestUpdate(u: Record<TipeData, string | null>): string | null {
  return [u.rovi, u.pjp, u.master].filter(Boolean).sort().pop() ?? null;
}
