import { ArrowLeft, CheckCircle2, ChevronRight, PackagePlus, ShoppingCart, Trash2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { InfoOutlet, useDetailToko } from '../../components/DetailTokoView';
import { Badge, Button, Card, Chips, cn, EmptyState, NumberStepper, ProgressBar, Sheet, useToast } from '../../components/ui';
import { normKode } from '../../lib/billing';
import { formatTanggal } from '../../lib/dates';
import { formatRupiah } from '../../lib/format';
import { compliance, ringkasDivisi } from '../../lib/msl';
import { validasiPO } from '../../lib/order';
import { newId, useData } from '../../state';
import { useSalesSession } from '../sales/session';
import { ActionBar, KreditCard } from '../sales/VisitPage';
import { SkuRow, useMslToko } from './shared';

function useKodeToko() {
  const { kode = '' } = useParams();
  return normKode(decodeURIComponent(kode));
}

function StoreHeader({ kodeToko, subtitle, back }: { kodeToko: string; subtitle?: ReactNode; back: () => void }) {
  const { masterIdx } = useData();
  const m = masterIdx.get(kodeToko);
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-md items-center gap-2 px-4 py-2.5">
        <button type="button" onClick={back} aria-label="Kembali" className="-ml-2 flex h-10 w-10 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100">
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold leading-tight text-slate-900">{m?.nama_toko ?? kodeToko}</h1>
          <p className="truncate text-xs text-slate-500">{subtitle ?? `${kodeToko}${m?.area ? ` · ${m.area}` : ''}`}</p>
        </div>
      </div>
    </header>
  );
}

/** Bar keranjang: muncul bila ada item di keranjang toko. */
function CartBar({ kodeToko }: { kodeToko: string }) {
  const { keranjang, produk } = useData();
  const nav = useNavigate();
  const k = keranjang[kodeToko] ?? {};
  const n = Object.keys(k).length;
  if (!n) return null;
  const total = Object.entries(k).reduce((s, [sku, q]) => s + q * (produk.find((p) => p.kode_sku === sku)?.harga ?? 0), 0);
  return (
    <ActionBar>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-slate-500">{n} SKU di keranjang</div>
        <div className="whitespace-nowrap text-base font-bold tabular text-slate-900">{formatRupiah(total)}</div>
      </div>
      <Button size="lg" onClick={() => nav(`/mt/toko/${encodeURIComponent(kodeToko)}/po`)}>
        <ShoppingCart size={18} /> Lihat PO
      </Button>
    </ActionBar>
  );
}

// ───────────────────────── Toko → Principal / Division ─────────────────────────

export function MtTokoPage() {
  const kodeToko = useKodeToko();
  const { D } = useSalesSession();
  const { masterIdx } = useData();
  const nav = useNavigate();
  const list = useMslToko(kodeToko, D);
  const div = ringkasDivisi(list);
  const c = compliance(list);

  if (!masterIdx.has(kodeToko))
    return (
      <div className="mx-auto max-w-md p-4">
        <EmptyState title="Toko tidak ditemukan" action={<Button onClick={() => nav('/mt')}>Kembali</Button>}>
          {kodeToko}
        </EmptyState>
      </div>
    );

  return (
    <div className="min-h-dvh bg-slate-50 pb-28">
      <StoreHeader kodeToko={kodeToko} back={() => nav('/mt')} subtitle={`${kodeToko} · ${formatTanggal(D)}`} />
      <main className="mx-auto max-w-md space-y-3 px-4 py-4">
        <InfoOutlet kodeToko={kodeToko} />
        <Card className="p-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-xs font-medium uppercase text-slate-500">MSL aktif</div>
              <div className="text-2xl font-bold tabular text-slate-900">
                {c.aktif}/{c.listed} <span className="text-base font-semibold text-slate-500">SKU</span>
              </div>
            </div>
            {c.warning > 0 ? <Badge tone="red">{c.warning} SKU belum transaksi</Badge> : <Badge tone="green">Semua SKU aktif</Badge>}
          </div>
          <div className="mt-3">
            <ProgressBar value={c.aktif} max={c.listed} tone="green" />
          </div>
          <p className="mt-2 text-xs text-slate-500">SKU listed dianggap aktif bila ada order dalam 30 hari terakhir.</p>
        </Card>

        <h2 className="px-1 pt-1 text-sm font-semibold text-slate-700">Pilih Principal / Divisi</h2>
        {div.length === 0 ? (
          <EmptyState title="Belum ada SKU listed untuk toko ini">Admin perlu upload data MSL.</EmptyState>
        ) : (
          <ul className="grid grid-cols-2 gap-2">
            <li className="col-span-2">
              <DivisiCard nama="Semua divisi" total={list.length} warning={c.warning} onClick={() => nav(`/mt/toko/${encodeURIComponent(kodeToko)}/divisi/semua`)} />
            </li>
            {div.map((d) => (
              <li key={d.divisi}>
                <DivisiCard nama={d.divisi} total={d.total} warning={d.warning} onClick={() => nav(`/mt/toko/${encodeURIComponent(kodeToko)}/divisi/${encodeURIComponent(d.divisi)}`)} />
              </li>
            ))}
          </ul>
        )}
      </main>
      <CartBar kodeToko={kodeToko} />
    </div>
  );
}

