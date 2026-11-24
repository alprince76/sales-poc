import { AlertOctagon, CheckCircle2, ChevronLeft, ChevronRight, HandCoins, Layers, ListChecks, ShoppingCart, Store, Target, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Card, DateNav, Input, ProgressBar, Segmented, Select, SummaryCard } from '../../components/ui';
import { hitungKunjungan, indexFaktur, nilaiFaktur, normKode, type FakturDinilai } from '../../lib/billing';
import { ringkasPenagihan } from '../../lib/collection';
import { addDays, bulanDari, formatBulan, geserBulan, todayJakarta, type ISODate } from '../../lib/dates';
import { formatRupiah } from '../../lib/format';
import { ringkasPO } from '../../lib/order';
import { progres } from '../../lib/visit';
import { compliance, daftarSkuMSL } from '../../lib/msl';
import { DEFAULT_DATE, useData } from '../../state';
import { AdminPage, Table } from './AdminLayout';

const BUCKET = [
  { label: 'Belum JT', test: (f: FakturDinilai) => f.status === 'BELUM_JATUH_TEMPO', color: 'bg-sky-400' },
  { label: 'JT hari ini', test: (f: FakturDinilai) => f.status === 'JATUH_TEMPO_HARI_INI', color: 'bg-orange-400' },
  { label: '1–7 hari', test: (f: FakturDinilai) => f.status === 'OVERDUE' && f.hariTerlambat <= 7, color: 'bg-red-300' },
  { label: '8–30 hari', test: (f: FakturDinilai) => f.status === 'OVERDUE' && f.hariTerlambat > 7 && f.hariTerlambat <= 30, color: 'bg-red-500' },
  { label: '> 30 hari', test: (f: FakturDinilai) => f.status === 'OVERDUE' && f.hariTerlambat > 30, color: 'bg-red-700' },
];

/** Ringkasan per salesman GT: AR, collection, kunjungan, PO. */
function useRingkasanGT(D: ISODate) {
  const { raw, data, fakturIdx, masterIdx, salesmen, aktivitas, produk, channelToko } = useData();
  return useMemo(() => {
    const produkMap = new Map(produk.map((p) => [p.kode_sku, p]));
    const rawIdx = indexFaktur(raw.rovi);
    return salesmen
      .filter((s) => s.channel === 'GT')
      .map((s) => {
        const awal = hitungKunjungan(raw, s.kode, D, { fakturIdx: rawIdx, masterIdx });
        const kini = hitungKunjungan(data, s.kode, D, { fakturIdx, masterIdx });
        const pen = ringkasPenagihan(aktivitas.penagihan.filter((p) => p.kode_salesman === s.kode && p.tanggal === D));
        const po = aktivitas.po.filter((p) => p.kode_salesman === s.kode && p.tanggal === D);
        const prog = progres(aktivitas.kunjungan, s.kode, D, awal.baris.map((b) => b.kode_toko));
        return {
          ...s,
          selesai: prog.selesai,
          kunjungan: awal.jumlahKunjungan,
          perluDitagih: awal.jumlahPerluDitagih,
          totalAR: awal.totalTagihan,
          belumTertagih: kini.totalTagihan,
          diAkhir: pen.terkumpul,
          janji: pen.jumlahJanji,
          badDebt: pen.jumlahBadDebt,
          poCount: po.length,
          poNilai: po.reduce((a, p) => a + p.total, 0),
          ...ringkasPO(po, produkMap, channelToko),
        };
      });
  }, [raw, data, fakturIdx, masterIdx, salesmen, aktivitas, D, produk, channelToko]);
}

