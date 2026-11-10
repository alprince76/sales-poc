import { AlertOctagon, CalendarClock, CheckCircle2, HandCoins, ShoppingCart, Target } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, DateNav, ProgressBar, SummaryCard } from '../../components/ui';
import { hitungKunjungan, indexFaktur, nilaiFaktur, type FakturDinilai } from '../../lib/billing';
import { penagihanTerakhir, ringkasPenagihan } from '../../lib/collection';
import type { ISODate } from '../../lib/dates';
import { formatRupiah } from '../../lib/format';
import { progres } from '../../lib/visit';
import { DEFAULT_DATE, useData } from '../../state';
import { AdminPage, Table } from './AdminLayout';

const BUCKET = [
  { label: 'Belum JT', test: (f: FakturDinilai) => f.status === 'BELUM_JATUH_TEMPO', color: 'bg-sky-400' },
  { label: 'JT hari ini', test: (f: FakturDinilai) => f.status === 'JATUH_TEMPO_HARI_INI', color: 'bg-orange-400' },
  { label: '1–7 hari', test: (f: FakturDinilai) => f.status === 'OVERDUE' && f.hariTerlambat <= 7, color: 'bg-red-300' },
  { label: '8–30 hari', test: (f: FakturDinilai) => f.status === 'OVERDUE' && f.hariTerlambat > 7 && f.hariTerlambat <= 30, color: 'bg-red-500' },
  { label: '> 30 hari', test: (f: FakturDinilai) => f.status === 'OVERDUE' && f.hariTerlambat > 30, color: 'bg-red-700' },
];

export function useRingkasanSR(D: ISODate) {
  const { raw, data, fakturIdx, masterIdx, salesmen, aktivitas } = useData();
  return useMemo(() => {
    const rawIdx = indexFaktur(raw.rovi);
    return salesmen.map((s) => {
      const target = hitungKunjungan(raw, s.kode, D, { fakturIdx: rawIdx, masterIdx });
      const sisa = hitungKunjungan(data, s.kode, D, { fakturIdx, masterIdx });
      const pen = ringkasPenagihan(aktivitas.penagihan.filter((p) => p.kode_salesman === s.kode && p.tanggal === D));
      const po = aktivitas.po.filter((p) => p.kode_salesman === s.kode && p.tanggal === D);
      const prog = progres(aktivitas.kunjungan, s.kode, D, target.baris.map((b) => b.kode_toko));
      return {
        ...s,
        kunjungan: target.jumlahKunjungan,
        selesai: prog.selesai,
        perluDitagih: target.jumlahPerluDitagih,
        target: target.totalTagihan,
        sisa: sisa.totalTagihan,
        terkumpul: pen.terkumpul,
        janji: pen.jumlahJanji,
        badDebt: pen.jumlahBadDebt,
        poCount: po.length,
        poNilai: po.reduce((a, p) => a + p.total, 0),
      };
    });
  }, [raw, data, fakturIdx, masterIdx, salesmen, aktivitas, D]);
}

export function DashboardPage() {
  const [D, setD] = useState(DEFAULT_DATE);
  const { data, aktivitas } = useData();
  const rows = useRingkasanSR(D);
  const tot = rows.reduce(
    (a, r) => ({
      kunjungan: a.kunjungan + r.kunjungan,
      selesai: a.selesai + r.selesai,
      target: a.target + r.target,
      terkumpul: a.terkumpul + r.terkumpul,
      badDebt: a.badDebt + r.badDebt,
      poCount: a.poCount + r.poCount,
      poNilai: a.poNilai + r.poNilai,
    }),
    { kunjungan: 0, selesai: 0, target: 0, terkumpul: 0, badDebt: 0, poCount: 0, poNilai: 0 },
  );

  const aging = useMemo(() => {
    const f = data.rovi.map((x) => nilaiFaktur(x, D)).filter((x): x is FakturDinilai => !!x);
    const total = f.reduce((s, x) => s + x.sisa_tagihan, 0);
    return { total, buckets: BUCKET.map((b) => ({ ...b, nilai: f.filter(b.test).reduce((s, x) => s + x.sisa_tagihan, 0), n: f.filter(b.test).length })) };
  }, [data.rovi, D]);

  const janjiHariIni = useMemo(() => {
    const last = penagihanTerakhir(aktivitas.penagihan);
    return [...last.values()].filter((p) => p.status === 'JANJI_BAYAR' && p.tanggal_janji === D);
  }, [aktivitas.penagihan, D]);

  const pct = tot.target ? Math.round((tot.terkumpul / tot.target) * 100) : 0;

  return (
    <AdminPage title="Dashboard" description="Ringkasan kunjungan, penagihan, dan order semua salesman." actions={<div className="w-72"><DateNav value={D} onChange={setD} /></div>}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <SummaryCard label="Kunjungan selesai" icon={<CheckCircle2 size={12} />} value={`${tot.selesai}/${tot.kunjungan}`} accent="green" />
        <SummaryCard label="Target tagih" icon={<Target size={12} />} value={formatRupiah(tot.target)} />
        <SummaryCard label="Terkumpul" icon={<HandCoins size={12} />} value={formatRupiah(tot.terkumpul)} accent="green" hint={`${pct}% dari target`} />
        <SummaryCard label="Janji bayar hari ini" icon={<CalendarClock size={12} />} value={janjiHariIni.length} />
        <SummaryCard label="Bad debt" icon={<AlertOctagon size={12} />} value={tot.badDebt} accent={tot.badDebt ? 'red' : undefined} />
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
                <th className="text-right">Target tagih</th>
                <th className="text-right">Terkumpul</th>
                <th className="text-right">Sisa</th>
                <th className="text-right">Janji / Bad debt</th>
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
                  <div className="mb-1 text-xs tabular text-slate-600">
                    {r.selesai}/{r.kunjungan} selesai · {r.perluDitagih} perlu ditagih
                  </div>
                  <ProgressBar value={r.selesai} max={r.kunjungan} tone="green" />
                </td>
                <td className="whitespace-nowrap text-right tabular">{formatRupiah(r.target)}</td>
                <td className="whitespace-nowrap text-right tabular font-medium text-emerald-700">{formatRupiah(r.terkumpul)}</td>
                <td className="whitespace-nowrap text-right tabular">{formatRupiah(r.sisa)}</td>
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
          <h2 className="font-semibold text-slate-900">Aging piutang</h2>
          <p className="text-sm text-slate-500">Outstanding {formatRupiah(aging.total)}</p>
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
