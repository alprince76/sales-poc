import { AlertOctagon, CalendarClock, CheckCircle2, HandCoins, ListChecks, ShoppingCart, Store, Target } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Card, DateNav, ProgressBar, SummaryCard } from '../../components/ui';
import { hitungKunjungan, indexFaktur, nilaiFaktur, normKode, type FakturDinilai } from '../../lib/billing';
import { ringkasPenagihan } from '../../lib/collection';
import type { ISODate } from '../../lib/dates';
import { formatRupiah } from '../../lib/format';
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
  const { raw, data, fakturIdx, masterIdx, salesmen, aktivitas } = useData();
  return useMemo(() => {
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
        };
      });
  }, [raw, data, fakturIdx, masterIdx, salesmen, aktivitas, D]);
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
  const { data, channelToko } = useData();
  const rows = useRingkasanGT(D);
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
    }),
    { kunjungan: 0, selesai: 0, totalAR: 0, diAkhir: 0, belum: 0, janji: 0, badDebt: 0, poCount: 0, poNilai: 0 },
  );

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
    <AdminPage title="Dashboard GT" description="General Trade: kunjungan, AR & collection, dan PO per salesman." actions={<Tanggal D={D} setD={setD} />}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <SummaryCard label="Kunjungan selesai" icon={<CheckCircle2 size={12} />} value={`${tot.selesai}/${tot.kunjungan}`} accent="green" />
        <SummaryCard label="Total AR" icon={<Target size={12} />} value={formatRupiah(tot.totalAR)} hint="Rute hari ini (JT+OD)" />
        <SummaryCard label="Total di akhir" icon={<HandCoins size={12} />} value={formatRupiah(tot.diAkhir)} accent="green" hint={`${pct}% dari Total AR`} />
        <SummaryCard label="Belum tertagih" icon={<AlertOctagon size={12} />} value={formatRupiah(tot.belum)} accent={tot.belum ? 'red' : undefined} />
        <SummaryCard label="JB/BD" icon={<CalendarClock size={12} />} value={`${tot.janji} / ${tot.badDebt}`} hint={`Janji bayar / bad debt`} />
        <SummaryCard label="Nilai PO" icon={<ShoppingCart size={12} />} value={formatRupiah(tot.poNilai)} accent="brand" hint={`${tot.poCount} PO`} />
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
                <th className="text-right">Total di akhir</th>
                <th className="text-right">Belum tertagih</th>
                <th className="text-right" title="Janji bayar / bad debt">JB/BD</th>
                <th className="text-right">PO</th>
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
                <td className="text-right tabular">
                  {r.janji} / <span className={r.badDebt ? 'text-red-600' : ''}>{r.badDebt}</span>
                </td>
                <td className="whitespace-nowrap text-right tabular">
                  {formatRupiah(r.poNilai)}
                  <div className="text-xs text-slate-500">{r.poCount} PO</div>
                </td>
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
    </AdminPage>
  );
}

// ───────────────────────── Dashboard MT ─────────────────────────

/** Ringkasan per SR MT: toko order, MSL compliance, SKU belum transaksi, PO. */
function useRingkasanMT(D: ISODate) {
  const { data, salesmen, aktivitas, produkMT, mslIdx, trxIdx, masterIdx } = useData();
  return useMemo(() => {
    const skuWarning = new Map<string, { nama: string; principal: string; toko: number }>();
    const rows = salesmen
      .filter((s) => s.channel === 'MT')
      .map((s) => {
        const toko = [...new Set(data.pjp.filter((p) => normKode(p.kode_salesman) === s.kode && p.tanggal_kunjungan === D).map((p) => normKode(p.kode_toko)))];
        const po = aktivitas.po.filter((p) => p.kode_salesman === s.kode && p.tanggal === D);
        const tokoPO = new Set(po.map((p) => p.kode_toko));
        let listed = 0;
        let warning = 0;
        for (const k of toko) {
          const list = daftarSkuMSL({ produk: produkMT, mslIdx, trxIdx }, k, D);
          const c = compliance(list);
          listed += c.listed;
          warning += c.warning;
          for (const x of list)
            if (x.warning) {
              const e = skuWarning.get(x.kode_sku) ?? { nama: x.nama_sku, principal: x.divisi, toko: 0 };
              e.toko++;
              skuWarning.set(x.kode_sku, e);
            }
        }
        return {
          ...s,
          kunjungan: toko.length,
          tokoOrder: toko.filter((k) => tokoPO.has(k)).length,
          listed,
          warning,
          persen: listed ? Math.round(((listed - warning) / listed) * 100) : 100,
          poCount: po.length,
          poNilai: po.reduce((a, p) => a + p.total, 0),
        };
      });
    const topSku = [...skuWarning].map(([kode, v]) => ({ kode, ...v })).sort((a, b) => b.toko - a.toko || a.nama.localeCompare(b.nama)).slice(0, 8);
    return { rows, topSku, masterIdx };
  }, [data.pjp, salesmen, aktivitas.po, produkMT, mslIdx, trxIdx, masterIdx, D]);
}

