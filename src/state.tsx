import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { indexFaktur, indexMaster, normKode, type FakturIndex } from './lib/billing';
import { applyPenagihan } from './lib/collection';
import { indexMsl, indexTransaksi, type IndexTransaksi } from './lib/msl';
import { gabungProduk, type ProdukLengkap } from './lib/order';
import { bacaDataSet, bacaWorkbook, SEMUA_TIPE, type TipeData } from './lib/parse';
import type {
  Aktivitas,
  CekStok,
  DataSet,
  HasilLangkah,
  LangkahKunjungan,
  MasterToko,
  Penagihan,
  PurchaseOrder,
} from './lib/types';
import { selesaikan, tandaiLangkah } from './lib/visit';

/** Tanggal default demo (data dummy minggu 9–14 Nov 2026). */
export const DEFAULT_DATE = '2026-11-09';
const DUMMY_URL = `${import.meta.env.BASE_URL}Dummy_ROVI_PJP.xlsx`;
const KEY_META = 'svdi-v2-meta';
const KEY_DATA = (t: TipeData) => `svdi-v2-data-${t}`;
const KEY_AKT = 'svdi-v2-aktivitas';
const KEY_KERANJANG = 'svdi-v2-keranjang-mt';

export type Channel = 'GT' | 'MT';
/** kode_toko → (kode_sku → qty). */
export type KeranjangMT = Record<string, Record<string, number>>;

type Sumber = 'dummy' | 'upload';
interface Meta {
  sumber: Record<TipeData, Sumber>;
  updatedAt: Record<TipeData, string | null>;
}

const semua = <V,>(v: V) => Object.fromEntries(SEMUA_TIPE.map((t) => [t, v])) as Record<TipeData, V>;
const EMPTY_DATA: DataSet = { master: [], rovi: [], pjp: [], produk: [], rules: [], histori: [], msl: [], price: [] };
const EMPTY_AKT: Aktivitas = { penagihan: [], stok: [], po: [], kunjungan: [] };

function lsGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function lsSet(key: string, v: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
}
function lsDel(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* abaikan */
  }
}

async function fetchDummy(): Promise<DataSet> {
  const res = await fetch(DUMMY_URL);
  if (!res.ok) throw new Error(`Gagal memuat data dummy (${res.status})`);
  const p = bacaDataSet(bacaWorkbook(new Uint8Array(await res.arrayBuffer())));
  return { master: p.master.valid, rovi: p.rovi.valid, pjp: p.pjp.valid, produk: p.produk.valid, rules: p.rules.valid, histori: p.histori.valid, msl: p.msl.valid, price: p.price.valid };
}

export function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

interface Ctx {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  /** Data mentah (ROVI asli dari upload). */
  raw: DataSet;
  /** Data dengan ROVI efektif (sudah dikurangi Paid/Partial). Dipakai semua tampilan. */
  data: DataSet;
  updatedAt: Record<TipeData, string | null>;
  sumber: Record<TipeData, Sumber>;
  /** True bila sebagian data upload tidak muat di localStorage (hanya di memory). */
  storageWarning: boolean;
  fakturIdx: FakturIndex;
  masterIdx: Map<string, MasterToko>;
  /** Produk dengan harga GT (Price List GT → Master SKU). */
  produk: ProdukLengkap[];
  /** Produk dengan harga MT (Price List MT → Master SKU). */
  produkMT: ProdukLengkap[];
  salesmen: { kode: string; nama: string; channel: Channel }[];
  /** Channel per kode toko (default GT). */
  channelToko: (kodeToko: string) => Channel;
  mslIdx: Map<string, Set<string>>;
  /** Histori + PO aplikasi → dasar warning MSL yang dinamis. */
  trxIdx: IndexTransaksi;
  aktivitas: Aktivitas;
  keranjang: KeranjangMT;
  setQtyKeranjang: (toko: string, sku: string, qty: number) => void;
  kosongkanKeranjang: (toko: string) => void;

  replace: <K extends TipeData>(tipe: K, rows: DataSet[K]) => void;
  resetDummy: () => Promise<void>;
  resetAktivitas: () => void;
  tambahPenagihan: (p: Penagihan) => void;
  simpanStok: (s: CekStok) => void;
  submitPO: (po: Omit<PurchaseOrder, 'no_po'>) => PurchaseOrder;
  tandai: (sales: string, toko: string, D: string, langkah: LangkahKunjungan, hasil: HasilLangkah) => void;
  selesaikanKunjungan: (sales: string, toko: string, D: string) => void;
}

