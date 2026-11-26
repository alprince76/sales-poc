import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { indexFaktur, indexMaster, normKode, type FakturIndex } from './lib/billing';
import { applyPenagihan } from './lib/collection';
import { indexMsl, indexTransaksi, type IndexTransaksi } from './lib/msl';
import { gabungProduk, indexAvgOrder, type ProdukLengkap } from './lib/order';
import { bacaDataSet, bacaWorkbook, SEMUA_TIPE, type TipeData } from './lib/parse';
import { ambilData, ambilMeta, bandingVersi, hapusData, RemoteError, simpanData, ubahBaris as ubahBarisServer, type MetaServer, type OpBaris } from './lib/remote';
import { terapkan } from './lib/jenisData';
import {
  bedaAkt,
  buangTerkirim,
  gabungServer,
  kirimAkt,
  nomorPO,
  resetAktServer,
  saringSetelah,
  semuaItem,
  tambahOutbox,
  tarikAkt,
  TUMPANG_SEQ,
  type ItemKirim,
} from './lib/sinkronAktivitas';
import type {
  Aktivitas,
  CekStok,
  DataSet,
  HasilLangkah,
  LangkahKunjungan,
  MasterToko,
  Penagihan,
  PurchaseOrder,
  Retur,
} from './lib/types';
import { selesaikan, tandaiLangkah, type ReasonKunjungan } from './lib/visit';

/** Tanggal default demo (data dummy minggu 9–14 Nov 2026). */
export const DEFAULT_DATE = '2026-11-09';
const DUMMY_URL = `${import.meta.env.BASE_URL}Dummy_ROVI_PJP.xlsx`;
const KEY_META = 'svdi-v2-meta';
const KEY_DATA = (t: TipeData) => `svdi-v2-data-${t}`;
/** Aktivitas & antrean kirim disimpan per akun (HP bisa dipakai bergantian; data akun lain tidak ikut tampil). */
const KEY_AKT_LAMA = 'svdi-v2-aktivitas';
const kunciAkun = (penggunaId: string) => ({
  AKT: `svdi-v2-aktivitas:${penggunaId}`,
  KERANJANG: `svdi-v2-keranjang-mt:${penggunaId}`,
  OUTBOX: `svdi-v2-akt-outbox:${penggunaId}`,
  SINK: `svdi-v2-akt-sinkron:${penggunaId}`,
});

