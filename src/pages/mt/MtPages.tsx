import { Activity, AlertTriangle, CalendarX2, CheckCircle2, ChevronRight, PackageCheck, Route as RouteIcon, Search, ShoppingCart, Store, UserRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Card, cn, EmptyState, Input, ProgressBar, SectionTitle, Segmented, Select, SummaryCard } from '../../components/ui';
import { normKode } from '../../lib/billing';
import { formatTanggal } from '../../lib/dates';
import { formatRupiah } from '../../lib/format';
import { compliance, daftarSkuMSL } from '../../lib/msl';
import { formatJam, formatTimestamp, latestUpdate, useData } from '../../state';
import { SalesBody, SalesHeader, SalesLayout, type NavItem } from '../sales/SalesLayout';
import { useSalesSession } from '../sales/session';
import { useRuteMT, type BarisRuteMT } from './shared';

const NAV_MT: NavItem[] = [
  { to: '/mt', label: 'Rute', icon: RouteIcon, end: true },
  { to: '/mt/toko', label: 'Toko', icon: Store, end: true },
  { to: '/mt/order', label: 'Order', icon: ShoppingCart },
  { to: '/mt/aktivitas', label: 'Aktivitas', icon: Activity },
];

export function MtLayout() {
  return <SalesLayout nav={NAV_MT} />;
}

const MtBadge = () => (
  <span className="rounded bg-violet-100 px-1 py-px text-[10px] font-bold text-violet-700" aria-label="Modern Trade">
    MT
  </span>
);

const linkToko = (k: string) => `/mt/toko/${encodeURIComponent(k)}`;

function KartuTokoMT({ r, onClick }: { r: BarisRuteMT; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex w-full items-start gap-3 rounded-2xl border bg-white p-3 text-left shadow-card transition-colors hover:bg-slate-50 active:bg-slate-100',
          r.warning ? 'border-red-200' : 'border-slate-200/80',
        )}
      >
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold tabular text-slate-600">{r.urutan ?? '–'}</span>
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 break-words font-semibold leading-snug text-slate-900">{r.nama_toko}</div>
          <div className="truncate text-xs text-slate-500">
            {r.kode_toko}
            {r.area && ` · ${r.area}`}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {r.warning > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                <AlertTriangle size={12} strokeWidth={2.5} /> Ada {r.warning} SKU Belum Transaksi
              </span>
            ) : (
              <Badge tone="green">MSL aman</Badge>
            )}
            {r.keranjang > 0 && <Badge tone="brand">{r.keranjang} SKU di keranjang</Badge>}
            {r.poHariIni > 0 && <Badge tone="green">PO terkirim</Badge>}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-xs font-semibold tabular text-slate-700">{r.persen}%</span>
          <span className="text-[10px] text-slate-400">MSL aktif</span>
          <ChevronRight size={18} className="text-slate-300" aria-hidden />
        </div>
      </button>
    </li>
  );
}

// ───────────────────────── Rute (PJP hari ini) ─────────────────────────

export function MtRutePage() {
  const { kode, D } = useSalesSession();
  const nav = useNavigate();
  const [urutan, setUrutan] = useState<'prioritas' | 'rute'>('prioritas');
  const [filter, setFilter] = useState<'semua' | 'warning'>('semua');
  const rows = useRuteMT(kode, D, urutan);
  const totWarning = rows.reduce((s, r) => s + r.warning, 0);
  const tokoWarning = rows.filter((r) => r.warning).length;
  const listed = rows.reduce((s, r) => s + r.listed, 0);
  const tampil = filter === 'warning' ? rows.filter((r) => r.warning) : rows;

  return (
    <>
      <SalesHeader title="Kunjungan Hari Ini" badge={<MtBadge />} />
      <SalesBody>
        <div className="grid grid-cols-3 gap-2">
          <SummaryCard label="Kunjungan" value={rows.length} />
          <SummaryCard label="Toko perlu follow-up" value={tokoWarning} accent={tokoWarning ? 'red' : undefined} />
          <SummaryCard label="SKU untrans." value={totWarning} accent={totWarning ? 'red' : 'green'} />
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={<CalendarX2 size={20} />} title="Tidak ada jadwal kunjungan hari ini">
            Coba pilih tanggal lain.
          </EmptyState>
        ) : (
          <>
            <Card className="p-3">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium text-slate-700">MSL aktif di rute</span>
                <span className="font-semibold tabular text-slate-900">
                  {listed - totWarning}/{listed} SKU
                </span>
              </div>
              <ProgressBar value={listed - totWarning} max={listed} tone="green" />
            </Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Segmented
                label="Filter"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'semua', label: 'Semua' },
                  { value: 'warning', label: `Ada warning (${tokoWarning})` },
                ]}
              />
              <Segmented
                label="Urutan"
                value={urutan}
                onChange={setUrutan}
                options={[
                  { value: 'prioritas', label: 'Prioritas' },
                  { value: 'rute', label: 'Rute' },
                ]}
              />
            </div>
            {tampil.length === 0 ? (
              <EmptyState icon={<CheckCircle2 size={20} className="text-emerald-600" />} title="Semua toko MSL aman" />
            ) : (
              <ul className="space-y-2">
                {tampil.map((r) => (
                  <KartuTokoMT key={r.kode_toko} r={r} onClick={() => nav(linkToko(r.kode_toko))} />
                ))}
              </ul>
            )}
          </>
        )}
      </SalesBody>
    </>
  );
}