/** Resume bulanan per salesman GT (hanya data aktivitas + PJP; tanpa AR/aging yang dihitung per hari). */
function useRingkasanGTBulan(bulan: string) {
  const { data, salesmen, aktivitas, produk, channelToko } = useData();
  return useMemo(() => {
    const produkMap = new Map(produk.map((p) => [p.kode_sku, p]));
    return salesmen
      .filter((s) => s.channel === 'GT')
      .map((s) => {
        const plan = new Set(data.pjp.filter((p) => normKode(p.kode_salesman) === s.kode && p.tanggal_kunjungan.startsWith(bulan)).map((p) => `${p.tanggal_kunjungan}|${normKode(p.kode_toko)}`));
        const selesai = aktivitas.kunjungan.filter((k) => k.kode_salesman === s.kode && !!k.selesaiAt && plan.has(`${k.tanggal}|${k.kode_toko}`)).length;
        const pen = ringkasPenagihan(aktivitas.penagihan.filter((p) => p.kode_salesman === s.kode && p.tanggal.startsWith(bulan)));
        const po = ringkasPO(aktivitas.po.filter((p) => p.kode_salesman === s.kode && p.tanggal.startsWith(bulan)), produkMap, channelToko);
        return { ...s, selesai, kunjungan: plan.size, diAkhir: pen.terkumpul, ...po };
      });
  }, [data.pjp, salesmen, aktivitas, produk, channelToko, bulan]);
}