function DivisiCard({ nama, total, warning, onClick }: { nama: string; total: number; warning: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-full w-full flex-col items-start gap-2 rounded-2xl border bg-white p-3.5 text-left shadow-card transition-colors hover:bg-slate-50 active:bg-slate-100',
        warning ? 'border-red-200' : 'border-slate-200/80',
      )}
    >
      <div className="flex w-full items-start justify-between gap-2">
        <span className="font-semibold leading-snug text-slate-900">{nama}</span>
        <ChevronRight size={18} className="mt-0.5 shrink-0 text-slate-300" />
      </div>
      <span className="text-xs text-slate-500">{total} SKU</span>
      {warning > 0 ? (
        <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white">{warning} SKU Untransacted</span>
      ) : (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
          <CheckCircle2 size={14} /> Semua aktif
        </span>
      )}
    </button>
  );
}

// ───────────────────────── SKU Listing & Warning ─────────────────────────

export function MtDivisiPage() {
  const kodeToko = useKodeToko();
  const { divisi: divParam = 'semua' } = useParams();
  const { D } = useSalesSession();
  const nav = useNavigate();
  const list = useMslToko(kodeToko, D);
  const div = ringkasDivisi(list);
  const pilih = decodeURIComponent(divParam);
  const [hanyaWarning, setHanyaWarning] = useState(false);
  const tampil = list.filter((s) => (pilih === 'semua' || s.divisi === pilih) && (!hanyaWarning || s.warning));
  const opsi = [{ value: 'semua', label: `Semua (${list.filter((s) => s.warning).length}⚠)` }, ...div.map((d) => ({ value: d.divisi, label: d.warning ? `${d.divisi} (${d.warning}⚠)` : d.divisi }))];

  return (
    <div className="min-h-dvh bg-slate-50 pb-28">
      <StoreHeader kodeToko={kodeToko} back={() => nav(`/mt/toko/${encodeURIComponent(kodeToko)}`)} subtitle={pilih === 'semua' ? 'Semua divisi' : pilih} />
      <main className="mx-auto max-w-md space-y-3 px-4 py-3">
        <Chips label="Divisi" value={pilih} onChange={(v) => nav(`/mt/toko/${encodeURIComponent(kodeToko)}/divisi/${encodeURIComponent(v)}`, { replace: true })} options={opsi} />
        <label className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm shadow-card">
          <span className="text-slate-700">Hanya SKU belum transaksi</span>
          <input type="checkbox" checked={hanyaWarning} onChange={(e) => setHanyaWarning(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
        </label>
        {tampil.length === 0 ? (
          <EmptyState icon={<CheckCircle2 size={20} className="text-emerald-600" />} title={hanyaWarning ? 'Tidak ada SKU yang perlu di-follow up' : 'Tidak ada SKU'}>
            {hanyaWarning ? 'Semua SKU listed sudah order dalam 30 hari terakhir.' : 'Belum ada SKU listed di divisi ini.'}
          </EmptyState>
        ) : (
          <ul className="space-y-2">
            {tampil.map((s) => (
              <SkuRow key={s.kode_sku} s={s} kodeToko={kodeToko} D={D} />
            ))}
          </ul>
        )}
      </main>
      <CartBar kodeToko={kodeToko} />
    </div>
  );
}

// ───────────────────────── Purchase Order ─────────────────────────

export function MtPOPage() {
  const kodeToko = useKodeToko();
  const { kode: sales, D } = useSalesSession();
  const { produk, masterIdx, keranjang, setQtyKeranjang, kosongkanKeranjang, submitPO } = useData();
  const nav = useNavigate();
  const toast = useToast();
  const d = useDetailToko(kodeToko, D);
  const list = useMslToko(kodeToko, D);
  const k = keranjang[kodeToko] ?? {};
  const outlet = masterIdx.get(kodeToko);
  const v = validasiPO(k, produk, outlet, d.totalOutstanding);
  const byKode = useMemo(() => new Map(list.map((s) => [s.kode_sku, s])), [list]);
  const [konfirmasi, setKonfirmasi] = useState(false);
  const akanTeratasi = v.items.filter((i) => byKode.get(i.kode_sku)?.warning).length;

  const kirim = () => {
    const po = submitPO({ id: newId(), kode_toko: kodeToko, kode_salesman: sales, tanggal: D, items: v.items, total: v.total, status: 'TERKIRIM', createdAt: new Date().toISOString() });
    kosongkanKeranjang(kodeToko);
    setKonfirmasi(false);
    toast(akanTeratasi ? `${po.no_po} terkirim · ${akanTeratasi} warning SKU teratasi` : `${po.no_po} terkirim ke ERP`);
    nav(`/mt/toko/${encodeURIComponent(kodeToko)}`, { replace: true });
  };

  return (
    <div className="min-h-dvh bg-slate-50 pb-28">
      <StoreHeader kodeToko={kodeToko} back={() => nav(-1)} subtitle="Purchase Order" />
      <main className="mx-auto max-w-md space-y-3 px-4 py-4">
        <KreditCard blokir={!!outlet?.status_blokir} limit={outlet?.limit_kredit} outstanding={d.totalOutstanding} totalPO={v.total} />
        {!v.kredit.boleh && v.items.length > 0 && !outlet?.status_blokir && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {v.kredit.alasan}
          </p>
        )}
        {v.items.length === 0 ? (
          <EmptyState
            icon={<ShoppingCart size={20} />}
            title="Keranjang kosong"
            action={<Button onClick={() => nav(`/mt/toko/${encodeURIComponent(kodeToko)}/divisi/semua`)}>Pilih SKU</Button>}
          >
            Tambahkan SKU dari daftar MSL. SKU dengan warning ditampilkan paling atas.
          </EmptyState>
        ) : (
          <>
            {akanTeratasi > 0 && (
              <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                PO ini akan mengaktifkan kembali <span className="font-semibold">{akanTeratasi} SKU</span> yang belum transaksi &gt; 30 hari.
              </p>
            )}
            <ul className="space-y-2">
              {v.items.map((i) => {
                const s = byKode.get(i.kode_sku);
                const p = produk.find((x) => x.kode_sku === i.kode_sku)!;
                const err = v.errorItem[i.kode_sku];
                return (
                  <li key={i.kode_sku}>
                    <Card className={cn('p-3', err && 'border-red-200')}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold leading-snug text-slate-900">{i.nama_sku}</div>
                          <div className="text-xs text-slate-500">
                            {i.divisi} · {formatRupiah(i.harga)}/{i.satuan}
                          </div>
                          {s?.warning && <Badge tone="red">Warning akan hilang</Badge>}
                        </div>
                        <button type="button" aria-label={`Hapus ${i.nama_sku}`} onClick={() => setQtyKeranjang(kodeToko, i.kode_sku, 0)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600">
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <NumberStepper label={`qty ${i.nama_sku}`} value={i.qty} step={p.kelipatan} onIncrementFromZero={p.moq} invalid={!!err} onChange={(n) => setQtyKeranjang(kodeToko, i.kode_sku, n)} />
                        <span className="text-sm font-semibold tabular text-slate-900">{formatRupiah(i.subtotal)}</span>
                      </div>
                      {err && (
                        <p role="alert" className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700">
                          {err}
                        </p>
                      )}
                    </Card>
                  </li>
                );
              })}
            </ul>
            <Button variant="secondary" block onClick={() => nav(`/mt/toko/${encodeURIComponent(kodeToko)}/divisi/semua`)}>
              + Tambah SKU lain
            </Button>
          </>
        )}
      </main>
      {v.items.length > 0 && (
        <ActionBar>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-slate-500">{v.items.length} SKU</div>
            <div className="whitespace-nowrap text-base font-bold tabular text-slate-900">{formatRupiah(v.total)}</div>
          </div>
          <Button size="lg" disabled={!v.bolehSubmit} onClick={() => setKonfirmasi(true)}>
            <PackagePlus size={18} /> Submit PO
          </Button>
        </ActionBar>
      )}
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
    </div>
  );
}