const DataContext = createContext<Ctx | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [raw, setRaw] = useState<DataSet>(EMPTY_DATA);
  const [meta, setMeta] = useState<Meta>(() => lsGet<Meta>(KEY_META) ?? { sumber: semua<Sumber>('dummy'), updatedAt: semua<string | null>(null) });
  const [aktivitas, setAktivitas] = useState<Aktivitas>(() => ({ ...EMPTY_AKT, ...(lsGet<Aktivitas>(KEY_AKT) ?? {}) }));
  const [keranjang, setKeranjang] = useState<KeranjangMT>(() => lsGet<KeranjangMT>(KEY_KERANJANG) ?? {});
  const [status, setStatus] = useState<Ctx['status']>('loading');
  const [error, setError] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState(false);
  const loaded = useRef(false);

  // Muat awal: data upload dari localStorage, sisanya dari file dummy.
  const load = useCallback(async (m: Meta, forceDummy: boolean) => {
    setStatus('loading');
    setError(null);
    try {
      const next: DataSet = { ...EMPTY_DATA };
      const butuhDummy: TipeData[] = [];
      for (const t of SEMUA_TIPE) {
        const stored = !forceDummy && m.sumber[t] === 'upload' ? lsGet<unknown[]>(KEY_DATA(t)) : null;
        if (stored) (next as Record<TipeData, unknown[]>)[t] = stored;
        else butuhDummy.push(t);
      }
      const now = new Date().toISOString();
      const nm: Meta = { sumber: { ...m.sumber }, updatedAt: { ...m.updatedAt } };
      if (butuhDummy.length) {
        const d = await fetchDummy();
        for (const t of butuhDummy) {
          (next as Record<TipeData, unknown[]>)[t] = d[t];
          nm.sumber[t] = 'dummy';
          if (forceDummy || !nm.updatedAt[t] || m.sumber[t] === 'upload') nm.updatedAt[t] = now;
          lsDel(KEY_DATA(t));
        }
      }
      setRaw(next);
      setMeta(nm);
      lsSet(KEY_META, nm);
      setStatus('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    void load(meta, false);
  }, [load, meta]);

  const resetDummy = useCallback(async () => {
    setStorageWarning(false);
    await load({ sumber: semua<Sumber>('dummy'), updatedAt: semua<string | null>(null) }, true);
  }, [load]);

  const replace = useCallback<Ctx['replace']>((tipe, rows) => {
    setRaw((prev) => ({ ...prev, [tipe]: rows }));
    setMeta((prev) => {
      const nm: Meta = { sumber: { ...prev.sumber, [tipe]: 'upload' }, updatedAt: { ...prev.updatedAt, [tipe]: new Date().toISOString() } };
      lsSet(KEY_META, nm);
      return nm;
    });
    if (!lsSet(KEY_DATA(tipe), rows)) setStorageWarning(true);
  }, []);

  const updateAkt = useCallback((f: (a: Aktivitas) => Aktivitas) => {
    setAktivitas((prev) => {
      const next = f(prev);
      lsSet(KEY_AKT, next);
      return next;
    });
  }, []);

  const updateKeranjang = useCallback((f: (k: KeranjangMT) => KeranjangMT) => {
    setKeranjang((prev) => {
      const next = f(prev);
      lsSet(KEY_KERANJANG, next);
      return next;
    });
  }, []);
  const setQtyKeranjang = useCallback<Ctx['setQtyKeranjang']>(
    (toko, sku, qty) =>
      updateKeranjang((k) => {
        const t = { ...(k[toko] ?? {}) };
        if (qty > 0) t[sku] = qty;
        else delete t[sku];
        return { ...k, [toko]: t };
      }),
    [updateKeranjang],
  );
  const kosongkanKeranjang = useCallback<Ctx['kosongkanKeranjang']>(
    (toko) =>
      updateKeranjang((k) => {
        const { [toko]: _, ...rest } = k;
        void _;
        return rest;
      }),
    [updateKeranjang],
  );

  const resetAktivitas = useCallback(() => {
    updateAkt(() => EMPTY_AKT);
    updateKeranjang(() => ({}));
  }, [updateAkt, updateKeranjang]);
  const tambahPenagihan = useCallback((p: Penagihan) => updateAkt((a) => ({ ...a, penagihan: [...a.penagihan, p] })), [updateAkt]);
  const simpanStok = useCallback(
    (s: CekStok) =>
      updateAkt((a) => ({
        ...a,
        // Satu cek stok per (SR, toko, tanggal): simpan ulang menggantikan.
        stok: [...a.stok.filter((x) => !(x.kode_toko === s.kode_toko && x.kode_salesman === s.kode_salesman && x.tanggal === s.tanggal)), s],
      })),
    [updateAkt],
  );
  const aktRef = useRef(aktivitas);
  aktRef.current = aktivitas;
  const submitPO = useCallback<Ctx['submitPO']>(
    (po) => {
      const [y, m] = po.tanggal.split('-');
      const prefix = `PO/${y}/${m}/`;
      const urut = aktRef.current.po.filter((x) => x.no_po.startsWith(prefix)).length + 1;
      const created: PurchaseOrder = { ...po, no_po: `${prefix}${String(urut).padStart(4, '0')}` };
      updateAkt((a) => ({ ...a, po: [...a.po, created] }));
      return created;
    },
    [updateAkt],
  );
  const tandai = useCallback<Ctx['tandai']>(
    (sales, toko, D, langkah, hasil) => updateAkt((a) => ({ ...a, kunjungan: tandaiLangkah(a.kunjungan, sales, toko, D, langkah, hasil) })),
    [updateAkt],
  );
  const selesaikanKunjungan = useCallback<Ctx['selesaikanKunjungan']>(
    (sales, toko, D) => updateAkt((a) => ({ ...a, kunjungan: selesaikan(a.kunjungan, sales, toko, D, new Date().toISOString()) })),
    [updateAkt],
  );

  const derived = useMemo(() => {
    const data: DataSet = { ...raw, rovi: applyPenagihan(raw.rovi, aktivitas.penagihan) };
    const chToko = new Map<string, Channel>();
    for (const m of data.master) chToko.set(normKode(m.kode_toko), m.channel === 'MT' ? 'MT' : 'GT');
    const channelToko = (k: string): Channel => chToko.get(normKode(k)) ?? 'GT';
    const seen = new Map<string, { nama: string; channel: Channel }>();
    for (const r of [...data.master, ...data.pjp]) {
      const k = normKode(r.kode_salesman);
      if (!seen.has(k)) seen.set(k, { nama: r.nama_salesman, channel: channelToko(r.kode_toko) });
    }
    return {
      data,
      fakturIdx: indexFaktur(data.rovi),
      masterIdx: indexMaster(data.master),
      produk: gabungProduk(data.produk, data.rules, data.price, 'GT'),
      produkMT: gabungProduk(data.produk, data.rules, data.price, 'MT'),
      salesmen: [...seen].map(([kode, v]) => ({ kode, ...v })).sort((a, b) => a.kode.localeCompare(b.kode)),
      channelToko,
      mslIdx: indexMsl(data.msl),
    };
  }, [raw, aktivitas.penagihan]);

  const trxIdx = useMemo(() => indexTransaksi(raw.histori, aktivitas.po), [raw.histori, aktivitas.po]);

  const value: Ctx = {
    status,
    error,
    raw,
    ...derived,
    trxIdx,
    keranjang,
    setQtyKeranjang,
    kosongkanKeranjang,
    updatedAt: meta.updatedAt,
    sumber: meta.sumber,
    storageWarning,
    aktivitas,
    replace,
    resetDummy,
    resetAktivitas,
    tambahPenagihan,
    simpanStok,
    submitPO,
    tandai,
    selesaikanKunjungan,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): Ctx {
  const c = useContext(DataContext);
  if (!c) throw new Error('useData di luar DataProvider');
  return c;
}

/** "9 Nov 2026, 06:30" (waktu Asia/Jakarta). */
export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return 'belum pernah';
  const d = new Date(iso);
  const tgl = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric' })
    .format(d)
    .replace('.', '');
  return `${tgl}, ${formatJam(iso)}`;
}

/** "06:30" (Asia/Jakarta). */
export function formatJam(iso: string): string {
  return new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false })
    .format(new Date(iso))
    .replace('.', ':');
}

/** Timestamp terbaru dari ROVI/PJP/Master (data yang dipakai sales). */
export function latestUpdate(u: Record<TipeData, string | null>): string | null {
  return [u.rovi, u.pjp, u.master].filter(Boolean).sort().pop() ?? null;
}