/** Aktivitas awal akun ini: simpanan per akun, atau (sekali) data lama perangkat sebelum ada login — hanya yang dalam lingkup akun. */
function aktivitasAwal(penggunaId: string, lingkup: string[] | null): Aktivitas {
  const k = kunciAkun(penggunaId);
  const ada = lsGet<Aktivitas>(k.AKT);
  if (ada) return { ...EMPTY_AKT, ...ada };
  const lama = lsGet<Aktivitas>(KEY_AKT_LAMA);
  if (!lama) return EMPTY_AKT;
  const boleh = (x: { kode_salesman?: string }) => !lingkup || lingkup.includes(normKode(x.kode_salesman));
  const pindah: Aktivitas = {
    penagihan: (lama.penagihan ?? []).filter(boleh),
    stok: (lama.stok ?? []).filter(boleh),
    po: (lama.po ?? []).filter(boleh),
    kunjungan: (lama.kunjungan ?? []).filter(boleh),
    retur: (lama.retur ?? []).filter(boleh),
  };
  lsSet(k.AKT, pindah);
  lsDel(KEY_AKT_LAMA);
  return pindah;
}
/** Aktivitas lapangan (PO, penagihan, …) ditarik lebih sering daripada master supaya dashboard admin cepat ter-update. */
export const INTERVAL_AKTIVITAS = 15_000;
type SinkAkt = { seq: number; reset: number; migrasi: boolean; terakhir: string | null };

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
const EMPTY_DATA: DataSet = { master: [], rovi: [], pjp: [], produk: [], rules: [], histori: [], msl: [], price: [], avgorder: [] };
const EMPTY_AKT: Aktivitas = { penagihan: [], stok: [], po: [], kunjungan: [], retur: [] };
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
  return { master: p.master.valid, rovi: p.rovi.valid, pjp: p.pjp.valid, produk: p.produk.valid, rules: p.rules.valid, histori: p.histori.valid, msl: p.msl.valid, price: p.price.valid, avgorder: p.avgorder.valid };
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
  /** Avg Order MT: "toko|sku" → Pcs. */
  avgIdx: Map<string, number>;
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
  replace: <K extends TipeData>(
    tipe: K,
    rows: DataSet[K],
    opsi?: {
      hanyaBilaKosong?: boolean;
      /**
       * Upload "tambah & perbarui": hitung ulang baris dari data server terbaru. Bila data di server berubah
       * sejak dimuat (admin lain menyimpan), data terbaru diambil lalu digabung ulang — tidak menimpa perubahan orang lain.
       */
      gabung?: (terbaru: DataSet[K]) => DataSet[K];
    },
  ) => Promise<'server' | 'lokal'>;
  /**
   * CRUD satu baris (Master Data): `indeks` di raw[tipe] (null = tambah), `baru` null = hapus.
   * Optimistic: tampilan langsung berubah; dikirim ke DB berurutan di belakang; gagal → dibatalkan & throw.
   */
  ubahBaris: (tipe: TipeData, indeks: number | null, baru: object | null) => Promise<'server' | 'lokal'>;
  /** Jumlah perubahan yang sedang dikirim ke DB. */
  menyimpan: number;
  /** Kembali ke data dummy. Mode server: semua data di DB dihapus. */
  resetDummy: () => Promise<void>;
  /** Hapus semua aktivitas (di database bila tersambung → semua perangkat). */
  resetAktivitas: () => Promise<'server' | 'lokal'>;
  /** Aktivitas yang tercatat di perangkat ini tapi belum terkirim ke database (offline / gagal kirim). */
  aktTertunda: number;
  /** Terakhir berhasil sinkron aktivitas dengan database (ISO) atau null. */
  aktTerakhir: string | null;
  sinkronAktivitas: () => Promise<void>;
  tambahPenagihan: (p: Penagihan) => void;
  /** Simpan retur (satu per id; simpan ulang dengan id sama = ganti). */
  simpanRetur: (r: Retur) => void;
  hapusRetur: (id: string) => void;
  simpanStok: (s: CekStok) => void;
  submitPO: (po: Omit<PurchaseOrder, 'no_po'>) => PurchaseOrder;
  tandai: (sales: string, toko: string, D: string, langkah: LangkahKunjungan, hasil: HasilLangkah) => void;
  selesaikanKunjungan: (sales: string, toko: string, D: string, reason?: ReasonKunjungan) => void;
}

const DataContext = createContext<Ctx | null>(null);

