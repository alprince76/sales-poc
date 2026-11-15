import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { indexFaktur, indexMaster, normKode, type FakturIndex } from './lib/billing';
import { applyPenagihan } from './lib/collection';
import { indexMsl, indexTransaksi, type IndexTransaksi } from './lib/msl';
import { gabungProduk, type ProdukLengkap } from './lib/order';
import { bacaDataSet, bacaWorkbook, SEMUA_TIPE, type TipeData } from './lib/parse';
import { ambilData, ambilMeta, bandingVersi, hapusData, RemoteError, simpanData, ubahBaris as ubahBarisServer, type MetaServer, type OpBaris } from './lib/remote';
import { terapkan } from './lib/jenisData';
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

/** dummy = file contoh · server = hasil upload admin di server (tersinkron) · lokal = upload hanya di browser ini. */
export type Sumber = 'dummy' | 'server' | 'lokal';
/** Status koneksi ke server data (Netlify Function + DB). */
export type Koneksi = 'cek' | 'server' | 'lokal';
interface Meta {
  sumber: Record<TipeData, Sumber>;
  updatedAt: Record<TipeData, string | null>;
  version: Record<TipeData, number | null>;
}
/** Interval cek pembaruan data dari server (ms). */
export const INTERVAL_SINKRON = 60_000;

