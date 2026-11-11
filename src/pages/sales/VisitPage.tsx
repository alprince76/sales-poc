import { AlertTriangle, ArrowLeft, Ban, Check, CheckCircle2, ChevronDown, History, PackagePlus, Plus, Sparkles, Trash2, Wallet } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { HarusDitagih, InfoOutlet, KelompokFaktur, useDetailToko } from '../../components/DetailTokoView';
import { PenagihanSheet } from '../../components/Penagihan';
import { Badge, Button, Card, Chips, cn, EmptyState, Input, NumberStepper, SectionTitle, Segmented, Sheet, StatusBayarBadge, useToast } from '../../components/ui';
import { normKode, type FakturDinilai } from '../../lib/billing';
import { ringkasPenagihan } from '../../lib/collection';
import { formatTanggal } from '../../lib/dates';
import { formatRupiah } from '../../lib/format';
import { historiToko, suggestedQty, validasiPO } from '../../lib/order';
import { daftarSkuStok, validasiStok } from '../../lib/stock';
import type { LangkahKunjungan, StokInternal, StokKompetitor } from '../../lib/types';
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
            {selesai ? <Badge tone="green">Selesai</Badge> : !terjadwal ? <Badge tone="gray" dot={false}>Di luar jadwal</Badge> : null}
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
      <InfoOutlet kodeToko={kodeToko} />
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
  const list = useMemo(() => daftarSkuStok(produk, hist), [produk, hist]);
  const [tab, setTab] = useState<'internal' | 'kompetitor'>('internal');
  const [divisi, setDivisi] = useState('Semua');
  const [stok, setStok] = useState<Record<string, StokInternal>>(() => Object.fromEntries((existing?.internal ?? []).map((s) => [s.kode_sku, s])));
  const [komp, setKomp] = useState<StokKompetitor[]>(() => (existing?.kompetitor.length ? existing.kompetitor : [{ nama_produk: '', qty: 0 }]));
  const [err, setErr] = useState<string[]>([]);

  const divisiList = ['Semua', ...Array.from(new Set(list.map((p) => p.divisi)))];
  const tampil = list.filter((p) => divisi === 'Semua' || p.divisi === divisi);
  const set = (kode: string, k: 'display' | 'backroom', v: number) =>
    setStok((p) => ({ ...p, [kode]: { kode_sku: kode, display: p[kode]?.display ?? 0, backroom: p[kode]?.backroom ?? 0, [k]: v } }));
  const terisi = Object.values(stok).filter((s) => s.display || s.backroom).length;

  const simpan = () => {
    const v = validasiStok(Object.values(stok), komp);
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
        <EmptyState title="Master Produk belum tersedia">Admin perlu upload data Produk.</EmptyState>
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
          { value: 'kompetitor', label: `Kompetitor${komp.filter((k) => k.nama_produk.trim()).length ? ` (${komp.filter((k) => k.nama_produk.trim()).length})` : ''}` },
        ]}
      />
      {err.length > 0 && (
        <div role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {err[0]}
        </div>
      )}

      {tab === 'internal' ? (
        <>
          <Chips label="Divisi" value={divisi} onChange={setDivisi} options={divisiList.map((x) => ({ value: x, label: x }))} />
          <p className="px-1 text-xs text-slate-500">SKU yang pernah dibeli toko ditampilkan paling atas.</p>
          <ul className="space-y-2">
            {tampil.map((p) => (
              <li key={p.kode_sku}>
                <Card className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold leading-snug text-slate-900">{p.nama_sku}</div>
                      <div className="text-xs text-slate-500">
                        {p.kode_sku} · {p.divisi}
                      </div>
                    </div>
                    {p.pernahDibeli && <Badge tone="brand" dot={false}>Pernah dibeli</Badge>}
                  </div>
                  <div className="mt-2.5 grid grid-cols-2 gap-2">
                    {(['display', 'backroom'] as const).map((k) => (
                      <div key={k} className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-slate-500">{k === 'display' ? 'Display (pajangan)' : 'Backroom (gudang)'}</span>
                        <NumberStepper label={`${k} ${p.nama_sku}`} value={stok[p.kode_sku]?.[k] ?? 0} onChange={(v) => set(p.kode_sku, k, v)} />
                      </div>
                    ))}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <p className="px-1 text-sm text-slate-600">Catat produk kompetitor yang ada di toko sebagai pembanding pangsa pasar.</p>
          <ul className="space-y-2">
            {komp.map((k, i) => (
              <li key={i}>
                <Card className="flex items-end gap-2 p-3">
                  <label className="min-w-0 flex-1">
                    <span className="mb-1 block text-xs font-medium text-slate-500">Nama produk</span>
                    <Input value={k.nama_produk} placeholder="mis. Haribo Goldbears 100gr" onChange={(e) => setKomp((x) => x.map((y, j) => (j === i ? { ...y, nama_produk: e.target.value } : y)))} />
                  </label>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-slate-500">Qty</span>
                    <NumberStepper label={`qty kompetitor ${i + 1}`} value={k.qty} onChange={(v) => setKomp((x) => x.map((y, j) => (j === i ? { ...y, qty: v } : y)))} />
                  </div>
                  <button type="button" aria-label="Hapus baris" onClick={() => setKomp((x) => x.filter((_, j) => j !== i))} className="mb-1 flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600">
                    <Trash2 size={16} />
                  </button>
                </Card>
              </li>
            ))}
          </ul>
          <Button variant="secondary" block onClick={() => setKomp((x) => [...x, { nama_produk: '', qty: 0 }])}>
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

function POStep({ kodeToko, onNext }: { kodeToko: string; onNext: () => void }) {
  const { kode: sales, D } = useSalesSession();
  const { data, produk, masterIdx, aktivitas, submitPO, tandai } = useData();
  const toast = useToast();
  const d = useDetailToko(kodeToko, D);
  const outlet = masterIdx.get(kodeToko);
  const hist = useMemo(() => historiToko(data.histori, kodeToko, D), [data.histori, kodeToko, D]);
  const histMap = useMemo(() => new Map(hist.map((h) => [h.kode_sku, h])), [hist]);
  const [keranjang, setKeranjang] = useState<Record<string, number>>({});
  const [divisi, setDivisi] = useState('Semua');
  const [mode, setMode] = useState<'saran' | 'semua'>(hist.length ? 'saran' : 'semua');
  const [konfirmasi, setKonfirmasi] = useState(false);
  const [lihatHist, setLihatHist] = useState(false);
  const poHariIni = aktivitas.po.filter((p) => p.kode_toko === kodeToko && p.tanggal === D);

  const v = validasiPO(keranjang, produk, outlet, d.totalOutstanding);
  const divisiList = ['Semua', ...Array.from(new Set(produk.map((p) => p.divisi)))];
  const tampil = produk
    .filter((p) => (divisi === 'Semua' || p.divisi === divisi) && (mode === 'semua' || histMap.has(p.kode_sku) || keranjang[p.kode_sku]))
    .sort((a, b) => Number(histMap.has(b.kode_sku)) - Number(histMap.has(a.kode_sku)) || a.divisi.localeCompare(b.divisi) || a.nama_sku.localeCompare(b.nama_sku));
  const namaSku = (k: string) => produk.find((p) => p.kode_sku === k)?.nama_sku ?? k;

  const isiSaran = () => {
    const next: Record<string, number> = { ...keranjang };
    for (const p of produk) {
      const s = suggestedQty(histMap.get(p.kode_sku), p);
      if (s.qty > 0) next[p.kode_sku] = s.qty;
    }
    setKeranjang(next);
  };

  const kirim = () => {
    const po = submitPO({ id: newId(), kode_toko: kodeToko, kode_salesman: sales, tanggal: D, items: v.items, total: v.total, status: 'TERKIRIM', createdAt: new Date().toISOString() });
    tandai(sales, kodeToko, D, 'po', 'SELESAI');
    setKonfirmasi(false);
    setKeranjang({});
    toast(`${po.no_po} terkirim ke ERP`);
    onNext();
  };
  const lewati = () => {
    tandai(sales, kodeToko, D, 'po', 'DILEWATI');
    onNext();
  };

  if (!produk.length) {
    return (
      <>
        <EmptyState title="Master Produk belum tersedia">Admin perlu upload data Produk & Order Rules.</EmptyState>
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
      <KreditCard blokir={!!outlet?.status_blokir} limit={outlet?.limit_kredit} outstanding={d.totalOutstanding} totalPO={v.total} />
      {!v.kredit.boleh && v.items.length > 0 && !outlet?.status_blokir && (
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

      {hist.length > 0 && (
        <Card className="p-3">
          <button type="button" onClick={() => setLihatHist((x) => !x)} className="flex w-full items-center justify-between text-sm font-semibold text-slate-700" aria-expanded={lihatHist}>
            <span className="inline-flex items-center gap-2">
              <History size={16} /> Riwayat pembelian 6 bulan ({hist.length} SKU)
            </span>
            <ChevronDown size={16} className={cn('transition-transform', lihatHist && 'rotate-180')} />
          </button>
          {lihatHist && (
            <ul className="mt-2 divide-y divide-slate-100">
              {hist.map((h) => (
                <li key={h.kode_sku} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm text-slate-900">{namaSku(h.kode_sku)}</div>
                    <div className="text-xs text-slate-500">
                      {h.jumlahOrder}× order · terakhir {formatTanggal(h.terakhir)}
                    </div>
                  </div>
                  <MiniBars values={h.perBulan} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <div className="flex items-center justify-between gap-2">
        <Segmented
          label="Tampilkan"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'saran', label: `Langganan · ${hist.length}` },
            { value: 'semua', label: 'Semua' },
          ]}
        />
        {hist.length > 0 && (
          <Button size="sm" variant="ghost" onClick={isiSaran} className="text-brand-700">
            <Sparkles size={15} /> Isi saran
          </Button>
        )}
      </div>
      <Chips label="Divisi" value={divisi} onChange={setDivisi} options={divisiList.map((x) => ({ value: x, label: x }))} />

      {tampil.length === 0 ? (
        <EmptyState title="Tidak ada SKU">Pilih "Semua SKU" untuk melihat seluruh katalog.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {tampil.map((p) => {
            const h = histMap.get(p.kode_sku);
            const s = suggestedQty(h, p);
            const qty = keranjang[p.kode_sku] ?? 0;
            const e = v.errorItem[p.kode_sku];
            return (
              <li key={p.kode_sku}>
                <Card className={cn('p-3', e && 'border-red-200')}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold leading-snug text-slate-900">{p.nama_sku}</div>
                      <div className="text-xs text-slate-500">
                        {p.kode_sku} · {p.divisi}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-semibold tabular text-slate-900">{formatRupiah(p.harga)}</div>
                      <div className="text-xs text-slate-500">/{p.satuan}</div>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge tone="gray" dot={false}>
                      MOQ {p.moq} {p.satuan}
                      {p.kelipatan > 1 ? ` · kelipatan ${p.kelipatan}` : ''}
                    </Badge>
                    {h && (
                      <Badge tone="gray" dot={false}>
                        ±{s.rataBulanan.toLocaleString('id-ID')}/bln · {s.basis}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    {s.qty > 0 ? (
                      <button
                        type="button"
                        onClick={() => setKeranjang((k) => ({ ...k, [p.kode_sku]: s.qty }))}
                        className={cn('inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold', qty === s.qty ? 'bg-emerald-50 text-emerald-700' : 'bg-brand-50 text-brand-700 hover:bg-brand-100')}
                      >
                        <Sparkles size={13} /> Saran {s.qty}
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">Belum pernah dibeli</span>
                    )}
                    <NumberStepper
                      label={`qty ${p.nama_sku}`}
                      value={qty}
                      step={p.kelipatan}
                      onIncrementFromZero={p.moq}
                      invalid={!!e}
                      onChange={(n) => setKeranjang((k) => ({ ...k, [p.kode_sku]: n }))}
                    />
                  </div>
                  {e && (
                    <p role="alert" className="mt-2 flex items-start gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700">
                      <AlertTriangle size={14} className="mt-px shrink-0" /> {e}
                    </p>
                  )}
                  {qty > 0 && !e && <p className="mt-1.5 text-right text-xs tabular text-slate-500">Subtotal {formatRupiah(qty * p.harga)}</p>}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

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
      <Sheet
        open={konfirmasi}
        onClose={() => setKonfirmasi(false)}
        title="Konfirmasi Purchase Order"
        footer={
          <Button block size="lg" onClick={kirim}>
            Kirim ke ERP · {formatRupiah(v.total)}
          </Button>
        }
      >
        <ul className="divide-y divide-slate-100">
          {v.items.map((i) => (
            <li key={i.kode_sku} className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-900">{i.nama_sku}</div>
                <div className="text-xs tabular text-slate-500">
                  {i.qty} {i.satuan} × {formatRupiah(i.harga)}
                </div>
              </div>
              <div className="shrink-0 text-sm font-semibold tabular">{formatRupiah(i.subtotal)}</div>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-3 text-base font-bold">
          <span>Total</span>
          <span className="tabular">{formatRupiah(v.total)}</span>
        </div>
      </Sheet>
    </>
  );
}

function MiniBars({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex h-7 shrink-0 items-end gap-0.5" aria-label={`Qty 6 bulan: ${values.join(', ')}`}>
      {values.map((v, i) => (
        <span key={i} className={cn('w-1.5 rounded-sm', v ? 'bg-brand-400' : 'bg-slate-200')} style={{ height: `${Math.max(12, (v / max) * 100)}%` }} />
      ))}
    </div>
  );
}

export function KreditCard({ blokir, limit, outstanding, totalPO }: { blokir: boolean; limit?: number; outstanding: number; totalPO: number }) {
  if (blokir)
    return (
      <div className="flex items-start gap-3 rounded-2xl bg-red-600 p-4 text-white">
        <Ban size={20} className="mt-0.5 shrink-0" />
        <div>
          <div className="font-semibold">Toko diblokir</div>
          <div className="text-sm opacity-90">PO baru tidak dapat dibuat. Selesaikan tagihan atau hubungi admin.</div>
        </div>
      </div>
    );
  if (limit === undefined) return null;
  const sisa = limit - outstanding;
  const sisaSetelah = sisa - totalPO;
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

