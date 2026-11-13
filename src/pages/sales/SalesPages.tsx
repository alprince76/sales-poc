import { CalendarClock, CheckCircle2, ChevronRight, HandCoins, PackageCheck, ReceiptText, Search, ShieldAlert, Store, UserRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useKunjungan, KunjunganPanel } from '../../components/KunjunganPanel';
import { BayarBadge } from '../../components/DetailTokoView';
import { FakturCard, PenagihanSheet, usePenagihanTerakhir } from '../../components/Penagihan';
import { Badge, Card, EmptyState, Input, SectionTitle, Segmented, Select, StatusTokoBadge, SummaryCard, cn } from '../../components/ui';
import { indexFaktur, normKode, ringkasTagihan, type FakturDinilai } from '../../lib/billing';
import { daftarInkasso, type BarisInkasso } from '../../lib/inkasso';
import { getPenagihanTerakhir, LABEL_STATUS_BAYAR, ringkasPenagihan } from '../../lib/collection';
import { formatTanggal } from '../../lib/dates';
import { formatRupiah } from '../../lib/format';
import { progres } from '../../lib/visit';
import { formatJam, formatTimestamp, latestUpdate, useData } from '../../state';
import { SalesBody, SalesHeader } from './SalesLayout';
import { useSalesSession } from './session';

// ───────────────────────── Rute ─────────────────────────

type TabRute = 'onroute' | 'nonroute' | 'inkasso';
const TAB_RUTE: TabRute[] = ['onroute', 'nonroute', 'inkasso'];

export function RutePage() {
  const { kode, D } = useSalesSession();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const tab = (TAB_RUTE.includes(sp.get('tab') as TabRute) ? sp.get('tab') : 'onroute') as TabRute;
  const buka = (k: string) => nav(`/sales/kunjungan/${encodeURIComponent(k)}`);
  return (
    <>
      <SalesHeader title={tab === 'onroute' ? 'On Route' : tab === 'nonroute' ? 'Non Route' : 'Daftar Inkasso'} />
      <SalesBody>
        <Segmented
          block
          label="Menu rute"
          value={tab}
          onChange={(t) => setSp(t === 'onroute' ? {} : { tab: t }, { replace: true })}
          options={[
            { value: 'onroute', label: 'On Route' },
            { value: 'nonroute', label: 'Non Route' },
            { value: 'inkasso', label: 'Inkasso' },
          ]}
        />
        {kode && tab === 'onroute' && <KunjunganPanel key={kode} kodeSalesman={kode} D={D} onPilih={buka} />}
        {kode && tab === 'nonroute' && <NonRouteList onPilih={buka} />}
        {kode && tab === 'inkasso' && <InkassoList onPilih={buka} />}
      </SalesBody>
    </>
  );
}

// ───────────────────────── Daftar Inkasso ─────────────────────────

