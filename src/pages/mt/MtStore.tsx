import { AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, PackagePlus, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { InfoOutletMT } from '../../components/DetailTokoView';
import { SkuPicker } from '../../components/SkuPicker';
import { Badge, Button, Card, Chips, cn, EmptyState, ProgressBar, SectionTitle, useToast } from '../../components/ui';
import { normKode } from '../../lib/billing';
import { formatTanggal } from '../../lib/dates';
import { formatRupiah } from '../../lib/format';
import { compliance, labelWarning, ringkasPrincipal, teksTerakhirOrder, type SkuMSL } from '../../lib/msl';
import { formatQty, historiToko, suggestedQty, validasiPO, type ProdukLengkap } from '../../lib/order';
import { QtyUnit } from '../../components/QtyUnit';

/** MT tidak memakai MOQ: saran qty dihitung tanpa pembulatan MOQ. */
const TANPA_MOQ = { moq: 1 };
import { newId, useData } from '../../state';
import { useSalesSession } from '../sales/session';
import { ActionBar, InfoHistori, KonfirmasiPO } from '../sales/VisitPage';
import { SkuRow, useMslToko } from './shared';

type Step = 'po' | 'msl' | 'summary';
const STEPS: { id: Step; label: string }[] = [
  { id: 'po', label: 'Input PO' },
  { id: 'msl', label: 'Cek MSL' },
  { id: 'summary', label: 'Summary' },
];

function useKodeToko() {
  const { kode = '' } = useParams();
  return normKode(decodeURIComponent(kode));
}

/** Link lama /mt/toko/:kode/po & /divisi/:p → stepper. */
export function MtRedirect({ step }: { step: Step }) {
  const kode = useKodeToko();
  const { divisi } = useParams();
  return <Navigate to={`/mt/toko/${encodeURIComponent(kode)}?step=${step}${divisi ? `&p=${divisi}` : ''}`} replace />;
}

/** Keranjang MT toko ini + validasi PO (MT: tanpa limit kredit / blokir). */
function usePOToko(kodeToko: string) {
  const { keranjang, produkMT: produk, masterIdx } = useData();
  const k = keranjang[kodeToko] ?? {};
  return validasiPO(k, produk, masterIdx.get(kodeToko), 0, { channel: 'MT' });
}

export function MtTokoPage() {
  const kodeToko = useKodeToko();
  const { D } = useSalesSession();
  const { masterIdx } = useData();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const step = (['po', 'msl', 'summary'].includes(sp.get('step') ?? '') ? sp.get('step') : 'po') as Step;
  const go = (s: Step) => {
    setSp({ step: s }, { replace: true });
    window.scrollTo({ top: 0 });
  };
  const m = masterIdx.get(kodeToko);
  const v = usePOToko(kodeToko);

  if (!m)
    return (
      <div className="mx-auto max-w-md p-4">
        <EmptyState title="Toko tidak ditemukan" action={<Button onClick={() => nav('/mt')}>Kembali</Button>}>
          {kodeToko}
        </EmptyState>
      </div>
    );

  return (
    <div className="min-h-dvh bg-slate-50 pb-28">
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-md px-4 pb-3 pt-2">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => nav('/mt')} aria-label="Kembali" className="-ml-2 flex h-10 w-10 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100">
              <ArrowLeft size={20} />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-bold leading-tight text-slate-900">{m.nama_toko}</h1>
              <p className="truncate text-xs text-slate-500">
                {kodeToko} · {formatTanggal(D)}
              </p>
            </div>
            {v.items.length > 0 && <Badge tone="brand">{v.items.length} SKU</Badge>}
          </div>
          <ol className="mt-2 grid grid-cols-3 gap-1">
            {STEPS.map((s, i) => {
              const idx = STEPS.findIndex((x) => x.id === step);
              const done = i < idx;
              const active = s.id === step;
              return (
                <li key={s.id}>
                  <button type="button" onClick={() => go(s.id)} aria-current={active ? 'step' : undefined} className="flex w-full flex-col items-center gap-1 py-1">
                    <span className="flex w-full items-center">
                      <span className={cn('h-0.5 flex-1', i === 0 ? 'bg-transparent' : done || active ? 'bg-violet-300' : 'bg-slate-200')} />
                      <span
                        className={cn(
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                          done ? 'bg-emerald-500 text-white' : active ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-500',
                        )}
                      >
                        {done ? <Check size={14} strokeWidth={3} /> : i + 1}
                      </span>
                      <span className={cn('h-0.5 flex-1', i === STEPS.length - 1 ? 'bg-transparent' : done ? 'bg-violet-300' : 'bg-slate-200')} />
                    </span>
                    <span className={cn('text-[11px] font-medium leading-none', active ? 'text-violet-700' : 'text-slate-500')}>{s.label}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-3 px-4 py-4">
        {step === 'po' && <InputPOStep kodeToko={kodeToko} onNext={() => go('msl')} />}
        {step === 'msl' && <CekMslStep kodeToko={kodeToko} onNext={() => go('summary')} />}
        {step === 'summary' && <SummaryStep kodeToko={kodeToko} onGo={go} />}
      </main>
    </div>
  );
}

function TotalBar({ kodeToko, label, onClick, disabled }: { kodeToko: string; label: string; onClick: () => void; disabled?: boolean }) {
  const v = usePOToko(kodeToko);
  return (
    <ActionBar>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-slate-500">{v.items.length} SKU di PO</div>
        <div className="whitespace-nowrap text-base font-bold tabular text-slate-900">{formatRupiah(v.total)}</div>
      </div>
      <Button size="lg" onClick={onClick} disabled={disabled}>
        {label} <ArrowRight size={18} />
      </Button>
    </ActionBar>
  );
}

// ───────────────────────── 1. Input PO ─────────────────────────

function InputPOStep({ kodeToko, onNext }: { kodeToko: string; onNext: () => void }) {
  const { D } = useSalesSession();
  const { produkMT: produk, data, keranjang, setQtyKeranjang } = useData();
  const v = usePOToko(kodeToko);
  const k = keranjang[kodeToko] ?? {};
  const aktifProduk = useMemo(() => produk.filter((p) => p.status_aktif !== false), [produk]);
  const byKode = useMemo(() => new Map(produk.map((p) => [p.kode_sku, p])), [produk]);
  const histMap = useMemo(() => new Map(historiToko(data.histori, kodeToko, D).map((h) => [h.kode_sku, h])), [data.histori, kodeToko, D]);
  const items = Object.keys(k)
    .map((kode) => byKode.get(kode))
    .filter((p): p is ProdukLengkap => !!p);

  const tambah = (p: ProdukLengkap) => {
    if (k[p.kode_sku]) return;
    setQtyKeranjang(kodeToko, p.kode_sku, suggestedQty(histMap.get(p.kode_sku), TANPA_MOQ).qty || 1);
  };

  return (
    <>
      <InfoOutletMT kodeToko={kodeToko} />
      <SkuPicker produk={aktifProduk} terpilih={new Set(Object.keys(k))} onPilih={tambah} label="Cari SKU untuk PO" />
      {items.length === 0 ? (
        <EmptyState icon={<ShoppingCart size={20} />} title="Belum ada item PO">
          Cari SKU berdasarkan kode atau nama. Setelah itu, cek SKU MSL yang belum ditransaksikan di langkah berikutnya.
        </EmptyState>
      ) : (
        <section>
          <SectionTitle right={`${v.items.length} SKU`}>Item PO</SectionTitle>
          <ul className="space-y-2">
            {items.map((p) => {
              const qty = k[p.kode_sku] ?? 0;
              const e = v.errorItem[p.kode_sku];
              return (
                <li key={p.kode_sku}>
                  <Card className={cn('p-3', e && 'border-red-200')}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold leading-snug text-slate-900">{p.nama_sku}</div>
                        <div className="text-xs text-slate-500">
                          {p.kode_sku} · {p.sub_brand ?? p.divisi} · {formatRupiah(p.harga)}/{p.satuan}
                        </div>
                      </div>
                      <button type="button" aria-label={`Hapus ${p.nama_sku}`} onClick={() => setQtyKeranjang(kodeToko, p.kode_sku, 0)} className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600">
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <div className="mt-1.5">
                      <InfoHistori h={histMap.get(p.kode_sku)} p={p} />
                    </div>
                    <div className="mt-2 flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
                      <QtyUnit label={`qty ${p.nama_sku}`} value={qty} isi={p.isi_karton} satuan={p.satuan} moq={1} invalid={!!e} onChange={(n) => setQtyKeranjang(kodeToko, p.kode_sku, Math.max(n, 0) || 0)} />
                      <span className="ml-auto whitespace-nowrap pt-2 text-sm font-semibold tabular text-slate-900">{formatRupiah(qty * p.harga)}</span>
                    </div>
                    {e && (
                      <p role="alert" className="mt-2 flex items-start gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700">
                        <AlertTriangle size={14} className="mt-px shrink-0" /> {e}
                      </p>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <TotalBar kodeToko={kodeToko} label="Cek MSL" onClick={onNext} />
    </>
  );
}

// ───────────────────────── 2. Cek MSL ─────────────────────────

function CekMslStep({ kodeToko, onNext }: { kodeToko: string; onNext: () => void }) {
  const { D } = useSalesSession();
  const [sp, setSp] = useSearchParams();
  const list = useMslToko(kodeToko, D);
  const before = compliance(list, 'sebelum');
  const after = compliance(list);
  const principal = ringkasPrincipal(list);
  const pilih = sp.get('p') ?? 'semua';
  const [hanyaWarning, setHanyaWarning] = useState(false);
  const tampil = list.filter((s) => (pilih === 'semua' || s.divisi === pilih) && (!hanyaWarning || s.warning));
  useEffect(() => {
    if (pilih !== 'semua' && !principal.some((p) => p.principal === pilih)) setSp({ step: 'msl' }, { replace: true });
  }, [pilih, principal, setSp]);

  if (!list.length)
    return (
      <>
        <EmptyState title="Belum ada SKU listed untuk toko ini">Admin perlu upload data MSL.</EmptyState>
        <TotalBar kodeToko={kodeToko} label="Summary" onClick={onNext} />
      </>
    );

  return (
    <>
      <Card className="p-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-xs font-medium uppercase text-slate-500">MSL aktif</div>
            <div className="text-2xl font-bold tabular text-slate-900">
              {after.aktif}/{after.listed} <span className="text-base font-semibold text-slate-500">SKU</span>
            </div>
            {after.aktif > before.aktif && (
              <div className="text-xs font-medium text-emerald-700">
                +{after.aktif - before.aktif} dari PO ini (sebelumnya {before.aktif})
              </div>
            )}
          </div>
          {after.warning > 0 ? <Badge tone="red">{after.warning} SKU belum transaksi</Badge> : <Badge tone="green">Semua SKU aktif</Badge>}
        </div>
        <div className="mt-3">
          <ProgressBar value={after.aktif} max={after.listed} tone="green" />
        </div>
      </Card>

      {after.warning > 0 && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
          Ada <span className="font-semibold">{after.warning} SKU listed</span> yang belum ditransaksikan di PO ini. Tawarkan ke toko, lalu tekan <span className="font-semibold">+ PO</span>.
        </p>
      )}

      <h2 className="px-1 pt-1 text-sm font-semibold text-slate-700">Pilih Principal</h2>
      <Chips
        label="Principal"
        value={pilih}
        onChange={(p) => setSp(p === 'semua' ? { step: 'msl' } : { step: 'msl', p }, { replace: true })}
        options={[
          { value: 'semua', label: `Semua principal${after.warning ? ` · ${after.warning}⚠` : ''}` },
          ...principal.map((p) => ({ value: p.principal, label: p.warning ? `${p.principal} · ${p.warning}⚠` : `${p.principal} ✓` })),
        ]}
      />
      <ul className="grid grid-cols-2 gap-2">
        {principal.map((p) => (
          <li key={p.principal}>
            <button
              type="button"
              onClick={() => setSp({ step: 'msl', p: p.principal }, { replace: true })}
              aria-pressed={pilih === p.principal}
              className={cn(
                'flex h-full w-full flex-col items-start gap-1.5 rounded-2xl border bg-white p-3 text-left shadow-card transition-colors hover:bg-slate-50',
                pilih === p.principal ? 'border-violet-500 ring-2 ring-violet-500/20' : p.warning ? 'border-red-200' : 'border-slate-200/80',
              )}
            >
              <span className="font-semibold leading-snug text-slate-900">{p.principal}</span>
              <span className="text-xs text-slate-500">{p.total} SKU</span>
              {p.warning > 0 ? (
                <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white">{p.warning} SKU Untransacted</span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                  <CheckCircle2 size={14} /> Semua aktif
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      <label className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm shadow-card">
        <span className="text-slate-700">Hanya SKU belum transaksi</span>
        <input type="checkbox" checked={hanyaWarning} onChange={(e) => setHanyaWarning(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-violet-600" />
      </label>
      {tampil.length === 0 ? (
        <EmptyState icon={<CheckCircle2 size={20} className="text-emerald-600" />} title="Tidak ada SKU yang perlu di-follow up">
          Semua SKU listed sudah ditransaksikan atau masuk PO ini.
        </EmptyState>
      ) : (
        <ul className="space-y-2">
          {tampil.map((s) => (
            <SkuRow key={s.kode_sku} s={s} kodeToko={kodeToko} D={D} />
          ))}
        </ul>
      )}
      <TotalBar kodeToko={kodeToko} label="Summary" onClick={onNext} />
    </>
  );
}

// ───────────────────────── 3. Summary & Submit ─────────────────────────

function SummaryStep({ kodeToko, onGo }: { kodeToko: string; onGo: (s: Step) => void }) {
  const { D, kode: sales } = useSalesSession();
  const { submitPO, kosongkanKeranjang, setQtyKeranjang } = useData();
  const nav = useNavigate();
  const toast = useToast();
  const v = usePOToko(kodeToko);
  const list = useMslToko(kodeToko, D);
  const before = compliance(list, 'sebelum');
  const after = compliance(list);
  const sisa = list.filter((s) => s.warning);
  const teratasi = list.filter((s) => s.diPO && s.warningAwal).length;
  const [konfirmasi, setKonfirmasi] = useState(false);

  const tambahCepat = (s: SkuMSL) => setQtyKeranjang(kodeToko, s.kode_sku, 1);

  const kirim = () => {
    const po = submitPO({ id: newId(), kode_toko: kodeToko, kode_salesman: sales, tanggal: D, items: v.items, total: v.total, status: 'TERKIRIM', createdAt: new Date().toISOString() });
    kosongkanKeranjang(kodeToko);
    setKonfirmasi(false);
    toast(teratasi ? `${po.no_po} berhasil disubmit · ${teratasi} warning SKU teratasi` : `${po.no_po} berhasil disubmit`);
    nav('/mt', { replace: true });
  };

  return (
    <>
      <Card className="p-4">
        <SectionTitle>Ringkasan MSL</SectionTitle>
        <div className="grid grid-cols-3 items-end gap-2 text-center">
          <div>
            <div className="text-xs text-slate-500">Sebelum PO</div>
            <div className="text-xl font-bold tabular text-slate-700">{before.persen}%</div>
            <div className="text-xs tabular text-slate-500">
              {before.aktif}/{before.listed}
            </div>
          </div>
          <ArrowRight className="mx-auto mb-4 text-slate-300" size={20} />
          <div>
            <div className="text-xs text-slate-500">Sesudah PO</div>
            <div className={cn('text-xl font-bold tabular', after.persen > before.persen ? 'text-emerald-700' : 'text-slate-900')}>{after.persen}%</div>
            <div className="text-xs tabular text-slate-500">
              {after.aktif}/{after.listed}
            </div>
          </div>
        </div>
        {teratasi > 0 && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{teratasi} SKU yang belum transaksi masuk ke PO ini.</p>}
      </Card>

      {sisa.length > 0 && (
        <section>
          <SectionTitle right={<button type="button" className="text-sm font-semibold text-violet-700" onClick={() => onGo('msl')}>Lihat di Cek MSL</button>}>
            Masih belum transaksi ({sisa.length})
          </SectionTitle>
          <Card className="divide-y divide-slate-100 px-3">
            {sisa.slice(0, 6).map((s) => (
              <div key={s.kode_sku} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-900">{s.nama_sku}</div>
                  <div className="text-xs text-slate-500">{s.divisi}</div>
                  <div className="text-xs font-medium text-red-600">{s.warning === 'BELUM_PERNAH' ? labelWarning(s.warning) : teksTerakhirOrder(s)}</div>
                </div>
                <button type="button" onClick={() => tambahCepat(s)} aria-label={`Add to PO ${s.nama_sku}`} className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg bg-red-600 px-2.5 text-xs font-semibold text-white hover:bg-red-700">
                  <Plus size={14} /> PO
                </button>
              </div>
            ))}
            {sisa.length > 6 && <p className="py-2 text-center text-xs text-slate-500">+{sisa.length - 6} SKU lainnya</p>}
          </Card>
        </section>
      )}

      <section>
        <SectionTitle right={<button type="button" className="text-sm font-semibold text-violet-700" onClick={() => onGo('po')}>Ubah</button>}>Item PO ({v.items.length})</SectionTitle>
        {v.items.length === 0 ? (
          <EmptyState icon={<ShoppingCart size={20} />} title="PO masih kosong" action={<Button onClick={() => onGo('po')}>Input PO</Button>} />
        ) : (
          <Card className="divide-y divide-slate-100 px-4">
            {v.items.map((i) => (
              <div key={i.kode_sku} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900">{i.nama_sku}</div>
                  <div className="text-xs tabular text-slate-500">
                    {i.kode_sku} · {formatQty(i.qty, { satuan: i.satuan, isi_karton: i.isi_karton ?? 1 })} × {formatRupiah(i.harga)}
                  </div>
                  {v.errorItem[i.kode_sku] && <div className="text-xs font-medium text-red-600">{v.errorItem[i.kode_sku]}</div>}
                </div>
                <div className="shrink-0 text-sm font-semibold tabular">{formatRupiah(i.subtotal)}</div>
              </div>
            ))}
            <div className="flex items-center justify-between py-3 text-base font-bold">
              <span>Total</span>
              <span className="tabular">{formatRupiah(v.total)}</span>
            </div>
          </Card>
        )}
      </section>

      <ActionBar>
        <Button block size="lg" disabled={!v.bolehSubmit} onClick={() => setKonfirmasi(true)}>
          <PackagePlus size={18} /> Submit PO · {formatRupiah(v.total)}
        </Button>
      </ActionBar>
      <KonfirmasiPO open={konfirmasi} onClose={() => setKonfirmasi(false)} items={v.items} total={v.total} onSubmit={kirim} />
    </>
  );
}