export function DashboardMTPage() {
  const [D, setD] = useState(DEFAULT_DATE);
  const { rows, topSku } = useRingkasanMT(D);
  const tot = rows.reduce(
    (a, r) => ({ kunjungan: a.kunjungan + r.kunjungan, tokoOrder: a.tokoOrder + r.tokoOrder, listed: a.listed + r.listed, warning: a.warning + r.warning, poCount: a.poCount + r.poCount, poNilai: a.poNilai + r.poNilai }),
    { kunjungan: 0, tokoOrder: 0, listed: 0, warning: 0, poCount: 0, poNilai: 0 },
  );
  const persen = tot.listed ? Math.round(((tot.listed - tot.warning) / tot.listed) * 100) : 100;

  return (
    <AdminPage title="Dashboard MT" description="Modern Trade: toko order, MSL compliance, dan PO per SR." actions={<Tanggal D={D} setD={setD} />}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard label="Toko order" icon={<Store size={12} />} value={`${tot.tokoOrder}/${tot.kunjungan}`} accent="green" hint="Toko PJP dengan PO" />
        <SummaryCard label="MSL compliance" icon={<ListChecks size={12} />} value={`${persen}%`} hint={`${tot.listed - tot.warning}/${tot.listed} SKU listed aktif`} />
        <SummaryCard label="SKU belum transaksi" icon={<AlertOctagon size={12} />} value={tot.warning} accent={tot.warning ? 'red' : undefined} hint="Listed, no order > 30 hari" />
        <SummaryCard label="Nilai PO" icon={<ShoppingCart size={12} />} value={formatRupiah(tot.poNilai)} accent="brand" hint={`${tot.poCount} PO`} />
      </div>

      <div className="mt-5 grid gap-5 2xl:grid-cols-[1fr_380px]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="font-semibold text-slate-900">Per SR</h2>
            <Link to="/admin/msl" className="text-sm font-medium text-brand-700 hover:underline">
              MSL Compliance
            </Link>
          </div>
          <Table
            maxH=""
            head={
              <tr>
                <th>SR</th>
                <th>Toko order</th>
                <th>MSL compliance</th>
                <th className="text-right">SKU belum transaksi</th>
                <th className="text-right">PO</th>
              </tr>
            }
          >
            {rows.map((r) => (
              <tr key={r.kode}>
                <td>
                  <div className="font-medium text-slate-900">{r.nama}</div>
                  <div className="text-xs text-slate-500">{r.kode}</div>
                </td>
                <td className="min-w-[120px]">
                  <div className="mb-1 text-xs tabular text-slate-600">
                    {r.tokoOrder}/{r.kunjungan} toko
                  </div>
                  <ProgressBar value={r.tokoOrder} max={r.kunjungan} tone="green" />
                </td>
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
        </Card>

        <Card className="p-4 2xl:self-start">
          <h2 className="font-semibold text-slate-900">SKU paling banyak belum transaksi</h2>
          <p className="text-sm text-slate-500">Jumlah toko PJP hari ini dengan warning</p>
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