function InkassoList({ onPilih }: { onPilih: (kode: string) => void }) {
  const { kode, D } = useSalesSession();
  const { raw, data, fakturIdx, aktivitas } = useData();
  const rawIdx = useMemo(() => indexFaktur(raw.rovi), [raw.rovi]);
  const ink = useMemo(() => daftarInkasso(data.master, rawIdx, fakturIdx, kode, D, aktivitas.penagihan), [data.master, rawIdx, fakturIdx, kode, D, aktivitas.penagihan]);
  const [sub, setSub] = useState<'belum' | 'tertagih'>('belum');
  const rows = sub === 'belum' ? ink.belum : ink.tertagih;
  const total = (xs: BarisInkasso[], f: (x: BarisInkasso) => number) => xs.reduce((s, x) => s + f(x), 0);
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <SummaryCard label="Belum ditagih" value={formatRupiah(total(ink.belum, (x) => x.sisa))} accent={ink.belum.length ? 'red' : undefined} hint={`${ink.belum.length} toko`} />
        <SummaryCard label="Terkumpul" value={formatRupiah(total([...ink.tertagih, ...ink.belum], (x) => x.terkumpul))} accent="green" hint={`${ink.tertagih.length} toko lunas`} />
      </div>
      <p className="px-1 text-xs text-slate-500">Semua toko coverage dengan tagihan jatuh tempo / overdue, termasuk yang tidak dijadwalkan hari ini.</p>
      <Segmented
        label="Status inkasso"
        value={sub}
        onChange={setSub}
        options={[
          { value: 'belum', label: `Belum ditagih (${ink.belum.length})` },
          { value: 'tertagih', label: `Tertagih (${ink.tertagih.length})` },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState icon={<CheckCircle2 size={20} />} title={sub === 'belum' ? 'Semua tagihan sudah tertagih' : 'Belum ada toko yang tertagih'} />
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.kode_toko}>
              <button
                type="button"
                onClick={() => onPilih(r.kode_toko)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-2xl border bg-white p-3 text-left shadow-card hover:bg-slate-50',
                  r.tertagih ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200/80',
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 break-words font-semibold leading-snug text-slate-900">{r.nama_toko}</div>
                  <div className="truncate text-xs text-slate-500">
                    {r.kode_toko}
                    {r.area && ` · ${r.area}`}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {r.tertagih ? (
                      <Badge tone="green">Lunas · {formatRupiah(r.terkumpul)}</Badge>
                    ) : (
                      <>
                        {r.maxHariOverdue > 0 ? <Badge tone="red">Overdue {r.maxHariOverdue} hari</Badge> : <Badge tone="orange">Jatuh Tempo Hari Ini</Badge>}
                        {r.statusTerakhir && <Badge tone={r.statusTerakhir === 'BAD_DEBT' ? 'red' : 'violet'} dot={false}>{LABEL_STATUS_BAYAR[r.statusTerakhir]}</Badge>}
                      </>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span className={cn('text-sm font-semibold tabular', r.tertagih ? 'text-emerald-700' : 'text-slate-900')}>{formatRupiah(r.tertagih ? r.harusAwal : r.sisa)}</span>
                  <ChevronRight size={18} className="text-slate-300" />
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// ───────────────────────── Tagihan (lintas toko di rute hari ini) ─────────────────────────

type BarisTagihan = { f: FakturDinilai; namaToko: string };

export function TagihanPage() {
  const { kode, D } = useSalesSession();
  const { aktivitas } = useData();
  const hasil = useKunjungan(kode, D);
  const last = usePenagihanTerakhir();
  const [aktif, setAktif] = useState<FakturDinilai | null>(null);
  const [filter, setFilter] = useState<'semua' | 'belum'>('belum');

  const rows: BarisTagihan[] = useMemo(
    () =>
      hasil.baris
        .flatMap((b) => b.faktur.filter((f) => f.status !== 'BELUM_JATUH_TEMPO').map((f) => ({ f, namaToko: b.nama_toko })))
        .sort((a, b) => b.f.hariTerlambat - a.f.hariTerlambat || a.f.no_faktur.localeCompare(b.f.no_faktur)),
    [hasil],
  );
  const logHariIni = aktivitas.penagihan.filter((p) => p.kode_salesman === kode && p.tanggal === D);
  const rp = ringkasPenagihan(logHariIni);
  const belum = rows.filter((r) => {
    const l = getPenagihanTerakhir(last, r.f.no_faktur);
    return !l || l.tanggal !== D;
  });
  const tampil = filter === 'belum' ? belum : rows;
  const lunasHariIni = logHariIni.filter((p) => p.status === 'PAID');

  return (
    <>
      <SalesHeader title="Tagihan" />
      <SalesBody>
        <div className="grid grid-cols-2 gap-2">
          <SummaryCard label="Sisa harus ditagih" value={formatRupiah(hasil.totalTagihan)} accent={hasil.totalTagihan ? 'red' : undefined} hint={`${rows.length} faktur`} />
          <SummaryCard label="Terkumpul hari ini" value={formatRupiah(rp.terkumpul)} accent="green" hint={`${rp.jumlahPaid} paid · ${rp.jumlahPartial} partial`} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex rounded-xl bg-slate-100 p-1">
            {(['belum', 'semua'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setFilter(v)}
                className={cn('rounded-lg px-3 py-1.5 text-sm font-medium', filter === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600')}
              >
                {v === 'belum' ? `Belum diupdate (${belum.length})` : `Semua (${rows.length})`}
              </button>
            ))}
          </div>
        </div>
        {tampil.length === 0 ? (
          <EmptyState icon={<CheckCircle2 size={20} />} title={rows.length ? 'Semua faktur sudah diupdate' : 'Tidak ada tagihan jatuh tempo'}>
            {rows.length ? 'Kerja bagus!' : 'Tidak ada faktur overdue / jatuh tempo di rute hari ini.'}
          </EmptyState>
        ) : (
          <Card className="px-4">
            <ul className="divide-y divide-slate-100">
              {tampil.map(({ f, namaToko }) => (
                <li key={f.no_faktur}>
                  <FakturCard f={f} subtitle={namaToko} last={getPenagihanTerakhir(last, f.no_faktur)} onClick={() => setAktif(f)} />
                </li>
              ))}
            </ul>
          </Card>
        )}
        {lunasHariIni.length > 0 && (
          <div>
            <SectionTitle>Lunas hari ini</SectionTitle>
            <Card className="divide-y divide-slate-100 px-4">
              {lunasHariIni.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                  <span className="truncate font-mono text-[13px] text-slate-700">{p.no_faktur}</span>
                  <span className="font-semibold tabular text-emerald-700">{formatRupiah(p.nominal)}</span>
                </div>
              ))}
            </Card>
          </div>
        )}
      </SalesBody>
      <PenagihanSheet faktur={aktif} kodeSalesman={kode} D={D} onClose={() => setAktif(null)} />
    </>
  );
}

// ───────────────────────── Non Route (semua toko coverage SR) ─────────────────────────

function NonRouteList({ onPilih }: { onPilih: (kode: string) => void }) {
  const { kode, D } = useSalesSession();
  const { data, fakturIdx } = useData();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'semua' | 'tagih'>('semua');

  const jadwal = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const p of data.pjp) if (normKode(p.kode_salesman) === kode) m.set(p.kode_toko, [...(m.get(p.kode_toko) ?? []), p.tanggal_kunjungan]);
    return m;
  }, [data.pjp, kode]);

  const rows = useMemo(() => {
    const coverage = data.master.filter((m) => normKode(m.kode_salesman) === kode);
    const s = q.trim().toUpperCase();
    return coverage
      .filter((m) => !s || m.kode_toko.includes(s) || m.nama_toko.toUpperCase().includes(s))
      .map((m) => ({ m, r: ringkasTagihan(fakturIdx.get(m.kode_toko) ?? [], D), jadwal: (jadwal.get(m.kode_toko) ?? []).sort() }))
      .filter((x) => filter === 'semua' || x.r.perluDitagih)
      .sort((a, b) => Number(b.r.perluDitagih) - Number(a.r.perluDitagih) || b.r.maxHariOverdue - a.r.maxHariOverdue || a.m.nama_toko.localeCompare(b.m.nama_toko));
  }, [data.master, kode, q, fakturIdx, D, jadwal, filter]);

  return (
    <>
        <p className="px-1 text-xs text-slate-500">Semua toko coverage SR. Pilih toko untuk taking order di luar jadwal / order by phone.</p>
        <div className="relative">
          <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari kode / nama toko" className="pl-10" aria-label="Cari toko" />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">{rows.length.toLocaleString('id-ID')} toko coverage</span>
          <label className="inline-flex items-center gap-2 font-medium text-slate-700">
            <input type="checkbox" checked={filter === 'tagih'} onChange={(e) => setFilter(e.target.checked ? 'tagih' : 'semua')} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
            Perlu ditagih saja
          </label>
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={<Store size={20} />} title="Toko tidak ditemukan" />
        ) : (
          <ul className="space-y-2">
            {rows.slice(0, 200).map(({ m, r, jadwal: j }) => {
              const hariIni = j.includes(D);
              const berikut = j.find((t) => t >= D);
              return (
                <li key={m.kode_toko}>
                  <button
                    type="button"
                    onClick={() => onPilih(m.kode_toko)}
                    className="flex w-full items-start gap-3 rounded-2xl border border-slate-200/80 bg-white p-3 text-left shadow-card hover:bg-slate-50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-2 break-words font-semibold leading-snug text-slate-900">{m.nama_toko}</div>
                      <div className="truncate text-xs text-slate-500">
                        {m.kode_toko}
                        {m.area && ` · ${m.area}`}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <StatusTokoBadge status={r.status} label={r.statusLabel} />
                        {hariIni ? <Badge tone="brand">On Route hari ini</Badge> : berikut ? <Badge tone="gray" dot={false}>Jadwal {formatTanggal(berikut)}</Badge> : null}
                        <BayarBadge tipe={m.tipe_bayar} top={m.top_hari} />
                        {m.status_blokir && <Badge tone="red">Diblokir</Badge>}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <span className={cn('text-sm font-semibold tabular', r.perluDitagih ? 'text-slate-900' : 'text-slate-400')}>{r.perluDitagih ? formatRupiah(r.totalHarusDitagih) : '–'}</span>
                      <ChevronRight size={18} className="text-slate-300" />
                    </div>
                  </button>
                </li>
              );
            })}
            {rows.length > 200 && <li className="py-2 text-center text-xs text-slate-500">Menampilkan 200 dari {rows.length}. Gunakan pencarian.</li>}
          </ul>
        )}
    </>
  );
}