export function DataProvider({ children, penggunaId, lingkup }: { children: ReactNode; penggunaId: string; lingkup: string[] | null }) {
  const K = useMemo(() => kunciAkun(penggunaId), [penggunaId]);
  const [raw, setRaw] = useState<DataSet>(EMPTY_DATA);
  const [meta, setMeta] = useState<Meta>(bacaMeta);
  const [aktivitas, setAktivitas] = useState<Aktivitas>(() => aktivitasAwal(penggunaId, lingkup));
  const [keranjang, setKeranjang] = useState<KeranjangMT>(() => lsGet<KeranjangMT>(K.KERANJANG) ?? {});
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
        const m0 = metaRef.current;
        const base = opsi?.hanyaBilaKosong ? 0 : opsi?.gabung ? (m0.sumber[tipe] === 'server' ? (m0.version[tipe] ?? 0) : 0) : undefined;
        try {
          info = await simpanData(tipe, rows, fetch, base);
        } catch (e) {
          if (!(e instanceof RemoteError && e.status === 409)) throw e;
          if (!opsi?.gabung) {
            void sinkronRef.current();
            throw e;
          }
          // Data server berubah sejak dimuat → gabung ulang dengan versi terbaru, simpan sekali lagi.
          const [srv, terbaru] = await Promise.all([ambilMeta(), ambilData(tipe)]);
          rows = opsi.gabung(terbaru as DataSet[typeof tipe]);
          info = await simpanData(tipe, rows, fetch, srv[tipe]?.version ?? 0);
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

  // Sinkron aktivitas: segera saat tersambung, tiap INTERVAL_AKTIVITAS, dan saat aplikasi aktif / online lagi.
  useEffect(() => {
    if (status !== 'ready' || koneksi !== 'server') return;
    const jalan = () => void sinkronAktRef.current();
    jalan();
    const id = window.setInterval(jalan, INTERVAL_AKTIVITAS);
    const aktif = () => {
      if (document.visibilityState === 'visible') jalan();
    };
    document.addEventListener('visibilitychange', aktif);
    window.addEventListener('focus', aktif);
    window.addEventListener('online', jalan);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', aktif);
      window.removeEventListener('focus', aktif);
      window.removeEventListener('online', jalan);
    };
  }, [status, koneksi]);

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

  // ── Aktivitas lapangan: simpan di HP (offline-first) + kotak keluar → database; perangkat lain menarik delta ──
  const aktRef = useRef(aktivitas);
  const outboxRef = useRef<ItemKirim[]>(lsGet<ItemKirim[]>(K.OUTBOX) ?? []);
  const [aktTertunda, setAktTertunda] = useState(outboxRef.current.length);
  const sinkAktRef = useRef<SinkAkt>({ seq: 0, reset: 0, migrasi: false, terakhir: null, ...(lsGet<Partial<SinkAkt>>(K.SINK) ?? {}) });
  const [aktTerakhir, setAktTerakhir] = useState<string | null>(sinkAktRef.current.terakhir);

  const setAktLokal = useCallback((next: Aktivitas) => {
    if (next === aktRef.current) return;
    aktRef.current = next;
    lsSet(K.AKT, next);
    setAktivitas(next);
  }, []);
  const setOutbox = useCallback((o: ItemKirim[]) => {
    outboxRef.current = o;
    lsSet(K.OUTBOX, o);
    setAktTertunda(o.length);
  }, []);
  const simpanSinkAkt = useCallback((s: SinkAkt) => {
    sinkAktRef.current = s;
    lsSet(K.SINK, s);
    setAktTerakhir(s.terakhir);
  }, []);

  const aktJalan = useRef(false);
  const aktLagi = useRef(false);
  /** Kirim outbox + tarik perubahan dari perangkat lain. Satu proses sekaligus; panggilan saat berjalan dijadwalkan ulang. */
  const sinkronAktivitas = useCallback(async () => {
    if (aktJalan.current) {
      aktLagi.current = true;
      return;
    }
    aktJalan.current = true;
    try {
      do {
        aktLagi.current = false;
        let s = sinkAktRef.current;
        let h = await tarikAkt(s.seq ? s.seq - TUMPANG_SEQ : 0);
        if (!s.migrasi) {
          // Pertama kali tersambung: kirim aktivitas yang sudah tercatat di HP ini (kecuali yang sebelum reset admin).
          const lama = saringSetelah(aktRef.current, h.reset);
          setAktLokal(lama);
          setOutbox(tambahOutbox(outboxRef.current, semuaItem(lama)));
          s = { ...s, reset: h.reset, migrasi: true };
        } else if (h.reset !== s.reset) {
          // Admin me-reset aktivitas di perangkat lain → buang yang lama, simpan yang dicatat setelah reset.
          const sisa = outboxRef.current.filter((x) => x.t > h.reset);
          setOutbox(sisa);
          setAktLokal(gabungServer(EMPTY_AKT, sisa, []));
          s = { ...s, seq: 0, reset: h.reset };
          h = await tarikAkt(0);
        }
        for (;;) {
          setAktLokal(gabungServer(aktRef.current, h.items, outboxRef.current));
          const akhir = h.items.length ? h.items[h.items.length - 1].seq : s.seq;
          s = { ...s, seq: h.lanjut ? akhir : Math.max(h.seq, s.seq) };
          if (!h.lanjut) break;
          h = await tarikAkt(s.seq);
        }
        while (outboxRef.current.length) {
          const kirim = outboxRef.current.slice(0, 500);
          await kirimAkt(kirim);
          setOutbox(buangTerkirim(outboxRef.current, kirim));
        }
        simpanSinkAkt({ ...s, terakhir: new Date().toISOString() });
      } while (aktLagi.current);
    } catch {
      /* offline / server bermasalah → tetap di outbox, dicoba lagi nanti */
    } finally {
      aktJalan.current = false;
    }
  }, [setAktLokal, setOutbox, simpanSinkAkt]);
  const sinkronAktRef = useRef(sinkronAktivitas);
  sinkronAktRef.current = sinkronAktivitas;

  const updateAkt = useCallback(
    (f: (a: Aktivitas) => Aktivitas) => {
      const prev = aktRef.current;
      const next = f(prev);
      if (next === prev) return;
      setAktLokal(next);
      setOutbox(tambahOutbox(outboxRef.current, bedaAkt(prev, next)));
      void sinkronAktRef.current();
    },
    [setAktLokal, setOutbox],
  );

  const updateKeranjang = useCallback((f: (k: KeranjangMT) => KeranjangMT) => {
    setKeranjang((prev) => {
      const next = f(prev);
      lsSet(K.KERANJANG, next);
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

  const resetAktivitas = useCallback<Ctx['resetAktivitas']>(async () => {
    let mode: 'server' | 'lokal' = 'lokal';
    if (koneksiRef.current === 'server') {
      const r = await resetAktServer();
      simpanSinkAkt({ seq: 0, reset: r.reset, migrasi: true, terakhir: new Date().toISOString() });
      mode = 'server';
    }
    setOutbox([]);
    setAktLokal(EMPTY_AKT);
    updateKeranjang(() => ({}));
    return mode;
  }, [setAktLokal, setOutbox, simpanSinkAkt, updateKeranjang]);
  const simpanRetur = useCallback(
    (r: Retur) => updateAkt((a) => ({ ...a, retur: [...(a.retur ?? []).filter((x) => x.id !== r.id), r] })),
    [updateAkt],
  );
  const hapusRetur = useCallback((id: string) => updateAkt((a) => ({ ...a, retur: (a.retur ?? []).filter((x) => x.id !== id) })), [updateAkt]);
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
  const submitPO = useCallback<Ctx['submitPO']>(
    (po) => {
      const created: PurchaseOrder = { ...po, no_po: nomorPO(aktRef.current.po, po.kode_salesman, po.tanggal) };
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
    (sales, toko, D, reason) => updateAkt((a) => ({ ...a, kunjungan: selesaikan(a.kunjungan, sales, toko, D, new Date().toISOString(), reason) })),
    [updateAkt],
  );

  const lingkupKey = lingkup ? lingkup.map(normKode).join('|') : null;
  const derived = useMemo(() => {
    const data: DataSet = { ...raw, rovi: applyPenagihan(raw.rovi, aktivitas.penagihan, aktivitas.retur) };
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
      // Lingkup akun: hanya SR yang boleh dilihat (akun sales = dirinya sendiri).
      salesmen: [...seen]
        .filter(([kode]) => !lingkupKey || lingkupKey.split('|').includes(kode))
        .map(([kode, v]) => ({ kode, ...v }))
        .sort((a, b) => a.kode.localeCompare(b.kode)),
      channelToko,
      mslIdx: indexMsl(data.msl),
      avgIdx: indexAvgOrder(data.avgorder),
    };
  }, [raw, aktivitas.penagihan, aktivitas.retur, lingkupKey]);

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
    aktTertunda,
    aktTerakhir,
    sinkronAktivitas,
    tambahPenagihan,
    simpanRetur,
    hapusRetur,
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