function Periode({ mode, setMode, bulan, setBulan }: { mode: 'hari' | 'bulan'; setMode: (m: 'hari' | 'bulan') => void; bulan: string; setBulan: (b: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <Segmented label="Periode" value={mode} onChange={setMode} options={[{ value: 'hari', label: 'Harian' }, { value: 'bulan', label: 'Bulanan' }]} />
      {mode === 'bulan' && (
        <div className="flex items-center rounded-xl border border-slate-200 bg-white">
          <button type="button" aria-label="Bulan sebelumnya" onClick={() => setBulan(geserBulan(bulan, -1))} className="flex h-10 w-9 items-center justify-center text-slate-600 hover:bg-slate-50">
            <ChevronLeft size={16} />
          </button>
          <span className="w-32 text-center text-sm font-semibold text-slate-900">{formatBulan(bulan)}</span>
          <button type="button" aria-label="Bulan berikutnya" onClick={() => setBulan(geserBulan(bulan, 1))} className="flex h-10 w-9 items-center justify-center text-slate-600 hover:bg-slate-50">
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

function Tanggal({ D, setD }: { D: ISODate; setD: (d: ISODate) => void }) {
  return (
    <div className="w-72">
      <DateNav value={D} onChange={setD} />
    </div>
  );
}

// ───────────────────────── Dashboard GT ─────────────────────────

export function DashboardGTPage() {
  const [D, setD] = useState(DEFAULT_DATE);
  const [mode, setMode] = useState<'hari' | 'bulan'>('hari');
  const [bulan, setBulan] = useState(() => bulanDari(DEFAULT_DATE));
  const { data, channelToko } = useData();
  const rows = useRingkasanGT(D);
  const rowsBulan = useRingkasanGTBulan(bulan);
  const tot = rows.reduce(
    (a, r) => ({
      kunjungan: a.kunjungan + r.kunjungan,
      selesai: a.selesai + r.selesai,
      totalAR: a.totalAR + r.totalAR,
      diAkhir: a.diAkhir + r.diAkhir,
      belum: a.belum + r.belumTertagih,
      janji: a.janji + r.janji,
      badDebt: a.badDebt + r.badDebt,
      poCount: a.poCount + r.poCount,
      poNilai: a.poNilai + r.poNilai,
      ec: a.ec + r.ec,
      item: a.item + r.totalItem,
    }),
    { kunjungan: 0, selesai: 0, totalAR: 0, diAkhir: 0, belum: 0, janji: 0, badDebt: 0, poCount: 0, poNilai: 0, ec: 0, item: 0 },
  );
  const totB = rowsBulan.reduce(
    (a, r) => ({ kunjungan: a.kunjungan + r.kunjungan, selesai: a.selesai + r.selesai, diAkhir: a.diAkhir + r.diAkhir, ec: a.ec + r.ec, item: a.item + r.totalItem, nilai: a.nilai + r.nilai }),
    { kunjungan: 0, selesai: 0, diAkhir: 0, ec: 0, item: 0, nilai: 0 },
  );
  const perEc = (item: number, ec: number) => (ec ? (Math.round((item / ec) * 10) / 10).toLocaleString('id-ID') : '0');

  const aging = useMemo(() => {
    const f = data.rovi
      .filter((x) => channelToko(x.kode_toko) === 'GT')
      .map((x) => nilaiFaktur(x, D))
      .filter((x): x is FakturDinilai => !!x);
    const total = f.reduce((s, x) => s + x.sisa_tagihan, 0);
    return { total, buckets: BUCKET.map((b) => ({ ...b, nilai: f.filter(b.test).reduce((s, x) => s + x.sisa_tagihan, 0), n: f.filter(b.test).length })) };
  }, [data.rovi, D, channelToko]);


  const pct = tot.totalAR ? Math.round((tot.diAkhir / tot.totalAR) * 100) : 0;

  return (
    <AdminPage
      title="Dashboard GT"
      description="General Trade: call vs plan, AR collection, EC & item per salesman."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Periode mode={mode} setMode={setMode} bulan={bulan} setBulan={setBulan} />
          {mode === 'hari' && <Tanggal D={D} setD={setD} />}
        </div>
      }
    >
      {mode === 'bulan' ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <SummaryCard label="CALL VS PLAN CALL" icon={<CheckCircle2 size={12} />} value={`${totB.selesai}/${totB.kunjungan}`} accent="green" />
            <SummaryCard label="AR COLLECTION" icon={<HandCoins size={12} />} value={formatRupiah(totB.diAkhir)} accent="green" />
            <SummaryCard label="TOTAL EC" icon={<Users size={12} />} value={totB.ec} accent="brand" />
            <SummaryCard label="TOTAL ITEM" icon={<Layers size={12} />} value={totB.item} accent="brand" hint="SKU memenuhi MOQ" />
            <SummaryCard label="ITEM/EC" value={perEc(totB.item, totB.ec)} accent="brand" />
            <SummaryCard label="TOTAL NILAI PO" icon={<ShoppingCart size={12} />} value={formatRupiah(totB.nilai)} accent="brand" />
          </div>
          <Card className="mt-5 overflow-hidden">
            <div className="px-4 py-3">
              <h2 className="font-semibold text-slate-900">Per salesman · {formatBulan(bulan)}</h2>
            </div>
            <Table
              maxH=""
              head={
                <tr>
                  <th>Salesman</th>
                  <th className="text-right">Call vs Plan</th>
                  <th className="text-right">AR Collection</th>
                  <th className="text-right">EC</th>
                  <th className="text-right">Item</th>
                  <th className="text-right">Item/EC</th>
                  <th className="text-right">Nilai PO</th>
                </tr>
              }
            >
              {rowsBulan.map((r) => (
                <tr key={r.kode}>
                  <td>
                    <div className="font-medium text-slate-900">{r.nama}</div>
                    <div className="text-xs text-slate-500">{r.kode}</div>
                  </td>
                  <td className="whitespace-nowrap text-right tabular">
                    {r.selesai}/{r.kunjungan}
                  </td>
                  <td className="whitespace-nowrap text-right tabular font-medium text-emerald-700">{formatRupiah(r.diAkhir)}</td>
                  <td className="text-right tabular">{r.ec}</td>
                  <td className="text-right tabular">{r.totalItem}</td>
                  <td className="text-right tabular">{r.itemPerEc.toLocaleString('id-ID')}</td>
                  <td className="whitespace-nowrap text-right tabular">{formatRupiah(r.nilai)}</td>
                </tr>
              ))}
            </Table>
          </Card>
        </>
      ) : (
      <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard label="CALL VS PLAN CALL" icon={<CheckCircle2 size={12} />} value={`${tot.selesai}/${tot.kunjungan}`} accent="green" />
        <SummaryCard label="Total AR" icon={<Target size={12} />} value={formatRupiah(tot.totalAR)} hint="Rute hari ini (JT+OD)" />
        <SummaryCard label="AR COLLECTION" icon={<HandCoins size={12} />} value={formatRupiah(tot.diAkhir)} accent="green" hint={`${pct}% dari Total AR`} />
        <SummaryCard label="Belum tertagih" icon={<AlertOctagon size={12} />} value={formatRupiah(tot.belum)} accent={tot.belum ? 'red' : undefined} />
        <SummaryCard label="TOTAL EC" icon={<Users size={12} />} value={tot.ec} accent="brand" />
        <SummaryCard label="TOTAL ITEM" icon={<Layers size={12} />} value={tot.item} accent="brand" hint="SKU memenuhi MOQ" />
        <SummaryCard label="ITEM/EC" value={perEc(tot.item, tot.ec)} accent="brand" />
        <SummaryCard label="TOTAL NILAI PO" icon={<ShoppingCart size={12} />} value={formatRupiah(tot.poNilai)} accent="brand" />
      </div>

      <div className="mt-5 grid gap-5 2xl:grid-cols-[1fr_380px]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="font-semibold text-slate-900">Per salesman</h2>
            <Link to="/admin/rute" className="text-sm font-medium text-brand-700 hover:underline">
              Lihat rute
            </Link>
          </div>
          <Table
            maxH=""
            head={
              <tr>
                <th>Salesman</th>
                <th>Kunjungan</th>
                <th className="text-right">Total AR</th>
                <th className="text-right">AR Collection</th>
                <th className="text-right">Belum tertagih</th>
                <th className="text-right">EC</th>
                <th className="text-right">Item</th>
                <th className="text-right">Item/EC</th>
                <th className="text-right">Nilai PO</th>
              </tr>
            }
          >
            {rows.map((r) => (
              <tr key={r.kode}>
                <td>
                  <div className="font-medium text-slate-900">{r.nama}</div>
                  <div className="text-xs text-slate-500">{r.kode}</div>
                </td>
                <td className="min-w-[140px]">
                  <div className="mb-1 whitespace-nowrap text-xs tabular text-slate-600">
                    {r.selesai}/{r.kunjungan} selesai · {r.perluDitagih} perlu ditagih
                  </div>
                  <ProgressBar value={r.selesai} max={r.kunjungan} tone="green" />
                </td>
                <td className="whitespace-nowrap text-right tabular">{formatRupiah(r.totalAR)}</td>
                <td className="whitespace-nowrap text-right tabular font-medium text-emerald-700">{formatRupiah(r.diAkhir)}</td>
                <td className="whitespace-nowrap text-right tabular">{formatRupiah(r.belumTertagih)}</td>
                <td className="text-right tabular">{r.ec}</td>
                <td className="text-right tabular">{r.totalItem}</td>
                <td className="text-right tabular">{r.itemPerEc.toLocaleString('id-ID')}</td>
                <td className="whitespace-nowrap text-right tabular">{formatRupiah(r.poNilai)}</td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card className="p-4 2xl:self-start">
          <h2 className="font-semibold uppercase tracking-wide text-slate-900">AR Outstanding</h2>
          <p className="text-sm text-slate-500">Total {formatRupiah(aging.total)} · toko GT</p>
          <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-slate-100">
            {aging.buckets.map((b) => (
              <div key={b.label} className={b.color} style={{ width: `${aging.total ? (b.nilai / aging.total) * 100 : 0}%` }} title={`${b.label}: ${formatRupiah(b.nilai)}`} />
            ))}
          </div>
          <ul className="mt-4 space-y-2.5">
            {aging.buckets.map((b) => (
              <li key={b.label} className="flex items-center justify-between gap-2 text-sm">
                <span className="inline-flex items-center gap-2 text-slate-700">
                  <span className={`h-2.5 w-2.5 rounded-sm ${b.color}`} aria-hidden />
                  {b.label}
                  <span className="text-xs text-slate-400">{b.n} faktur</span>
                </span>
                <span className="font-medium tabular text-slate-900">{formatRupiah(b.nilai)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      </>
      )}
    </AdminPage>
  );
}

// ───────────────────────── Dashboard MT ─────────────────────────

/** Ringkasan per Store MT (toko PJP hari D): SR, status order, MSL compliance, SKU belum transaksi, PO. */
function useRingkasanMT(D: ISODate, bulan: string | null = null) {
  const { data, salesmen, aktivitas, produkMT, mslIdx, trxIdx, masterIdx } = useData();
  return useMemo(() => {
    // Harian: tanggal D. Bulanan: seluruh bulan; compliance dihitung per tanggal acuan (hari ini bila bulan berjalan, selain itu akhir bulan; transaksi s.d. tanggal itu ikut dihitung).
    const cocokPeriode = (t: string) => (bulan ? t.startsWith(bulan) : t === D);
    const akhirBulan = bulan ? addDays(`${geserBulan(bulan, 1)}-01`, -1) : D;
    const hariIni = todayJakarta();
    const acuan = bulan ? (akhirBulan < hariIni ? akhirBulan : hariIni) : D;
    const skuWarning = new Map<string, { nama: string; principal: string; toko: number }>();
    const rows = salesmen
      .filter((s) => s.channel === 'MT')
      .flatMap((s) => {
        const toko = [...new Set(data.pjp.filter((p) => normKode(p.kode_salesman) === s.kode && cocokPeriode(p.tanggal_kunjungan)).map((p) => normKode(p.kode_toko)))];
        return toko.map((k) => {
          const po = aktivitas.po.filter((p) => p.kode_salesman === s.kode && cocokPeriode(p.tanggal) && normKode(p.kode_toko) === k);
          const list = daftarSkuMSL({ produk: produkMT, mslIdx, trxIdx }, k, acuan);
          const c = compliance(list);
          for (const x of list)
            if (x.warning) {
              const e = skuWarning.get(x.kode_sku) ?? { nama: x.nama_sku, principal: x.divisi, toko: 0 };
              e.toko++;
              skuWarning.set(x.kode_sku, e);
            }
          return {
            kode_toko: k,
            nama_toko: masterIdx.get(k)?.nama_toko ?? k,
            sr: s.nama,
            kode_sr: s.kode,
            order: po.length > 0,
            listed: c.listed,
            warning: c.warning,
            persen: c.persen,
            poCount: po.length,
            poNilai: po.reduce((a, p) => a + p.total, 0),
          };
        });
      })
      .sort((a, b) => Number(a.order) - Number(b.order) || b.warning - a.warning || a.nama_toko.localeCompare(b.nama_toko));
    const topSku = [...skuWarning].map(([kode, v]) => ({ kode, ...v })).sort((a, b) => b.toko - a.toko || a.nama.localeCompare(b.nama)).slice(0, 8);
    return { rows, topSku, masterIdx };
  }, [data.pjp, salesmen, aktivitas.po, produkMT, mslIdx, trxIdx, masterIdx, D, bulan]);
}

export function DashboardMTPage() {
  const [D, setD] = useState(DEFAULT_DATE);
  const [mode, setMode] = useState<'hari' | 'bulan'>('hari');
  const [bulan, setBulan] = useState(() => bulanDari(DEFAULT_DATE));
  const [sr, setSr] = useState('');
  const [cari, setCari] = useState('');
  const { salesmen } = useData();
  const { rows, topSku } = useRingkasanMT(D, mode === 'bulan' ? bulan : null);
  const tot = rows.reduce(
    (a, r) => ({ kunjungan: a.kunjungan + 1, tokoOrder: a.tokoOrder + (r.order ? 1 : 0), listed: a.listed + r.listed, warning: a.warning + r.warning, poCount: a.poCount + r.poCount, poNilai: a.poNilai + r.poNilai }),
    { kunjungan: 0, tokoOrder: 0, listed: 0, warning: 0, poCount: 0, poNilai: 0 },
  );
  const persen = tot.listed ? Math.round(((tot.listed - tot.warning) / tot.listed) * 100) : 100;
  const q = cari.trim().toLowerCase();
  const tampil = rows.filter((r) => (!sr || r.kode_sr === sr) && (!q || r.nama_toko.toLowerCase().includes(q) || r.kode_toko.toLowerCase().includes(q)));

  return (
    <AdminPage
      title="Dashboard MT"
      description="Modern Trade: toko order, SKU Listed compliance, dan PO per toko."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Periode mode={mode} setMode={setMode} bulan={bulan} setBulan={setBulan} />
          {mode === 'hari' && <Tanggal D={D} setD={setD} />}
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard label="Toko order" icon={<Store size={12} />} value={`${tot.tokoOrder}/${tot.kunjungan}`} accent="green" hint="Toko PJP dengan PO" />
        <SummaryCard label="SKU Listed compliance" icon={<ListChecks size={12} />} value={`${persen}%`} hint={`${tot.listed - tot.warning}/${tot.listed} SKU listed aktif`} />
        <SummaryCard label="SKU belum transaksi" icon={<AlertOctagon size={12} />} value={tot.warning} accent={tot.warning ? 'red' : undefined} hint="Listed, no order > 30 hari" />
        <SummaryCard label="Nilai PO" icon={<ShoppingCart size={12} />} value={formatRupiah(tot.poNilai)} accent="brand" hint={`${tot.poCount} PO`} />
      </div>

      <div className="mt-5 grid gap-5 2xl:grid-cols-[1fr_380px]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="font-semibold text-slate-900">Per Store{mode === 'bulan' ? ` · ${formatBulan(bulan)}` : ''}</h2>
            <Link to="/admin/msl" className="text-sm font-medium text-brand-700 hover:underline">
              SKU Listed Compliance
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 p-3">
            <Select label="SR" value={sr} onChange={setSr}>
              <option value="">Semua SR</option>
              {salesmen
                .filter((s) => s.channel === 'MT')
                .map((s) => (
                  <option key={s.kode} value={s.kode}>
                    {s.nama} ({s.kode})
                  </option>
                ))}
            </Select>
            <Input value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari nama / kode toko" aria-label="Cari toko" className="h-10 w-56 text-sm" />
          </div>
          <Table
            maxH=""
            empty={!tampil.length && <div className="p-4 text-sm text-slate-500">Tidak ada toko PJP untuk filter ini.</div>}
            head={
              <tr>
                <th>Toko</th>
                <th>SR</th>
                <th>Status order</th>
                <th>SKU Listed compliance</th>
                <th className="text-right">SKU belum transaksi</th>
                <th className="text-right">PO</th>
              </tr>
            }
          >
            {tampil.slice(0, 200).map((r) => (
              <tr key={`${r.kode_sr}|${r.kode_toko}`}>
                <td>
                  <div className="font-medium text-slate-900">{r.nama_toko}</div>
                  <div className="text-xs text-slate-500">{r.kode_toko}</div>
                </td>
                <td>
                  <div className="text-slate-800">{r.sr}</div>
                  <div className="text-xs text-slate-500">{r.kode_sr}</div>
                </td>
                <td>{r.order ? <Badge tone="green">Sudah order</Badge> : <Badge tone="gray">Belum order</Badge>}</td>
                <td className="min-w-[140px]">
                  <div className="mb-1 text-xs tabular text-slate-600">
                    {r.persen}% · {r.listed - r.warning}/{r.listed} SKU
                  </div>
                  <ProgressBar value={r.listed - r.warning} max={r.listed} tone="green" />
                </td>
                <td className={`text-right tabular ${r.warning ? 'font-semibold text-red-600' : 'text-slate-400'}`}>{r.warning}</td>
                <td className="whitespace-nowrap text-right tabular">
                  {formatRupiah(r.poNilai)}
                  <div className="text-xs text-slate-500">{r.poCount} PO</div>
                </td>
              </tr>
            ))}
          </Table>
          {tampil.length > 200 && <p className="px-4 py-2 text-center text-xs text-slate-500">Menampilkan 200 dari {tampil.length}. Gunakan filter / pencarian.</p>}
        </Card>

        <Card className="p-4 2xl:self-start">
          <h2 className="font-semibold text-slate-900">SKU paling banyak belum transaksi</h2>
          <p className="text-sm text-slate-500">Jumlah toko PJP {mode === 'bulan' ? `bulan ${formatBulan(bulan)}` : 'hari ini'} dengan warning</p>
          {topSku.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">Tidak ada SKU warning.</p>
          ) : (
            <ul className="mt-4 space-y-2.5">
              {topSku.map((x) => (
                <li key={x.kode} className="flex items-start justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-800">{x.nama}</span>
                    <span className="text-xs text-slate-500">
                      {x.kode} · {x.principal}
                    </span>
                  </span>
                  <Badge tone="red" dot={false}>
                    {x.toko} toko
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </AdminPage>
  );
}