// ───────────────────────── Toko (coverage SR) ─────────────────────────

export function MtTokoListPage() {
  const { kode, D } = useSalesSession();
  const { data, produk, mslIdx, trxIdx } = useData();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const s = q.trim().toUpperCase();
    const jadwal = (k: string) => data.pjp.filter((p) => normKode(p.kode_salesman) === kode && p.kode_toko === k).map((p) => p.tanggal_kunjungan).sort();
    return data.master
      .filter((m) => normKode(m.kode_salesman) === kode && (!s || m.kode_toko.includes(s) || m.nama_toko.toUpperCase().includes(s)))
      .map((m) => ({ m, c: compliance(daftarSkuMSL({ produk, mslIdx, trxIdx }, m.kode_toko, D)), j: jadwal(m.kode_toko) }))
      .sort((a, b) => b.c.warning - a.c.warning || a.m.nama_toko.localeCompare(b.m.nama_toko));
  }, [data, produk, mslIdx, trxIdx, kode, D, q]);

  return (
    <>
      <SalesHeader title="Toko Saya" badge={<MtBadge />} />
      <SalesBody>
        <div className="relative">
          <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari kode / nama toko" className="pl-10" aria-label="Cari toko" />
        </div>
        <p className="text-sm text-slate-500">{rows.length} outlet MT</p>
        {rows.length === 0 ? (
          <EmptyState icon={<Store size={20} />} title="Toko tidak ditemukan" />
        ) : (
          <ul className="space-y-2">
            {rows.map(({ m, c, j }) => {
              const berikut = j.find((t) => t >= D);
              return (
                <li key={m.kode_toko}>
                  <button type="button" onClick={() => nav(linkToko(m.kode_toko))} className="flex w-full items-start gap-3 rounded-2xl border border-slate-200/80 bg-white p-3 text-left shadow-card hover:bg-slate-50">
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-2 break-words font-semibold leading-snug text-slate-900">{m.nama_toko}</div>
                      <div className="truncate text-xs text-slate-500">
                        {m.kode_toko} · {m.tipe_outlet ?? 'MT'}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {c.warning > 0 ? <Badge tone="red">{c.warning} SKU belum transaksi</Badge> : <Badge tone="green">MSL aman</Badge>}
                        {berikut && <Badge tone={berikut === D ? 'brand' : 'gray'} dot={berikut === D}>{berikut === D ? 'Jadwal hari ini' : `Jadwal ${formatTanggal(berikut)}`}</Badge>}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="text-xs font-semibold tabular text-slate-700">{c.persen}%</span>
                      <ChevronRight size={18} className="text-slate-300" />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </SalesBody>
    </>
  );
}

// ───────────────────────── Order (keranjang & PO) ─────────────────────────

export function MtOrderPage() {
  const { kode, D } = useSalesSession();
  const { keranjang, produk, masterIdx, aktivitas } = useData();
  const nav = useNavigate();
  const harga = (sku: string) => produk.find((p) => p.kode_sku === sku)?.harga ?? 0;
  const draft = Object.entries(keranjang)
    .filter(([toko, k]) => Object.keys(k).length && normKode(masterIdx.get(toko)?.kode_salesman) === kode)
    .map(([toko, k]) => ({ toko, n: Object.keys(k).length, total: Object.entries(k).reduce((s, [sku, q]) => s + q * harga(sku), 0) }));
  const po = aktivitas.po.filter((p) => p.kode_salesman === kode && p.tanggal === D).slice().reverse();

  return (
    <>
      <SalesHeader title="Order" badge={<MtBadge />} />
      <SalesBody>
        <SectionTitle>Keranjang belum dikirim</SectionTitle>
        {draft.length === 0 ? (
          <EmptyState icon={<ShoppingCart size={20} />} title="Tidak ada keranjang">Tambahkan SKU dari halaman toko.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {draft.map((d) => (
              <li key={d.toko}>
                <button type="button" onClick={() => nav(`${linkToko(d.toko)}/po`)} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-3 text-left shadow-card hover:bg-slate-50">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-slate-900">{masterIdx.get(d.toko)?.nama_toko ?? d.toko}</div>
                    <div className="text-xs text-slate-500">{d.n} SKU</div>
                  </div>
                  <span className="flex items-center gap-1 text-sm font-semibold tabular">
                    {formatRupiah(d.total)} <ChevronRight size={18} className="text-slate-300" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <SectionTitle right={formatRupiah(po.reduce((s, p) => s + p.total, 0))}>PO terkirim hari ini</SectionTitle>
        {po.length === 0 ? (
          <p className="text-sm text-slate-500">Belum ada PO hari ini.</p>
        ) : (
          <Card className="divide-y divide-slate-100 px-4">
            {po.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <div className="font-mono text-sm text-slate-900">{p.no_po}</div>
                  <div className="truncate text-xs text-slate-500">
                    {masterIdx.get(p.kode_toko)?.nama_toko} · {p.items.length} SKU
                  </div>
                </div>
                <span className="text-sm font-semibold tabular">{formatRupiah(p.total)}</span>
              </div>
            ))}
          </Card>
        )}
      </SalesBody>
    </>
  );
}

// ───────────────────────── Aktivitas ─────────────────────────

export function MtAktivitasPage() {
  const { kode, setKode, D, salesmen } = useSalesSession();
  const { aktivitas, masterIdx, updatedAt } = useData();
  const rows = useRuteMT(kode, D);
  const po = aktivitas.po.filter((p) => p.kode_salesman === kode && p.tanggal === D);
  const tokoPO = new Set(po.map((p) => p.kode_toko));
  const listed = rows.reduce((s, r) => s + r.listed, 0);
  const warning = rows.reduce((s, r) => s + r.warning, 0);

  return (
    <>
      <SalesHeader title="Aktivitas" badge={<MtBadge />} />
      <SalesBody>
        <div className="grid grid-cols-2 gap-2">
          <SummaryCard label="Toko order" value={`${rows.filter((r) => tokoPO.has(r.kode_toko)).length}/${rows.length}`} accent="green" />
          <SummaryCard label="MSL aktif rute" value={`${listed ? Math.round(((listed - warning) / listed) * 100) : 100}%`} accent="green" />
          <SummaryCard label="PO terkirim" value={po.length} accent="brand" />
          <SummaryCard label="Nilai PO" value={formatRupiah(po.reduce((s, p) => s + p.total, 0))} accent="brand" />
        </div>
        <div>
          <SectionTitle>Riwayat hari ini</SectionTitle>
          {po.length === 0 ? (
            <EmptyState title="Belum ada aktivitas">Buka toko di menu Rute, follow-up SKU yang ditandai warning, lalu kirim PO.</EmptyState>
          ) : (
            <Card className="divide-y divide-slate-100 px-4">
              {po
                .slice()
                .reverse()
                .map((p) => (
                  <div key={p.id} className="flex items-start gap-3 py-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                      <PackageCheck size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-900">
                        PO {p.no_po} · {formatRupiah(p.total)}
                      </div>
                      <div className="truncate text-xs text-slate-500">
                        {masterIdx.get(p.kode_toko)?.nama_toko} · {p.items.length} SKU
                      </div>
                    </div>
                    <span className="shrink-0 text-xs tabular text-slate-400">{formatJam(p.createdAt)}</span>
                  </div>
                ))}
            </Card>
          )}
        </div>
        <Card className="space-y-3 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <UserRound size={16} /> Akun (demo)
          </div>
          <Select label="Ganti salesman" value={kode} onChange={setKode} className="w-full">
            {salesmen.map((s) => (
              <option key={s.kode} value={s.kode}>
                {s.nama} ({s.kode})
              </option>
            ))}
          </Select>
          <p className="text-xs text-slate-500">Data terakhir diperbarui: {formatTimestamp(latestUpdate(updatedAt))}</p>
        </Card>
      </SalesBody>
    </>
  );
}