const semua = <V,>(v: V) => Object.fromEntries(SEMUA_TIPE.map((t) => [t, v])) as Record<TipeData, V>;
const EMPTY_DATA: DataSet = { master: [], rovi: [], pjp: [], produk: [], rules: [], histori: [], msl: [], price: [] };
const EMPTY_AKT: Aktivitas = { penagihan: [], stok: [], po: [], kunjungan: [] };
const metaKosong = (): Meta => ({ sumber: semua<Sumber>('dummy'), updatedAt: semua<string | null>(null), version: semua<number | null>(null) });
const salinMeta = (m: Meta): Meta => ({ sumber: { ...m.sumber }, updatedAt: { ...m.updatedAt }, version: { ...m.version } });
/** Meta lama (v2: sumber 'upload') → v3. */
function bacaMeta(): Meta {
  const m = lsGet<Partial<Meta>>(KEY_META);
  const base = metaKosong();
  if (!m) return base;
  for (const t of SEMUA_TIPE) {
    const s = m.sumber?.[t] as string | undefined;
    base.sumber[t] = s === 'upload' ? 'lokal' : s === 'server' || s === 'lokal' ? s : 'dummy';
    base.updatedAt[t] = m.updatedAt?.[t] ?? null;
    base.version[t] = m.version?.[t] ?? null;
  }
  return base;
}
const pesan = (e: unknown) => (e instanceof Error ? e.message : String(e));

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
  /** Versi data di server per jenis (null = bukan dari server). */
  versi: Record<TipeData, number | null>;
  koneksi: Koneksi;
  /** Alasan mode lokal (server tidak terjangkau / DB belum diset). */
  infoKoneksi: string | null;
  /** Diisi saat data berubah karena upload admin di perangkat lain (dipakai untuk toast). */
  pembaruan: { id: number; tipe: TipeData[] } | null;
  /** Cek pembaruan dari server sekarang. */
  sinkron: () => Promise<void>;
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

  /**
   * Ganti semua baris satu jenis data (upload Excel / seed). Mode server: ke DB dulu (gagal → throw).
   * hanyaBilaKosong: hanya bila jenis ini belum ada di DB (seed; RemoteError 409 bila sudah ada).
   */
  replace: <K extends TipeData>(tipe: K, rows: DataSet[K], opsi?: { hanyaBilaKosong?: boolean }) => Promise<'server' | 'lokal'>;
  /**
   * CRUD satu baris (Master Data): `indeks` di raw[tipe] (null = tambah), `baru` null = hapus.
   * Optimistic: tampilan langsung berubah; dikirim ke DB berurutan di belakang; gagal → dibatalkan & throw.
   */
  ubahBaris: (tipe: TipeData, indeks: number | null, baru: object | null) => Promise<'server' | 'lokal'>;
  /** Jumlah perubahan yang sedang dikirim ke DB. */
  menyimpan: number;
  /** Kembali ke data dummy. Mode server: semua data di DB dihapus. */
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
  const [meta, setMeta] = useState<Meta>(bacaMeta);
  const [aktivitas, setAktivitas] = useState<Aktivitas>(() => ({ ...EMPTY_AKT, ...(lsGet<Aktivitas>(KEY_AKT) ?? {}) }));
  const [keranjang, setKeranjang] = useState<KeranjangMT>(() => lsGet<KeranjangMT>(KEY_KERANJANG) ?? {});
  const [status, setStatus] = useState<Ctx['status']>('loading');
  const [error, setError] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState(false);
  const [koneksi, setKoneksi] = useState<Koneksi>('cek');
  const [infoKoneksi, setInfoKoneksi] = useState<string | null>(null);
  const [pembaruan, setPembaruan] = useState<Ctx['pembaruan']>(null);
  const loaded = useRef(false);
  const metaRef = useRef(meta);
  metaRef.current = meta;
  const koneksiRef = useRef(koneksi);
  koneksiRef.current = koneksi;
  const statusRef = useRef(status);
  statusRef.current = status;

  const simpanMeta = useCallback((nm: Meta) => {
    metaRef.current = nm;
    setMeta(nm);
    lsSet(KEY_META, nm);
  }, []);
  const cache = useCallback((t: TipeData, rows: unknown[]) => {
    if (!lsSet(KEY_DATA(t), rows)) setStorageWarning(true);
  }, []);

  /** Meta server, atau null (mode lokal) + catat alasannya. */
  const cekServer = useCallback(async (): Promise<MetaServer | null> => {
    try {
      const srv = await ambilMeta();
      setKoneksi('server');
      setInfoKoneksi(null);
      return srv;
    } catch (e) {
      setKoneksi('lokal');
      setInfoKoneksi(pesan(e));
      return null;
    }
  }, []);

  // Muat awal: data server (cache lokal bila versi sama) → upload lokal → file dummy.
  const load = useCallback(
    async (m: Meta) => {
      setStatus('loading');
      setError(null);
      try {
        const srv = await cekServer();
        const next: DataSet = { ...EMPTY_DATA };
        const nm = salinMeta(m);
        const butuhDummy: TipeData[] = [];
        await Promise.all(
          SEMUA_TIPE.map(async (t) => {
            const s = srv?.[t];
            if (s) {
              let rows = m.sumber[t] === 'server' && m.version[t] === s.version ? lsGet<unknown[]>(KEY_DATA(t)) : null;
              if (!rows) {
                try {
                  rows = await ambilData(t);
                  cache(t, rows);
                } catch {
                  rows = null;
                }
              }
              if (rows) {
                (next as Record<TipeData, unknown[]>)[t] = rows;
                nm.sumber[t] = 'server';
                nm.version[t] = s.version;
                nm.updatedAt[t] = s.updatedAt;
                return;
              }
            }
            // Tidak ada di server: pakai upload lokal (atau cache server saat offline).
            const pakaiCache = m.sumber[t] === 'lokal' || (!srv && m.sumber[t] === 'server');
            const lokal = pakaiCache ? lsGet<unknown[]>(KEY_DATA(t)) : null;
            if (lokal) (next as Record<TipeData, unknown[]>)[t] = lokal;
            else butuhDummy.push(t);
          }),
        );
        if (butuhDummy.length) {
          const now = new Date().toISOString();
          const d = await fetchDummy();
          for (const t of butuhDummy) {
            (next as Record<TipeData, unknown[]>)[t] = d[t];
            if (nm.sumber[t] !== 'dummy' || !nm.updatedAt[t]) nm.updatedAt[t] = now;
            nm.sumber[t] = 'dummy';
            nm.version[t] = null;
            lsDel(KEY_DATA(t));
          }
        }
        setRaw(next);
        simpanMeta(nm);
        setStatus('ready');
      } catch (e) {
        setError(pesan(e));
        setStatus('error');
      }
    },
    [cekServer, cache, simpanMeta],
  );

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    void load(metaRef.current);
  }, [load]);

  // Auto-update: cek versi di server tiap INTERVAL_SINKRON + saat tab/aplikasi kembali aktif.
  const sinkronJalan = useRef(false);
  const perluSinkron = useRef(false);
  const sinkron = useCallback(async () => {
    if (statusRef.current !== 'ready' || sinkronJalan.current || pendingRef.current > 0) return;
    sinkronJalan.current = true;
    try {
      const srv = await cekServer();
      if (!srv) return;
      const m = metaRef.current;
      const { unduh, hilang } = bandingVersi(m.version, m.sumber, srv, SEMUA_TIPE);
      if (!unduh.length && !hilang.length) return;
      const patch: Partial<Record<TipeData, unknown[]>> = {};
      const nm = salinMeta(m);
      await Promise.all(
        unduh.map(async (t) => {
          const rows = await ambilData(t);
          patch[t] = rows;
          cache(t, rows);
          nm.sumber[t] = 'server';
          nm.version[t] = srv[t]!.version;
          nm.updatedAt[t] = srv[t]!.updatedAt;
        }),
      );
      if (hilang.length) {
        const d = await fetchDummy();
        const now = new Date().toISOString();
        for (const t of hilang) {
          patch[t] = d[t];
          nm.sumber[t] = 'dummy';
          nm.version[t] = null;
          nm.updatedAt[t] = now;
          lsDel(KEY_DATA(t));
        }
      }
      setRaw((prev) => ({ ...prev, ...patch }) as DataSet);
      simpanMeta(nm);
      setPembaruan({ id: Date.now(), tipe: [...unduh, ...hilang] });
    } catch {
      /* coba lagi di siklus berikutnya */
    } finally {
      sinkronJalan.current = false;
    }
  }, [cekServer, cache, simpanMeta]);

  const sinkronRef = useRef(sinkron);
  sinkronRef.current = sinkron;

  useEffect(() => {
    if (status !== 'ready') return;
    const id = window.setInterval(() => void sinkron(), INTERVAL_SINKRON);
    const aktif = () => {
      if (document.visibilityState === 'visible') void sinkron();
    };
    document.addEventListener('visibilitychange', aktif);
    window.addEventListener('focus', aktif);
    window.addEventListener('online', aktif);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', aktif);
      window.removeEventListener('focus', aktif);
      window.removeEventListener('online', aktif);
    };
  }, [status, sinkron]);

  const resetDummy = useCallback<Ctx['resetDummy']>(
    async () => {
      setStorageWarning(false);
      if (koneksiRef.current === 'server') {
        const srv = await ambilMeta();
        await Promise.all((Object.keys(srv) as TipeData[]).map((t) => hapusData(t)));
      }
      for (const t of SEMUA_TIPE) lsDel(KEY_DATA(t));
      await load(metaKosong());
    },
    [load],
  );

  const replace = useCallback<Ctx['replace']>(
    async (tipe, rows, opsi) => {
      const nm = salinMeta(metaRef.current);
      let mode: 'server' | 'lokal' = 'lokal';
      if (koneksiRef.current === 'server') {
        let info;
        try {
          info = await simpanData(tipe, rows, fetch, opsi?.hanyaBilaKosong ? 0 : undefined);
        } catch (e) {
          if (e instanceof RemoteError && e.status === 409) void sinkronRef.current();
          throw e;
        }
        mode = 'server';
        nm.sumber[tipe] = 'server';
        nm.version[tipe] = info.version;
        nm.updatedAt[tipe] = info.updatedAt;
      } else {
        nm.sumber[tipe] = 'lokal';
        nm.version[tipe] = null;
        nm.updatedAt[tipe] = new Date().toISOString();
      }
      setRaw((prev) => ({ ...prev, [tipe]: rows }));
      simpanMeta(nm);
      cache(tipe, rows);
      return mode;
    },
    [cache, simpanMeta],
  );

  // CRUD per baris: optimistic + antrian berurutan (urutan klik = urutan tulis ke DB).
  const rawRef = useRef(raw);
  rawRef.current = raw;
  const antrian = useRef<Promise<unknown>>(Promise.resolve());
  const [menyimpan, setMenyimpan] = useState(0);
  const pendingRef = useRef(0);
  const ubahBaris = useCallback<Ctx['ubahBaris']>(
    (tipe, indeks, baru) => {
      const sebelum = rawRef.current[tipe] as unknown[];
      const lama = indeks === null ? null : sebelum[indeks];
      const sesudah = terapkan(sebelum, indeks, baru);
      // Tampilan langsung berubah.
      rawRef.current = { ...rawRef.current, [tipe]: sesudah } as DataSet;
      setRaw((prev) => ({ ...prev, [tipe]: sesudah }));

      if (koneksiRef.current !== 'server') {
        const nm = salinMeta(metaRef.current);
        nm.sumber[tipe] = 'lokal';
        nm.version[tipe] = null;
        nm.updatedAt[tipe] = new Date().toISOString();
        simpanMeta(nm);
        cache(tipe, sesudah);
        return Promise.resolve('lokal' as const);
      }

      pendingRef.current++;
      setMenyimpan(pendingRef.current);
      const kirim = async (): Promise<'server'> => {
        const m = metaRef.current;
        const dariServer = m.sumber[tipe] === 'server';
        try {
          // Jenis yang belum ada di DB (masih dummy/lokal) → simpan seluruh baris sekali; berikutnya per baris.
          const op: OpBaris = indeks === null ? { op: 'tambah', baru } : baru ? { op: 'ubah', lama, baru } : { op: 'hapus', lama };
          const info = dariServer ? await ubahBarisServer(tipe, op) : await simpanData(tipe, sesudah);
          const nm = salinMeta(metaRef.current);
          const versiLama = nm.version[tipe];
          nm.sumber[tipe] = 'server';
          nm.version[tipe] = info.version;
          nm.updatedAt[tipe] = info.updatedAt;
          simpanMeta(nm);
          cache(tipe, rawRef.current[tipe] as unknown[]);
          // Ada perubahan admin lain di antara → ambil versi terbaru setelah antrian kosong.
          if (dariServer && versiLama !== null && info.version !== versiLama + 1) perluSinkron.current = true;
          return 'server';
        } catch (e) {
          // Batalkan perubahan tampilan bila belum ditimpa perubahan lain.
          if (rawRef.current[tipe] === sesudah) {
            rawRef.current = { ...rawRef.current, [tipe]: sebelum } as DataSet;
            setRaw((prev) => (prev[tipe] === sesudah ? { ...prev, [tipe]: sebelum } : prev));
          } else perluSinkron.current = true;
          if (e instanceof RemoteError && e.status === 404) perluSinkron.current = true;
          throw e;
        } finally {
          pendingRef.current--;
          setMenyimpan(pendingRef.current);
          if (!pendingRef.current && perluSinkron.current) {
            perluSinkron.current = false;
            void sinkronRef.current();
          }
        }
      };
      const p = antrian.current.then(kirim, kirim);
      antrian.current = p.catch(() => undefined);
      return p;
    },
    [cache, simpanMeta],
  );

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
    versi: meta.version,
    ubahBaris,
    menyimpan,
    koneksi,
    infoKoneksi,
    pembaruan,
    sinkron,
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
