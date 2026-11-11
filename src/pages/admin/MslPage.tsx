import { AlertTriangle, Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, Card, cn, DateNav, EmptyState, ProgressBar, Select, SummaryCard } from '../../components/ui';
import { normKode } from '../../lib/billing';
import { toCSV, unduh } from '../../lib/csv';
import { formatRupiah } from '../../lib/format';
import { compliance, daftarSkuMSL, labelWarning, teksTerakhirOrder } from '../../lib/msl';
import { DEFAULT_DATE, useData } from '../../state';
import { AdminPage, Table } from './AdminLayout';

export function MslPage() {
  const { data, produk, mslIdx, trxIdx, salesmen } = useData();
  const [D, setD] = useState(DEFAULT_DATE);
  const [sales, setSales] = useState('');
  const [divisi, setDivisi] = useState('');
  const [dipilih, setDipilih] = useState<string | null>(null);
  const srMT = salesmen.filter((s) => s.channel === 'MT');
  const semuaDivisi = useMemo(() => Array.from(new Set(produk.map((p) => p.divisi))).sort(), [produk]);

  const rows = useMemo(
    () =>
      data.master
        .filter((m) => m.channel === 'MT' && (!sales || normKode(m.kode_salesman) === sales))
        .map((m) => {
          const list = daftarSkuMSL({ produk, mslIdx, trxIdx }, m.kode_toko, D).filter((s) => !divisi || s.divisi === divisi);
          return { m, list, c: compliance(list) };
        })
        .sort((a, b) => a.c.persen - b.c.persen || b.c.warning - a.c.warning),
    [data.master, produk, mslIdx, trxIdx, D, sales, divisi],
  );
  const tot = rows.reduce((a, r) => ({ listed: a.listed + r.c.listed, warning: a.warning + r.c.warning, belum: a.belum + r.c.belumPernah }), { listed: 0, warning: 0, belum: 0 });
  const pct = tot.listed ? Math.round(((tot.listed - tot.warning) / tot.listed) * 100) : 100;
  const detail = rows.find((r) => r.m.kode_toko === dipilih);

  const exportCSV = () =>
    unduh(
      `msl-compliance-${D}.csv`,
      toCSV(
        rows.flatMap((r) =>
          r.list
            .filter((s) => s.listed)
            .map((s) => ({
              tanggal: D,
              kode_salesman: r.m.kode_salesman,
              kode_toko: r.m.kode_toko,
              nama_toko: r.m.nama_toko,
              kode_sku: s.kode_sku,
              nama_sku: s.nama_sku,
              divisi: s.divisi,
              last_order: s.lastOrder ?? '',
              hari_sejak_order: s.hariSejak ?? '',
              warning: labelWarning(s.warning),
            })),
        ),
      ),
    );

  return (
    <AdminPage
      title="MSL Compliance"
      description="Modern Trade: SKU listed (Must Stock List) yang aktif dibeli dalam 30 hari terakhir."
      actions={
        <>
          <div className="w-64">
            <DateNav value={D} onChange={setD} />
          </div>
          <Button variant="secondary" onClick={exportCSV} disabled={!rows.length}>
            <Download size={16} /> Export CSV
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard label="Outlet MT" value={rows.length} />
        <SummaryCard label="MSL aktif" value={`${pct}%`} accent={pct >= 80 ? 'green' : 'red'} hint={`${tot.listed - tot.warning}/${tot.listed} SKU listed`} />
        <SummaryCard label="SKU untransacted" value={tot.warning} accent={tot.warning ? 'red' : undefined} hint="> 30 hari / belum pernah" />
        <SummaryCard label="Belum pernah order" value={tot.belum} />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card className="min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
            <Select label="Salesman MT" value={sales} onChange={setSales}>
              <option value="">Semua SR MT</option>
              {srMT.map((s) => (
                <option key={s.kode} value={s.kode}>
                  {s.nama} ({s.kode})
                </option>
              ))}
            </Select>
            <Select label="Divisi" value={divisi} onChange={setDivisi}>
              <option value="">Semua divisi</option>
              {semuaDivisi.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </div>
          <Table
            empty={!rows.length && <div className="p-4"><EmptyState title="Belum ada outlet MT">Upload Master Outlet dengan kolom channel = MT dan data MSL.</EmptyState></div>}
            head={
              <tr>
                <th>Toko</th>
                <th>SR</th>
                <th className="text-right">Listed</th>
                <th className="text-right">Untransacted</th>
                <th className="min-w-[160px]">MSL aktif</th>
              </tr>
            }
          >
            {rows.map(({ m, c }) => (
              <tr key={m.kode_toko} onClick={() => setDipilih(m.kode_toko)} className={cn('cursor-pointer hover:bg-slate-50', dipilih === m.kode_toko && 'bg-brand-50/60')}>
                <td>
                  <div className="font-medium text-slate-900">{m.nama_toko}</div>
                  <div className="text-xs text-slate-500">
                    <span className="font-mono">{m.kode_toko}</span> · {m.tipe_outlet}
                  </div>
                </td>
                <td className="whitespace-nowrap">{m.nama_salesman}</td>
                <td className="text-right tabular">{c.listed}</td>
                <td className={cn('text-right tabular', c.warning > 0 && 'font-semibold text-red-600')}>{c.warning}</td>
                <td>
                  <div className="mb-1 text-xs tabular text-slate-600">{c.persen}%</div>
                  <ProgressBar value={c.aktif} max={c.listed} tone="green" />
                </td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card className="p-4 xl:sticky xl:top-6 xl:self-start">
          {detail ? (
            <>
              <h2 className="font-semibold text-slate-900">{detail.m.nama_toko}</h2>
              <p className="text-sm text-slate-500">
                {detail.m.kode_toko} · {detail.c.aktif}/{detail.c.listed} SKU aktif
              </p>
              <ul className="mt-3 divide-y divide-slate-100">
                {detail.list.map((s) => (
                  <li key={s.kode_sku} className="flex items-start justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <div className="text-sm text-slate-900">{s.nama_sku}</div>
                      <div className={cn('text-xs', s.warning ? 'text-red-600' : 'text-slate-500')}>
                        {s.divisi}
                        {s.warning !== 'BELUM_PERNAH' && ` · ${teksTerakhirOrder(s)}`}
                        {!s.listed && ' · tidak listed'}
                      </div>
                    </div>
                    {s.warning ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                        <AlertTriangle size={12} /> {labelWarning(s.warning)}
                      </span>
                    ) : (
                      <span className="shrink-0 text-xs tabular text-slate-400">{formatRupiah(s.harga)}</span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="py-10 text-center text-sm text-slate-500">Klik toko untuk melihat SKU listed dan warning.</p>
          )}
        </Card>
      </div>
    </AdminPage>
  );
}
