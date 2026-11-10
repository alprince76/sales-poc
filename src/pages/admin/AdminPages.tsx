import { Check, Download, Minus, Search } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { DetailTokoView } from '../../components/DetailTokoView';
import { useKunjungan } from '../../components/KunjunganPanel';
import { usePenagihanTerakhir } from '../../components/Penagihan';
import { Badge, Button, Card, cn, DateNav, EmptyState, Input, Select, StatusBayarBadge, StatusTokoBadge, SummaryCard, ProgressBar } from '../../components/ui';
import { daftarToko } from '../../lib/billing';
import { getPenagihanTerakhir, LABEL_STATUS_BAYAR, ringkasPenagihan } from '../../lib/collection';
import { toCSV, unduh } from '../../lib/csv';
import { formatTanggal } from '../../lib/dates';
import { formatRupiah } from '../../lib/format';
import type { StatusBayar, StatusFaktur } from '../../lib/types';
import { cariKunjungan, isSelesai, progres } from '../../lib/visit';
import { DEFAULT_DATE, formatTimestamp, useData } from '../../state';
import { AdminPage, Table } from './AdminLayout';

function SalesSelect({ value, onChange, semua = true }: { value: string; onChange: (v: string) => void; semua?: boolean }) {
  const { salesmen } = useData();
  return (
    <Select label="Salesman" value={value} onChange={onChange}>
      {semua && <option value="">Semua salesman</option>}
      {salesmen.map((s) => (
        <option key={s.kode} value={s.kode}>
          {s.nama} ({s.kode})
        </option>
      ))}
    </Select>
  );
}

function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative min-w-0 flex-1 sm:max-w-xs">
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <Input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="h-10 pl-9 text-sm" />
    </div>
  );
}

const namaTokoFn = (masterIdx: Map<string, { nama_toko: string }>) => (k: string) => masterIdx.get(k)?.nama_toko ?? k;

// ───────────────────────── Toko & Faktur ─────────────────────────

const PILIHAN_STATUS: { value: '' | StatusFaktur; label: string }[] = [
  { value: '', label: 'Semua status' },
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'JATUH_TEMPO_HARI_INI', label: 'Jatuh Tempo Hari Ini' },
  { value: 'BELUM_JATUH_TEMPO', label: 'Belum Jatuh Tempo' },
];

