import { AlertTriangle, ArrowLeft, Check, CheckCircle2, History, Info, PackagePlus, Plus, Sparkles, Trash2, Wallet } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { HarusDitagih, InfoOutlet, KelompokFaktur, useDetailToko } from '../../components/DetailTokoView';
import { PenagihanSheet } from '../../components/Penagihan';
import { Badge, Button, Card, cn, EmptyState, Input, NumberStepper, SectionTitle, Segmented, Sheet, StatusBayarBadge, useToast } from '../../components/ui';
import { QtyUnit, UnitToggle } from '../../components/QtyUnit';
import { SkuPicker } from '../../components/SkuPicker';
import { normKode, type FakturDinilai } from '../../lib/billing';
import { ringkasPenagihan } from '../../lib/collection';
import { formatTanggal } from '../../lib/dates';
import { formatRupiah } from '../../lib/format';
import { formatQty, historiToko, labelMoq, suggestedQty, teksBiasaOrder, validasiPO, type HistoriSku, type ProdukLengkap } from '../../lib/order';
import { daftarSkuStok, validasiStok } from '../../lib/stock';
import type { ItemPO, LangkahKunjungan, StokInternal, StokKompetitor } from '../../lib/types';
import { cariKunjungan, isSelesai, LABEL_LANGKAH, LANGKAH } from '../../lib/visit';
import { newId, useData } from '../../state';
import { useSalesSession } from './session';

type Step = LangkahKunjungan | 'selesai';
const STEPS: Step[] = [...LANGKAH, 'selesai'];

/** Bar aksi menempel di bawah layar. */
export function ActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 shadow-bar backdrop-blur pb-safe">
      <div className="mx-auto flex max-w-md items-center gap-2 px-4 py-3">{children}</div>
    </div>
  );
}