// ───────────────────────── Aktivitas ─────────────────────────

export function AktivitasPage() {
  const { kode, setKode, D, salesmen } = useSalesSession();
  const { aktivitas, updatedAt, masterIdx } = useData();
  const hasil = useKunjungan(kode, D);
  const prog = progres(aktivitas.kunjungan, kode, D, hasil.baris.map((b) => b.kode_toko));
  const pen = aktivitas.penagihan.filter((p) => p.kode_salesman === kode && p.tanggal === D);
  const rp = ringkasPenagihan(pen);
  const po = aktivitas.po.filter((p) => p.kode_salesman === kode && p.tanggal === D);
  const stok = aktivitas.stok.filter((s) => s.kode_salesman === kode && s.tanggal === D);
  const nama = (k: string) => masterIdx.get(k)?.nama_toko ?? k;

  type Ev = { t: string; icon: typeof HandCoins; title: string; sub: string; tone: string };
  const timeline: Ev[] = [
    ...pen.map((p) => ({
      t: p.createdAt,
      icon: HandCoins,
      title: `${LABEL_STATUS_BAYAR[p.status]}${p.nominal ? ` ${formatRupiah(p.nominal)}` : ''}`,
      sub: `${nama(p.kode_toko)} · ${p.no_faktur}${p.alasan ? ` · ${p.alasan}` : ''}${p.tanggal_janji ? ` · janji ${formatTanggal(p.tanggal_janji)}` : ''}`,
      tone: p.status === 'BAD_DEBT' ? 'text-red-600 bg-red-50' : p.status === 'JANJI_BAYAR' ? 'text-violet-600 bg-violet-50' : 'text-emerald-600 bg-emerald-50',
    })),
    ...po.map((p) => ({ t: p.createdAt, icon: PackageCheck, title: `PO ${p.no_po} · ${formatRupiah(p.total)}`, sub: `${nama(p.kode_toko)} · ${p.items.length} SKU`, tone: 'text-brand-600 bg-brand-50' })),
    ...stok.map((s) => ({ t: s.createdAt, icon: ReceiptText, title: 'Cek stok', sub: `${nama(s.kode_toko)} · ${s.internal.length} SKU · ${s.kompetitor.length} kompetitor`, tone: 'text-slate-600 bg-slate-100' })),
    ...aktivitas.kunjungan
      .filter((k) => k.kode_salesman === kode && k.tanggal === D && k.selesaiAt)
      .map((k) => ({ t: k.selesaiAt!, icon: CheckCircle2, title: 'Kunjungan selesai', sub: nama(k.kode_toko), tone: 'text-emerald-600 bg-emerald-50' })),
  ].sort((a, b) => b.t.localeCompare(a.t));

  return (
    <>
      <SalesHeader title="Aktivitas" />
      <SalesBody>
        <div className="grid grid-cols-2 gap-2">
          <SummaryCard label="Kunjungan selesai" value={`${prog.selesai}/${prog.total}`} accent="green" />
          <SummaryCard label="Terkumpul" value={formatRupiah(rp.terkumpul)} accent="green" />
          <SummaryCard label="Janji bayar" value={rp.jumlahJanji} icon={<CalendarClock size={12} />} />
          <SummaryCard label="Bad debt" value={rp.jumlahBadDebt} accent={rp.jumlahBadDebt ? 'red' : undefined} icon={<ShieldAlert size={12} />} />
          <SummaryCard label="PO terkirim" value={po.length} accent="brand" />
          <SummaryCard label="Nilai PO" value={formatRupiah(po.reduce((s, p) => s + p.total, 0))} accent="brand" />
        </div>

        <div>
          <SectionTitle>Riwayat hari ini</SectionTitle>
          {timeline.length === 0 ? (
            <EmptyState title="Belum ada aktivitas">Mulai dari menu Rute (On Route / Non Route / Inkasso), buka toko, lalu lakukan Collection → Stok → PO.</EmptyState>
          ) : (
            <Card className="divide-y divide-slate-100 px-4">
              {timeline.map((e, i) => (
                <div key={i} className="flex items-start gap-3 py-3">
                  <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', e.tone)}>
                    <e.icon size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-900">{e.title}</div>
                    <div className="truncate text-xs text-slate-500">{e.sub}</div>
                  </div>
                  <span className="shrink-0 text-xs tabular text-slate-400">{formatJam(e.t)}</span>
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