export function TokoFakturPage() {
  const { data, masterIdx } = useData();
  const last = usePenagihanTerakhir();
  const [D, setD] = useState(DEFAULT_DATE);
  const [status, setStatus] = useState<'' | StatusFaktur>('');
  const [sales, setSales] = useState('');
  const [cari, setCari] = useState('');
  const [dipilih, setDipilih] = useState<string | null>(null);

  const rows = useMemo(() => daftarToko(data, D, { status: status || undefined, kodeSalesman: sales || undefined, cari }), [data, D, status, sales, cari]);
  const terakhirToko = (kode: string) =>
    rows
      .find((r) => r.kode_toko === kode)
      ?.faktur.map((f) => getPenagihanTerakhir(last, f.no_faktur))
      .filter(Boolean)
      .sort((a, b) => b!.createdAt.localeCompare(a!.createdAt))[0];

  const exportCSV = () =>
    unduh(
      `toko-faktur-${D}.csv`,
      toCSV(
        rows.map((r) => ({
          kode_toko: r.kode_toko,
          nama_toko: r.nama_toko,
          salesman: r.kode_salesman,
          tipe_outlet: masterIdx.get(r.kode_toko)?.tipe_outlet ?? '',
          faktur_aktif: r.jumlahFakturAktif,
          total_outstanding: r.totalOutstanding,
          total_overdue: r.totalOverdue,
          total_harus_ditagih: r.totalHarusDitagih,
          max_hari_overdue: r.maxHariOverdue,
          status: r.statusLabel,
        })),
      ),
    );

  return (
    <AdminPage
      title="Toko & Faktur"
      description="Semesta toko beserta piutang (ROVI setelah pembayaran tercatat)."
      actions={
        <Button variant="secondary" onClick={exportCSV}>
          <Download size={16} /> Export CSV
        </Button>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[1fr_400px]">
        <Card className="min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
            <div className="w-full sm:w-64">
              <DateNav value={D} onChange={setD} />
            </div>
            <Select label="Filter status" value={status} onChange={(v) => setStatus(v as '' | StatusFaktur)}>
              {PILIHAN_STATUS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
            <SalesSelect value={sales} onChange={setSales} />
            <SearchInput value={cari} onChange={setCari} placeholder="Cari kode / nama toko" />
          </div>
          <p className="px-3 pt-2 text-xs text-slate-500">
            {rows.length.toLocaleString('id-ID')} toko · status relatif terhadap {formatTanggal(D)}
          </p>
          <Table
            empty={!rows.length && <p className="py-10 text-center text-sm text-slate-500">Tidak ada toko yang cocok dengan filter.</p>}
            head={
              <tr>
                <th>Toko</th>
                <th>Salesman</th>
                <th className="text-right">Faktur</th>
                <th className="text-right">Outstanding</th>
                <th className="text-right">Overdue</th>
                <th>Status</th>
                <th>Penagihan terakhir</th>
              </tr>
            }
          >
            {rows.slice(0, 500).map((r) => {
              const t = terakhirToko(r.kode_toko);
              const m = masterIdx.get(r.kode_toko);
              return (
                <tr key={r.kode_toko} onClick={() => setDipilih(r.kode_toko)} className={cn('cursor-pointer hover:bg-slate-50', dipilih === r.kode_toko && 'bg-brand-50/60')}>
                  <td>
                    <div className="font-medium text-slate-900">{r.nama_toko}</div>
                    <div className="text-xs text-slate-500">
                      <span className="font-mono">{r.kode_toko}</span>
                      {m?.tipe_outlet && ` · ${m.tipe_outlet}`}
                      {m?.status_blokir && <span className="ml-1 font-semibold text-red-600">· Blokir</span>}
                    </div>
                  </td>
                  <td className="whitespace-nowrap text-slate-600">{r.nama_salesman || '–'}</td>
                  <td className="text-right tabular">{r.jumlahFakturAktif}</td>
                  <td className="whitespace-nowrap text-right tabular">{formatRupiah(r.totalOutstanding)}</td>
                  <td className="whitespace-nowrap text-right tabular">{r.totalOverdue ? formatRupiah(r.totalOverdue) : '–'}</td>
                  <td>
                    <StatusTokoBadge status={r.status} label={r.statusLabel} />
                  </td>
                  <td>{t ? <StatusBayarBadge p={t} /> : <span className="text-slate-400">–</span>}</td>
                </tr>
              );
            })}
          </Table>
          {rows.length > 500 && <p className="px-3 py-2 text-xs text-slate-500">Menampilkan 500 dari {rows.length}. Persempit dengan filter.</p>}
        </Card>
        <Card className="p-4 xl:sticky xl:top-6 xl:self-start">
          {dipilih ? <DetailTokoView kodeToko={dipilih} D={D} onBack={() => setDipilih(null)} /> : <p className="py-10 text-center text-sm text-slate-500">Klik toko untuk melihat detail faktur.</p>}
        </Card>
      </div>
    </AdminPage>
  );
}

// ───────────────────────── Rute Salesman ─────────────────────────

export function RuteAdminPage() {
  const { salesmen, aktivitas, masterIdx } = useData();
  const [sales, setSales] = useState(salesmen[0]?.kode ?? '');
  const [D, setD] = useState(DEFAULT_DATE);
  const [dipilih, setDipilih] = useState<string | null>(null);
  const hasil = useKunjungan(sales, D, 'rute');
  const prog = progres(aktivitas.kunjungan, sales, D, hasil.baris.map((b) => b.kode_toko));
  const pen = aktivitas.penagihan.filter((p) => p.kode_salesman === sales && p.tanggal === D);
  const rp = ringkasPenagihan(pen);
  const po = aktivitas.po.filter((p) => p.kode_salesman === sales && p.tanggal === D);

  const Langkah = ({ h }: { h?: string }) =>
    h === 'SELESAI' ? (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700" title="Selesai">
        <Check size={14} strokeWidth={3} />
      </span>
    ) : h === 'DILEWATI' ? (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-500" title="Dilewati">
        <Minus size={14} />
      </span>
    ) : (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-slate-300" title="Belum" />
    );

  return (
    <AdminPage
      title="Rute Salesman"
      description="Monitoring rute, penagihan, dan hasil kunjungan per salesman."
      actions={
        <>
          <SalesSelect value={sales} onChange={setSales} semua={false} />
          <div className="w-64">
            <DateNav value={D} onChange={setD} />
          </div>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <SummaryCard label="Kunjungan" value={hasil.jumlahKunjungan} hint={`${hasil.jumlahPerluDitagih} perlu ditagih`} />
        <div className="col-span-1 rounded-2xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-card">
          <div className="text-[11px] font-medium uppercase text-slate-500">Selesai</div>
          <div className="mt-1 text-lg font-semibold tabular text-emerald-700">
            {prog.selesai}/{prog.total}
          </div>
          <ProgressBar value={prog.selesai} max={prog.total} tone="green" />
        </div>
        <SummaryCard label="Sisa harus ditagih" value={formatRupiah(hasil.totalTagihan)} accent={hasil.totalTagihan ? 'red' : undefined} />
        <SummaryCard label="Terkumpul" value={formatRupiah(rp.terkumpul)} accent="green" hint={`${rp.jumlahJanji} janji · ${rp.jumlahBadDebt} bad debt`} />
        <SummaryCard label="PO" value={formatRupiah(po.reduce((s, p) => s + p.total, 0))} accent="brand" hint={`${po.length} PO`} />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_400px]">
        <Card className="min-w-0 overflow-hidden">
          {hasil.jumlahKunjungan === 0 ? (
            <div className="p-4">
              <EmptyState title="Tidak ada jadwal kunjungan">Pilih tanggal lain.</EmptyState>
            </div>
          ) : (
            <Table
              head={
                <tr>
                  <th className="w-10">#</th>
                  <th>Toko</th>
                  <th>Status tagihan</th>
                  <th className="text-right">Harus ditagih</th>
                  <th className="text-center">Coll.</th>
                  <th className="text-center">Stok</th>
                  <th className="text-center">PO</th>
                  <th>Hasil</th>
                </tr>
              }
            >
              {hasil.baris.map((b) => {
                const k = cariKunjungan(aktivitas.kunjungan, sales, b.kode_toko, D);
                const tp = pen.filter((p) => p.kode_toko === b.kode_toko);
                const tpo = po.filter((p) => p.kode_toko === b.kode_toko);
                return (
                  <tr key={b.kode_toko} onClick={() => setDipilih(b.kode_toko)} className={cn('cursor-pointer hover:bg-slate-50', dipilih === b.kode_toko && 'bg-brand-50/60')}>
                    <td className="tabular text-slate-500">{b.urutan ?? '–'}</td>
                    <td>
                      <div className="font-medium text-slate-900">{b.nama_toko}</div>
                      <div className="text-xs text-slate-500">
                        <span className="font-mono">{b.kode_toko}</span>
                        {b.area && ` · ${b.area}`}
                        {masterIdx.get(b.kode_toko)?.status_blokir && <span className="ml-1 font-semibold text-red-600">· Blokir</span>}
                      </div>
                    </td>
                    <td>
                      <StatusTokoBadge status={b.status} label={b.statusLabel} />
                    </td>
                    <td className="whitespace-nowrap text-right tabular">{b.perluDitagih ? formatRupiah(b.totalHarusDitagih) : '–'}</td>
                    <td className="text-center">
                      <Langkah h={k?.langkah.collection} />
                    </td>
                    <td className="text-center">
                      <Langkah h={k?.langkah.stok} />
                    </td>
                    <td className="text-center">
                      <Langkah h={k?.langkah.po} />
                    </td>
                    <td className="text-xs text-slate-600">
                      {isSelesai(k) && <Badge tone="green">Selesai</Badge>}
                      {tp.length > 0 && <div className="mt-1">{formatRupiah(ringkasPenagihan(tp).terkumpul)} terkumpul</div>}
                      {tpo.length > 0 && <div>PO {formatRupiah(tpo.reduce((s, p) => s + p.total, 0))}</div>}
                    </td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Card>
        <Card className="p-4 xl:sticky xl:top-6 xl:self-start">
          {dipilih ? (
            <>
              <DetailTokoView kodeToko={dipilih} D={D} onBack={() => setDipilih(null)} />
              {pen.some((p) => p.kode_toko === dipilih) && (
                <div className="mt-4">
                  <h3 className="mb-2 text-sm font-semibold text-slate-700">Penagihan kunjungan ini</h3>
                  <ul className="space-y-1.5">
                    {pen
                      .filter((p) => p.kode_toko === dipilih)
                      .map((p) => (
                        <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                          <span className="font-mono text-xs text-slate-600">{p.no_faktur}</span>
                          <StatusBayarBadge p={p} />
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <p className="py-10 text-center text-sm text-slate-500">Klik toko untuk melihat detail.</p>
          )}
        </Card>
      </div>
    </AdminPage>
  );
}

// ───────────────────────── Penagihan ─────────────────────────

export function PenagihanPage() {
  const { aktivitas, masterIdx, salesmen } = useData();
  const [sales, setSales] = useState('');
  const [status, setStatus] = useState<'' | StatusBayar>('');
  const [tgl, setTgl] = useState('');
  const nama = namaTokoFn(masterIdx);
  const namaSR = (k: string) => salesmen.find((s) => s.kode === k)?.nama ?? k;

  const rows = aktivitas.penagihan
    .filter((p) => (!sales || p.kode_salesman === sales) && (!status || p.status === status) && (!tgl || p.tanggal === tgl))
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const r = ringkasPenagihan(rows);

  const exportCSV = () =>
    unduh(
      `penagihan${tgl ? `-${tgl}` : ''}.csv`,
      toCSV(
        rows.map((p) => ({
          waktu: p.createdAt,
          tanggal_kunjungan: p.tanggal,
          kode_salesman: p.kode_salesman,
          kode_toko: p.kode_toko,
          nama_toko: nama(p.kode_toko),
          no_faktur: p.no_faktur,
          status: LABEL_STATUS_BAYAR[p.status],
          nominal: p.nominal,
          tanggal_janji: p.tanggal_janji ?? '',
          alasan: p.alasan ?? '',
        })),
      ),
    );

  return (
    <AdminPage
      title="Penagihan"
      description="Log update status penagihan dari salesman."
      actions={
        <Button variant="secondary" onClick={exportCSV} disabled={!rows.length}>
          <Download size={16} /> Export CSV
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <SummaryCard label="Terkumpul" value={formatRupiah(r.terkumpul)} accent="green" />
        <SummaryCard label="Paid" value={r.jumlahPaid} />
        <SummaryCard label="Partially Paid" value={r.jumlahPartial} />
        <SummaryCard label="Janji Bayar" value={r.jumlahJanji} />
        <SummaryCard label="Bad Debt" value={r.jumlahBadDebt} accent={r.jumlahBadDebt ? 'red' : undefined} />
      </div>
      <Card className="mt-5 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          <SalesSelect value={sales} onChange={setSales} />
          <Select label="Status" value={status} onChange={(v) => setStatus(v as '' | StatusBayar)}>
            <option value="">Semua status</option>
            {(Object.keys(LABEL_STATUS_BAYAR) as StatusBayar[]).map((s) => (
              <option key={s} value={s}>
                {LABEL_STATUS_BAYAR[s]}
              </option>
            ))}
          </Select>
          <Input type="date" value={tgl} onChange={(e) => setTgl(e.target.value)} aria-label="Tanggal kunjungan" className="h-10 w-auto text-sm" />
          {tgl && (
            <Button size="sm" variant="ghost" onClick={() => setTgl('')}>
              Semua tanggal
            </Button>
          )}
        </div>
        <Table
          empty={!rows.length && <div className="p-4"><EmptyState title="Belum ada penagihan">Update status dilakukan salesman dari menu Collection / Tagihan.</EmptyState></div>}
          head={
            <tr>
              <th>Waktu</th>
              <th>Salesman</th>
              <th>Toko</th>
              <th>Faktur</th>
              <th>Hasil</th>
            </tr>
          }
        >
          {rows.map((p) => (
            <tr key={p.id}>
              <td className="whitespace-nowrap text-xs text-slate-600">{formatTimestamp(p.createdAt)}</td>
              <td className="whitespace-nowrap">{namaSR(p.kode_salesman)}</td>
              <td>
                <div className="font-medium text-slate-900">{nama(p.kode_toko)}</div>
                <div className="font-mono text-xs text-slate-500">{p.kode_toko}</div>
              </td>
              <td className="font-mono text-xs">{p.no_faktur}</td>
              <td>
                <StatusBayarBadge p={p} />
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </AdminPage>
  );
}

// ───────────────────────── Purchase Order ─────────────────────────

export function POPage() {
  const { aktivitas, masterIdx, salesmen } = useData();
  const [sales, setSales] = useState('');
  const [divisi, setDivisi] = useState('');
  const [buka, setBuka] = useState<string | null>(null);
  const nama = namaTokoFn(masterIdx);
  const namaSR = (k: string) => salesmen.find((s) => s.kode === k)?.nama ?? k;
  const rows = aktivitas.po.filter((p) => (!sales || p.kode_salesman === sales) && (!divisi || p.items.some((i) => i.divisi === divisi))).slice().reverse();
  const semuaDivisi = Array.from(new Set(aktivitas.po.flatMap((p) => p.items.map((i) => i.divisi)))).sort();
  const perDivisi = semuaDivisi.map((d) => ({ d, nilai: rows.flatMap((p) => p.items).filter((i) => i.divisi === d).reduce((s, i) => s + i.subtotal, 0) }));
  const total = rows.reduce((s, p) => s + p.total, 0);

  const exportCSV = () =>
    unduh(
      'purchase-order-erp.csv',
      toCSV(
        rows.flatMap((p) =>
          p.items.map((i) => ({
            no_po: p.no_po,
            tanggal: p.tanggal,
            kode_salesman: p.kode_salesman,
            kode_toko: p.kode_toko,
            nama_toko: nama(p.kode_toko),
            kode_sku: i.kode_sku,
            nama_sku: i.nama_sku,
            divisi: i.divisi,
            qty: i.qty,
            satuan: i.satuan,
            harga: i.harga,
            subtotal: i.subtotal,
            total_po: p.total,
          })),
        ),
      ),
    );

  return (
    <AdminPage
      title="Purchase Order"
      description="PO yang dikirim salesman. Export CSV = payload untuk ERP pusat (simulasi)."
      actions={
        <Button variant="secondary" onClick={exportCSV} disabled={!rows.length}>
          <Download size={16} /> Export ke ERP (CSV)
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard label="Jumlah PO" value={rows.length} />
        <SummaryCard label="Nilai PO" value={formatRupiah(total)} accent="brand" />
        {perDivisi.slice(0, 2).map((x) => (
          <SummaryCard key={x.d} label={x.d} value={formatRupiah(x.nilai)} />
        ))}
      </div>
      <Card className="mt-5 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          <SalesSelect value={sales} onChange={setSales} />
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
          empty={!rows.length && <div className="p-4"><EmptyState title="Belum ada PO">PO dibuat salesman di langkah Purchase Order saat kunjungan.</EmptyState></div>}
          head={
            <tr>
              <th>No PO</th>
              <th>Tanggal</th>
              <th>Salesman</th>
              <th>Toko</th>
              <th className="text-right">SKU</th>
              <th className="text-right">Total</th>
              <th>Status</th>
            </tr>
          }
        >
          {rows.map((p) => (
            <Fragment key={p.id}>
              <tr onClick={() => setBuka(buka === p.id ? null : p.id)} className="cursor-pointer hover:bg-slate-50">
                <td className="font-mono text-xs font-medium text-slate-900">{p.no_po}</td>
                <td className="whitespace-nowrap">{formatTanggal(p.tanggal)}</td>
                <td className="whitespace-nowrap">{namaSR(p.kode_salesman)}</td>
                <td>{nama(p.kode_toko)}</td>
                <td className="text-right tabular">{p.items.length}</td>
                <td className="whitespace-nowrap text-right font-semibold tabular">{formatRupiah(p.total)}</td>
                <td>
                  <Badge tone="green">Terkirim ke ERP</Badge>
                </td>
              </tr>
              {buka === p.id && (
                <tr className="bg-slate-50/70">
                  <td colSpan={7}>
                    <ul className="divide-y divide-slate-200/70">
                      {p.items.map((i) => (
                        <li key={i.kode_sku} className="flex justify-between gap-3 py-1.5 text-xs">
                          <span>
                            <span className="font-mono text-slate-500">{i.kode_sku}</span> {i.nama_sku} <span className="text-slate-500">· {i.divisi}</span>
                          </span>
                          <span className="whitespace-nowrap tabular">
                            {i.qty} {i.satuan} × {formatRupiah(i.harga)} = <span className="font-semibold">{formatRupiah(i.subtotal)}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </Table>
      </Card>
    </AdminPage>
  );
}

// ───────────────────────── Cek Stok ─────────────────────────

export function StokPage() {
  const { aktivitas, masterIdx, produk, salesmen } = useData();
  const [sales, setSales] = useState('');
  const [buka, setBuka] = useState<string | null>(null);
  const nama = namaTokoFn(masterIdx);
  const namaSR = (k: string) => salesmen.find((s) => s.kode === k)?.nama ?? k;
  const sku = useMemo(() => new Map(produk.map((p) => [p.kode_sku, p])), [produk]);
  const rows = aktivitas.stok.filter((s) => !sales || s.kode_salesman === sales).slice().reverse();

  const kompetitor = useMemo(() => {
    const m = new Map<string, { qty: number; toko: Set<string> }>();
    for (const s of rows)
      for (const k of s.kompetitor) {
        const key = k.nama_produk.trim().toUpperCase();
        const x = m.get(key) ?? { qty: 0, toko: new Set() };
        x.qty += k.qty;
        x.toko.add(s.kode_toko);
        m.set(key, x);
      }
    return [...m].map(([nama, x]) => ({ nama, qty: x.qty, toko: x.toko.size })).sort((a, b) => b.toko - a.toko || b.qty - a.qty);
  }, [rows]);

  const exportCSV = () =>
    unduh(
      'cek-stok.csv',
      toCSV([
        ...rows.flatMap((s) =>
          s.internal.map((i) => ({ tanggal: s.tanggal, kode_salesman: s.kode_salesman, kode_toko: s.kode_toko, jenis: 'INTERNAL', produk: `${i.kode_sku} ${sku.get(i.kode_sku)?.nama_sku ?? ''}`.trim(), display: i.display, backroom: i.backroom, qty: i.display + i.backroom })),
        ),
        ...rows.flatMap((s) => s.kompetitor.map((k) => ({ tanggal: s.tanggal, kode_salesman: s.kode_salesman, kode_toko: s.kode_toko, jenis: 'KOMPETITOR', produk: k.nama_produk, display: '', backroom: '', qty: k.qty }))),
      ]),
    );

  return (
    <AdminPage
      title="Cek Stok"
      description="Stok produk Tigaraksa (display & backroom) dan produk kompetitor yang dicatat di toko."
      actions={
        <>
          <SalesSelect value={sales} onChange={setSales} />
          <Button variant="secondary" onClick={exportCSV} disabled={!rows.length}>
            <Download size={16} /> Export CSV
          </Button>
        </>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card className="min-w-0 overflow-hidden">
          <Table
            empty={!rows.length && <div className="p-4"><EmptyState title="Belum ada cek stok">Dicatat salesman di langkah Cek Stok saat kunjungan.</EmptyState></div>}
            head={
              <tr>
                <th>Tanggal</th>
                <th>Salesman</th>
                <th>Toko</th>
                <th className="text-right">SKU</th>
                <th className="text-right">Display</th>
                <th className="text-right">Backroom</th>
                <th className="text-right">Kompetitor</th>
              </tr>
            }
          >
            {rows.map((s) => (
              <Fragment key={s.id}>
                <tr onClick={() => setBuka(buka === s.id ? null : s.id)} className="cursor-pointer hover:bg-slate-50">
                  <td className="whitespace-nowrap">{formatTanggal(s.tanggal)}</td>
                  <td className="whitespace-nowrap">{namaSR(s.kode_salesman)}</td>
                  <td>{nama(s.kode_toko)}</td>
                  <td className="text-right tabular">{s.internal.length}</td>
                  <td className="text-right tabular">{s.internal.reduce((a, i) => a + i.display, 0)}</td>
                  <td className="text-right tabular">{s.internal.reduce((a, i) => a + i.backroom, 0)}</td>
                  <td className="text-right tabular">{s.kompetitor.length}</td>
                </tr>
                {buka === s.id && (
                  <tr className="bg-slate-50/70">
                    <td colSpan={7}>
                      <div className="grid gap-3 py-1 md:grid-cols-2">
                        <ul className="space-y-1 text-xs">
                          {s.internal.map((i) => (
                            <li key={i.kode_sku} className="flex justify-between gap-2">
                              <span>{sku.get(i.kode_sku)?.nama_sku ?? i.kode_sku}</span>
                              <span className="whitespace-nowrap tabular">
                                D {i.display} · B {i.backroom}
                              </span>
                            </li>
                          ))}
                          {!s.internal.length && <li className="text-slate-500">Tidak ada stok internal.</li>}
                        </ul>
                        <ul className="space-y-1 text-xs">
                          {s.kompetitor.map((k, i) => (
                            <li key={i} className="flex justify-between gap-2">
                              <span>{k.nama_produk}</span>
                              <span className="tabular">{k.qty}</span>
                            </li>
                          ))}
                          {!s.kompetitor.length && <li className="text-slate-500">Tidak ada produk kompetitor.</li>}
                        </ul>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </Table>
        </Card>
        <Card className="p-4 xl:self-start">
          <h2 className="font-semibold text-slate-900">Produk kompetitor terbanyak</h2>
          <p className="text-sm text-slate-500">Berdasarkan jumlah toko yang menjual.</p>
          {kompetitor.length ? (
            <ul className="mt-3 space-y-2">
              {kompetitor.slice(0, 10).map((k) => (
                <li key={k.nama} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{k.nama}</span>
                  <span className="shrink-0 text-xs tabular text-slate-500">
                    {k.toko} toko · {k.qty} pcs
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-400">Belum ada data.</p>
          )}
        </Card>
      </div>
    </AdminPage>
  );
}