export function VisitPage() {
  const { kode: kodeParam = '' } = useParams();
  const kodeToko = normKode(decodeURIComponent(kodeParam));
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const { kode: sales, D } = useSalesSession();
  const { aktivitas, masterIdx, data } = useData();
  const d = useDetailToko(kodeToko, D);
  const status = cariKunjungan(aktivitas.kunjungan, sales, kodeToko, D);
  const selesai = isSelesai(status);
  const step = (STEPS.includes(sp.get('step') as Step) ? sp.get('step') : 'collection') as Step;
  const go = (s: Step) => {
    setSp({ step: s }, { replace: true });
    window.scrollTo({ top: 0 });
  };
  const terjadwal = data.pjp.some((p) => normKode(p.kode_salesman) === sales && p.kode_toko === kodeToko && p.tanggal_kunjungan === D);

  if (!masterIdx.has(kodeToko) && !d.faktur.length) {
    return (
      <div className="mx-auto max-w-md p-4">
        <EmptyState title="Toko tidak ditemukan" action={<Button onClick={() => nav('/sales')}>Kembali ke Rute</Button>}>
          Kode {kodeToko}
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-slate-50 pb-28">
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-md px-4 pb-3 pt-2">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => nav(-1)} aria-label="Kembali" className="-ml-2 flex h-10 w-10 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100">
              <ArrowLeft size={20} />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-bold leading-tight text-slate-900">{d.nama_toko}</h1>
              <p className="truncate text-xs text-slate-500">
                {d.kode_toko}
                {d.area && ` · ${d.area}`} · {formatTanggal(D)}
              </p>
            </div>
            {selesai ? <Badge tone="green">Selesai</Badge> : !terjadwal ? <Badge tone="orange" dot={false}>Non Route</Badge> : null}
          </div>
          <Stepper step={step} status={status?.langkah ?? {}} selesai={selesai} onGo={go} />
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-3 px-4 py-4">
        {step === 'collection' && <CollectionStep kodeToko={kodeToko} onNext={() => go('stok')} />}
        {step === 'stok' && <StokStep kodeToko={kodeToko} onNext={() => go('po')} />}
        {step === 'po' && <POStep kodeToko={kodeToko} onNext={() => go('selesai')} />}
        {step === 'selesai' && <SelesaiStep kodeToko={kodeToko} onGo={go} />}
      </main>
    </div>
  );
}

function Stepper({ step, status, selesai, onGo }: { step: Step; status: Partial<Record<LangkahKunjungan, string>>; selesai: boolean; onGo: (s: Step) => void }) {
  return (
    <ol className="mt-2 grid grid-cols-4 gap-1">
      {STEPS.map((s, i) => {
        const hasil = s === 'selesai' ? (selesai ? 'SELESAI' : undefined) : status[s];
        const active = s === step;
        return (
          <li key={s}>
            <button type="button" onClick={() => onGo(s)} aria-current={active ? 'step' : undefined} className="group flex w-full flex-col items-center gap-1 rounded-lg py-1">
              <span className="flex w-full items-center">
                <span className={cn('h-0.5 flex-1', i === 0 ? 'bg-transparent' : hasil || active ? 'bg-brand-300' : 'bg-slate-200')} />
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-2 ring-white transition-colors',
                    hasil === 'SELESAI' ? 'bg-emerald-500 text-white' : hasil === 'DILEWATI' ? 'bg-slate-300 text-white' : active ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500',
                  )}
                >
                  {hasil === 'SELESAI' ? <Check size={14} strokeWidth={3} /> : hasil === 'DILEWATI' ? '–' : i + 1}
                </span>
                <span className={cn('h-0.5 flex-1', i === STEPS.length - 1 ? 'bg-transparent' : hasil ? 'bg-brand-300' : 'bg-slate-200')} />
              </span>
              <span className={cn('text-[11px] font-medium leading-none', active ? 'text-brand-700' : 'text-slate-500')}>{s === 'selesai' ? 'Selesai' : s === 'po' ? 'PO' : s === 'stok' ? 'Stok' : 'Collection'}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

// ───────────────────────── 1. Collection ─────────────────────────

function CollectionStep({ kodeToko, onNext }: { kodeToko: string; onNext: () => void }) {
  const { kode: sales, D } = useSalesSession();
  const { aktivitas, tandai } = useData();
  const d = useDetailToko(kodeToko, D);
  const [aktif, setAktif] = useState<FakturDinilai | null>(null);
  const log = aktivitas.penagihan.filter((p) => p.kode_toko === kodeToko && p.tanggal === D && p.kode_salesman === sales);
  const rp = ringkasPenagihan(log);

  const lanjut = () => {
    tandai(sales, kodeToko, D, 'collection', log.length || !d.perluDitagih ? 'SELESAI' : 'DILEWATI');
    onNext();
  };

  return (
    <>
      <InfoOutlet kodeToko={kodeToko} D={D} outstanding={d.totalOutstanding} />
      <HarusDitagih d={d} />
      {log.length > 0 && (
        <Card className="p-4">
          <SectionTitle right={<span className="font-semibold text-emerald-700">{formatRupiah(rp.terkumpul)}</span>}>Dicatat kunjungan ini</SectionTitle>
          <ul className="space-y-1.5">
            {log.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-[13px] text-slate-600">{p.no_faktur}</span>
                <StatusBayarBadge p={p} />
              </li>
            ))}
          </ul>
        </Card>
      )}
      {d.faktur.length > 0 && <p className="px-1 text-xs text-slate-500">Ketuk faktur untuk update status penagihan.</p>}
      <KelompokFaktur d={d} onPilih={setAktif} />
      <PenagihanSheet faktur={aktif} kodeSalesman={sales} D={D} onClose={() => setAktif(null)} />
      <ActionBar>
        <Button block size="lg" onClick={lanjut}>
          Lanjut ke Cek Stok
        </Button>
      </ActionBar>
    </>
  );
}

// ───────────────────────── 2. Cek Stok ─────────────────────────

function StokStep({ kodeToko, onNext }: { kodeToko: string; onNext: () => void }) {
  const { kode: sales, D } = useSalesSession();
  const { data, produk, aktivitas, simpanStok, tandai } = useData();
  const toast = useToast();
  const existing = aktivitas.stok.find((s) => s.kode_toko === kodeToko && s.kode_salesman === sales && s.tanggal === D);
  const hist = useMemo(() => historiToko(data.histori, kodeToko, D), [data.histori, kodeToko, D]);
  const kandidat = useMemo(() => daftarSkuStok(produk, hist).filter((p) => p.status_aktif !== false), [produk, hist]);
  const byKode = useMemo(() => new Map(produk.map((p) => [p.kode_sku, p])), [produk]);
  const [tab, setTab] = useState<'internal' | 'kompetitor'>('internal');
  // Baris stok: dari cek stok sebelumnya, atau default SKU yang pernah dibeli toko.
  const [stok, setStok] = useState<StokInternal[]>(() =>
    existing?.internal.length ? existing.internal : kandidat.filter((p) => p.pernahDibeli).map((p) => ({ kode_sku: p.kode_sku, display: 0, backroom: 0 })),
  );
  // Kompetitor: dari cek stok hari ini, atau otomatis dari cek stok terakhir toko (nama produk saja, qty 0).
  const [komp, setKomp] = useState<StokKompetitor[]>(() => {
    if (existing?.kompetitor.length) return existing.kompetitor;
    const sebelum = aktivitas.stok
      .filter((s) => s.kode_toko === kodeToko && s.tanggal < D && s.kompetitor.length)
      .sort((a, b) => b.tanggal.localeCompare(a.tanggal) || b.createdAt.localeCompare(a.createdAt))[0];
    return sebelum ? sebelum.kompetitor.map((k) => ({ nama_produk: k.nama_produk, qty: 0, satuan_input: k.satuan_input ?? 'PCS' })) : [{ nama_produk: '', qty: 0, satuan_input: 'PCS' }];
  });
  const kompOtomatis = !existing?.kompetitor.length && komp.some((k) => k.nama_produk);
  const [err, setErr] = useState<string[]>([]);
  const terpilih = new Set(stok.map((s) => s.kode_sku));

  const tambah = (kode: string) => setStok((x) => (x.some((s) => s.kode_sku === kode) ? x : [{ kode_sku: kode, display: 0, backroom: 0 }, ...x]));
  const set = (kode: string, k: 'display' | 'backroom', v: number) => setStok((x) => x.map((s) => (s.kode_sku === kode ? { ...s, [k]: v } : s)));
  const terisi = stok.filter((s) => s.display || s.backroom).length;
  const jumlahKomp = komp.filter((k) => k.nama_produk.trim()).length;

  const simpan = () => {
    const v = validasiStok(stok, komp);
    setErr(v.error);
    if (v.error.length) return;
    simpanStok({ id: existing?.id ?? newId(), kode_toko: kodeToko, kode_salesman: sales, tanggal: D, internal: v.internal, kompetitor: v.kompetitor, createdAt: new Date().toISOString() });
    tandai(sales, kodeToko, D, 'stok', 'SELESAI');
    toast('Stok tersimpan');
    onNext();
  };
  const lewati = () => {
    tandai(sales, kodeToko, D, 'stok', 'DILEWATI');
    onNext();
  };

  if (!produk.length) {
    return (
      <>
        <EmptyState title="Master SKU belum tersedia">Admin perlu upload data Master SKU.</EmptyState>
        <ActionBar>
          <Button block size="lg" variant="secondary" onClick={lewati}>
            Lewati
          </Button>
        </ActionBar>
      </>
    );
  }

  return (
    <>
      <Segmented
        block
        label="Jenis stok"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'internal', label: `Produk Tigaraksa${terisi ? ` (${terisi})` : ''}` },
          { value: 'kompetitor', label: `Kompetitor${jumlahKomp ? ` (${jumlahKomp})` : ''}` },
        ]}
      />
      {err.length > 0 && (
        <div role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {err[0]}
        </div>
      )}

      {tab === 'internal' ? (
        <>
          <SkuPicker produk={kandidat} terpilih={terpilih} onPilih={(p) => tambah(p.kode_sku)} label="Cari SKU untuk cek stok" />
          {stok.length === 0 ? (
            <EmptyState title="Belum ada SKU">Cari SKU berdasarkan kode atau nama, lalu isi stok display & backroom.</EmptyState>
          ) : (
            <>
              <p className="px-1 text-xs text-slate-500">{stok.length} SKU · SKU yang pernah dibeli toko otomatis ditambahkan.</p>
              <ul className="space-y-2">
                {stok.map((s) => {
                  const p = byKode.get(s.kode_sku);
                  return (
                    <li key={s.kode_sku}>
                      <Card className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold leading-snug text-slate-900">{p?.nama_sku ?? s.kode_sku}</div>
                            <div className="text-xs text-slate-500">
                              {s.kode_sku}
                              {p && ` · ${p.divisi}`}
                            </div>
                          </div>
                          <button
                            type="button"
                            aria-label={`Hapus ${p?.nama_sku ?? s.kode_sku}`}
                            onClick={() => setStok((x) => x.filter((y) => y.kode_sku !== s.kode_sku))}
                            className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                        <div className="mt-2.5 space-y-2">
                          {(['display', 'backroom'] as const).map((k) => (
                            <div key={k} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                              <span className="text-xs font-medium text-slate-500">{k === 'display' ? 'Display (pajangan)' : 'Backroom (gudang)'}</span>
                              <QtyUnit label={`${k} ${p?.nama_sku ?? s.kode_sku}`} value={s[k]} isi={p?.isi_karton} satuan={p?.satuan} onChange={(v) => set(s.kode_sku, k, v)} />
                            </div>
                          ))}
                        </div>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      ) : (
        <>
          <p className="px-1 text-sm text-slate-600">
            Catat produk kompetitor yang ada di toko sebagai pembanding pangsa pasar.
            {kompOtomatis && <span className="mt-1 block text-xs text-brand-700">Daftar produk diisi otomatis dari cek stok sebelumnya. Isi qty terbaru.</span>}
          </p>
          <ul className="space-y-2">
            {komp.map((k, i) => (
              <li key={i}>
                <Card className="p-3">
                  <div className="flex items-end gap-2">
                    <label className="min-w-0 flex-1">
                      <span className="mb-1 block text-xs font-medium text-slate-500">Nama produk</span>
                      <Input value={k.nama_produk} placeholder="mis. Haribo Goldbears 100gr" onChange={(e) => setKomp((x) => x.map((y, j) => (j === i ? { ...y, nama_produk: e.target.value } : y)))} />
                    </label>
                    <button type="button" aria-label="Hapus baris" onClick={() => setKomp((x) => x.filter((_, j) => j !== i))} className="mb-1 flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600">
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-500">Qty</span>
                    <div className="flex items-center gap-1.5">
                      <NumberStepper label={`qty kompetitor ${i + 1}`} value={k.qty} onChange={(v) => setKomp((x) => x.map((y, j) => (j === i ? { ...y, qty: v } : y)))} />
                      <UnitToggle label={`kompetitor ${i + 1}`} value={k.satuan_input ?? 'PCS'} onChange={(u) => setKomp((x) => x.map((y, j) => (j === i ? { ...y, satuan_input: u } : y)))} />
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
          <Button variant="secondary" block onClick={() => setKomp((x) => [...x, { nama_produk: '', qty: 0, satuan_input: 'PCS' }])}>
            <Plus size={16} /> Tambah produk kompetitor
          </Button>
        </>
      )}

      <ActionBar>
        <Button variant="secondary" size="lg" onClick={lewati}>
          Lewati
        </Button>
        <Button block size="lg" onClick={simpan}>
          Simpan & Lanjut
        </Button>
      </ActionBar>
    </>
  );
}

// ───────────────────────── 3. Purchase Order ─────────────────────────

/** Info histori yang mudah dibaca: "Biasa order ±4 Pcs/bulan · Terakhir 6 Pcs, 20 Okt 2026". */
export function InfoHistori({ h, p }: { h?: HistoriSku; p: ProdukLengkap }) {
  if (!h) return null;
  const biasa = teksBiasaOrder(suggestedQty(h, p), p.satuan);
  return (
    <p className="text-xs text-slate-500">
      {biasa && <span className="font-medium text-slate-700">{biasa}</span>}
      {biasa && ' · '}Terakhir {formatQty(h.qtyTerakhir, p)}, {formatTanggal(h.terakhir)}
    </p>
  );
}

function POStep({ kodeToko, onNext }: { kodeToko: string; onNext: () => void }) {
  const { kode: sales, D } = useSalesSession();
  const { data, produk, masterIdx, aktivitas, submitPO, tandai } = useData();
  const toast = useToast();
  const d = useDetailToko(kodeToko, D);
  const outlet = masterIdx.get(kodeToko);
  const aktifProduk = useMemo(() => produk.filter((p) => p.status_aktif !== false), [produk]);
  const byKode = useMemo(() => new Map(produk.map((p) => [p.kode_sku, p])), [produk]);
  const hist = useMemo(() => historiToko(data.histori, kodeToko, D), [data.histori, kodeToko, D]);
  const histMap = useMemo(() => new Map(hist.map((h) => [h.kode_sku, h])), [hist]);
  const [keranjang, setKeranjang] = useState<Record<string, number>>({});
  const [urutanItem, setUrutanItem] = useState<string[]>([]);
  const [konfirmasi, setKonfirmasi] = useState(false);
  const poHariIni = aktivitas.po.filter((p) => p.kode_toko === kodeToko && p.tanggal === D);

  const v = validasiPO(keranjang, produk, outlet, d.totalOutstanding);
  const diKeranjang = new Set(Object.keys(keranjang).filter((k) => keranjang[k] > 0));
  const langganan = hist.filter((h) => byKode.get(h.kode_sku) && byKode.get(h.kode_sku)!.status_aktif !== false && !diKeranjang.has(h.kode_sku));

  // Input manual per satuan: tambah SKU selalu mulai dari 1; MOQ & "biasa order" hanya informasi.
  const tambah = (p: ProdukLengkap, qty = 1) => {
    setKeranjang((k) => ({ ...k, [p.kode_sku]: k[p.kode_sku] || qty }));
    setUrutanItem((u) => (u.includes(p.kode_sku) ? u : [p.kode_sku, ...u]));
  };
  const setQty = (kode: string, n: number) => setKeranjang((k) => ({ ...k, [kode]: n }));
  const hapus = (kode: string) => {
    setKeranjang(({ [kode]: _, ...rest }) => (void _, rest));
    setUrutanItem((u) => u.filter((x) => x !== kode));
  };
  const isiSaran = () => {
    for (const h of langganan) tambah(byKode.get(h.kode_sku)!);
  };

  const kirim = () => {
    const po = submitPO({
      id: newId(),
      kode_toko: kodeToko,
      kode_salesman: sales,
      tanggal: D,
      items: v.items,
      total: v.total,
      status: 'TERKIRIM',
      ...(v.kredit.peringatan ? { berpotensi_tidak_release: true } : {}),
      createdAt: new Date().toISOString(),
    });
    tandai(sales, kodeToko, D, 'po', 'SELESAI');
    setKonfirmasi(false);
    setKeranjang({});
    setUrutanItem([]);
    toast(`${po.no_po} berhasil disubmit`);
    onNext();
  };
  const lewati = () => {
    tandai(sales, kodeToko, D, 'po', 'DILEWATI');
    onNext();
  };

  if (!produk.length) {
    return (
      <>
        <EmptyState title="Master SKU belum tersedia">Admin perlu upload data Master SKU & Order Rules.</EmptyState>
        <ActionBar>
          <Button block size="lg" variant="secondary" onClick={lewati}>
            Lewati
          </Button>
        </ActionBar>
      </>
    );
  }

  const items = urutanItem.filter((k) => diKeranjang.has(k) || keranjang[k] === 0).map((k) => byKode.get(k)!).filter(Boolean);

  return (
    <>
      {v.kredit.peringatan && <BlokirBanner />}
      {outlet?.tipe_bayar !== 'TUNAI' && outlet?.limit_kredit !== undefined && <KreditCard limit={outlet.limit_kredit} outstanding={d.totalOutstanding} totalPO={v.total} />}
      {!v.kredit.boleh && v.items.length > 0 && (
        <p role="alert" className="flex items-start gap-1.5 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {v.kredit.alasan}
        </p>
      )}

      {poHariIni.length > 0 && (
        <Card className="p-3">
          <SectionTitle>PO hari ini</SectionTitle>
          {poHariIni.map((p) => (
            <div key={p.id} className="flex justify-between text-sm">
              <span className="font-mono text-slate-700">{p.no_po}</span>
              <span className="font-semibold tabular">{formatRupiah(p.total)}</span>
            </div>
          ))}
        </Card>
      )}

      <SkuPicker produk={aktifProduk} terpilih={diKeranjang} onPilih={(p) => tambah(p)} label="Cari SKU untuk PO" />

      {items.length > 0 && (
        <section>
          <SectionTitle right={`${v.items.length} SKU`}>Item PO</SectionTitle>
          <ul className="space-y-2">
            {items.map((p) => {
              const qty = keranjang[p.kode_sku] ?? 0;
              const e = v.errorItem[p.kode_sku];
              const c = v.catatanItem[p.kode_sku];
              return (
                <li key={p.kode_sku}>
                  <Card className={cn('p-3', e && 'border-red-200')}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold leading-snug text-slate-900">{p.nama_sku}</div>
                        <div className="text-xs text-slate-500">
                          {p.kode_sku} · {p.divisi} · {formatRupiah(p.harga)}/{p.satuan}
                        </div>
                      </div>
                      <button type="button" aria-label={`Hapus ${p.nama_sku}`} onClick={() => hapus(p.kode_sku)} className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600">
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <div className="mt-1.5 space-y-1">
                      <Badge tone="brand" dot={false}>
                        {labelMoq(p)}
                      </Badge>
                      <InfoHistori h={histMap.get(p.kode_sku)} p={p} />
                    </div>
                    <div className="mt-2 flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
                      <QtyUnit label={`qty ${p.nama_sku}`} value={qty} isi={p.isi_karton} satuan={p.satuan} moq={1} invalid={!!e} onChange={(n) => setQty(p.kode_sku, n)} />
                      <span className="ml-auto whitespace-nowrap pt-2 text-sm font-semibold tabular text-slate-900">{formatRupiah(qty * p.harga)}</span>
                    </div>
                    {e && (
                      <p role="alert" className="mt-2 flex items-start gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700">
                        <AlertTriangle size={14} className="mt-px shrink-0" /> {e}
                      </p>
                    )}
                    {!e && c && (
                      <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800">
                        <Info size={14} className="mt-px shrink-0" /> {c}
                      </p>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {langganan.length > 0 && (
        <section>
          <SectionTitle
            right={
              <button type="button" onClick={isiSaran} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
                <Sparkles size={14} /> Isi semua
              </button>
            }
          >
            <span className="inline-flex items-center gap-1.5">
              <History size={15} /> History pembelian
            </span>
          </SectionTitle>
          <Card className="divide-y divide-slate-100 px-3">
            {langganan.map((h) => {
              const p = byKode.get(h.kode_sku)!;
              return (
                <div key={h.kode_sku} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-900">{p.nama_sku}</div>
                    <InfoHistori h={h} p={p} />
                    <p className="text-xs font-medium text-brand-700">{labelMoq(p)}</p>
                  </div>
                  <button type="button" onClick={() => tambah(p)} className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg bg-brand-50 px-2.5 text-xs font-semibold text-brand-700 hover:bg-brand-100" aria-label={`Tambah ${p.nama_sku}`}>
                    <Plus size={14} /> Tambah
                  </button>
                </div>
              );
            })}
          </Card>
        </section>
      )}

      {items.length === 0 && langganan.length === 0 && <EmptyState title="Belum ada item">Cari SKU berdasarkan kode atau nama untuk mulai input PO.</EmptyState>}

      <ActionBar>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-slate-500">{v.items.length} SKU</div>
          <div className="whitespace-nowrap text-base font-bold tabular text-slate-900">{formatRupiah(v.total)}</div>
        </div>
        <Button variant="ghost" size="lg" className="px-3" onClick={lewati}>
          Lewati
        </Button>
        <Button size="lg" disabled={!v.bolehSubmit} onClick={() => setKonfirmasi(true)}>
          <PackagePlus size={18} /> Submit
        </Button>
      </ActionBar>

      <KonfirmasiPO open={konfirmasi} onClose={() => setKonfirmasi(false)} items={v.items} total={v.total} peringatan={v.kredit.peringatan} catatan={v.catatanItem} onSubmit={kirim} />
    </>
  );
}

/** Sheet konfirmasi PO (GT & MT). */
export function KonfirmasiPO({
  open,
  onClose,
  items,
  total,
  peringatan,
  catatan,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  items: ItemPO[];
  total: number;
  peringatan?: string | null;
  /** Flag MOQ per item (GT) — informasi saja. */
  catatan?: Record<string, string>;
  onSubmit: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Konfirmasi Purchase Order"
      footer={
        <Button block size="lg" onClick={onSubmit}>
          Submit PO · {formatRupiah(total)}
        </Button>
      }
    >
      {peringatan && (
        <p className="mb-2 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {peringatan}
        </p>
      )}
      <ul className="divide-y divide-slate-100">
        {items.map((i) => (
          <li key={i.kode_sku} className="flex items-start justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-900">{i.nama_sku}</div>
              <div className="text-xs tabular text-slate-500">
                {i.kode_sku} · {formatQty(i.qty, { satuan: i.satuan, isi_karton: i.isi_karton ?? 1 })} × {formatRupiah(i.harga)}
              </div>
              {catatan?.[i.kode_sku] && <div className="text-xs font-medium text-amber-700">{catatan[i.kode_sku]}</div>}
            </div>
            <div className="shrink-0 text-sm font-semibold tabular">{formatRupiah(i.subtotal)}</div>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-3 text-base font-bold">
        <span>Total</span>
        <span className="tabular">{formatRupiah(total)}</span>
      </div>
    </Sheet>
  );
}

/** Toko diblokir: PO tetap bisa disubmit, tapi berpotensi tidak release. */
export function BlokirBanner() {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
      <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-600" />
      <div>
        <div className="font-semibold">PO berpotensi tidak release</div>
        <div className="text-sm">Selesaikan tagihan atau hubungi admin.</div>
      </div>
    </div>
  );
}

export function KreditCard({ limit, outstanding, totalPO }: { limit: number; outstanding: number; totalPO: number }) {
  const sisaSetelah = limit - outstanding - totalPO;
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <Wallet size={16} /> Limit kredit
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
        <div>
          <div className="text-slate-500">Limit</div>
          <div className="font-semibold tabular text-slate-900">{formatRupiah(limit)}</div>
        </div>
        <div>
          <div className="text-slate-500">Outstanding</div>
          <div className="font-semibold tabular text-slate-900">{formatRupiah(outstanding)}</div>
        </div>
        <div>
          <div className="text-slate-500">Sisa limit</div>
          <div className={cn('font-semibold tabular', sisaSetelah < 0 ? 'text-red-600' : 'text-emerald-700')}>{formatRupiah(sisaSetelah)}</div>
        </div>
      </div>
      <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={cn('h-full rounded-full', sisaSetelah < 0 ? 'bg-red-500' : 'bg-brand-500')} style={{ width: `${Math.min(100, ((outstanding + totalPO) / Math.max(1, limit)) * 100)}%` }} />
      </div>
    </Card>
  );
}

// ───────────────────────── 4. Selesai ─────────────────────────

function SelesaiStep({ kodeToko, onGo }: { kodeToko: string; onGo: (s: Step) => void }) {
  const { kode: sales, D } = useSalesSession();
  const { aktivitas, selesaikanKunjungan } = useData();
  const nav = useNavigate();
  const toast = useToast();
  const status = cariKunjungan(aktivitas.kunjungan, sales, kodeToko, D);
  const pen = aktivitas.penagihan.filter((p) => p.kode_toko === kodeToko && p.tanggal === D && p.kode_salesman === sales);
  const stok = aktivitas.stok.find((s) => s.kode_toko === kodeToko && s.tanggal === D && s.kode_salesman === sales);
  const po = aktivitas.po.filter((p) => p.kode_toko === kodeToko && p.tanggal === D && p.kode_salesman === sales);
  const rp = ringkasPenagihan(pen);

  const row = (l: LangkahKunjungan, detail: string) => {
    const h = status?.langkah[l];
    return (
      <button key={l} type="button" onClick={() => onGo(l)} className="flex w-full items-center gap-3 py-3 text-left">
        <span className={cn('flex h-8 w-8 items-center justify-center rounded-full', h === 'SELESAI' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
          {h === 'SELESAI' ? <Check size={16} strokeWidth={3} /> : '–'}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-900">{LABEL_LANGKAH[l]}</div>
          <div className="truncate text-xs text-slate-500">{h ? detail : 'Belum diisi'}</div>
        </div>
        <Badge tone={h === 'SELESAI' ? 'green' : 'gray'}>{h === 'SELESAI' ? 'Selesai' : h === 'DILEWATI' ? 'Dilewati' : 'Belum'}</Badge>
      </button>
    );
  };

  const selesai = isSelesai(status);
  return (
    <>
      <Card className="divide-y divide-slate-100 px-4">
        {row('collection', pen.length ? `${pen.length} faktur diupdate · terkumpul ${formatRupiah(rp.terkumpul)}` : 'Tidak ada penagihan')}
        {row('stok', stok ? `${stok.internal.length} SKU · ${stok.kompetitor.length} produk kompetitor` : 'Dilewati')}
        {row('po', po.length ? `${po.length} PO · ${formatRupiah(po.reduce((s, p) => s + p.total, 0))}` : 'Tidak ada order')}
      </Card>
      {selesai ? (
        <EmptyState icon={<CheckCircle2 size={20} className="text-emerald-600" />} title="Kunjungan sudah selesai" action={<Button onClick={() => nav('/sales')}>Kembali ke Rute</Button>} />
      ) : (
        <p className="px-1 text-sm text-slate-500">Langkah yang belum diisi akan dicatat sebagai dilewati.</p>
      )}
      {!selesai && (
        <ActionBar>
          <Button
            block
            size="lg"
            variant="success"
            onClick={() => {
              selesaikanKunjungan(sales, kodeToko, D);
              toast('Kunjungan selesai');
              nav('/sales');
            }}
          >
            <CheckCircle2 size={18} /> Selesai Kunjungan
          </Button>
        </ActionBar>
      )}
    </>
  );
}

