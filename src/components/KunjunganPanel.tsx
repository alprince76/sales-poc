import { CalendarX2, CheckCircle2, ChevronRight, Store } from 'lucide-react';
import { useMemo, useState } from 'react';
import { hitungKunjungan, type BarisKunjungan } from '../lib/billing';
import type { ISODate } from '../lib/dates';
import { formatRupiah } from '../lib/format';
import type { StatusKunjungan, UrutanMode } from '../lib/types';
import { cariKunjungan, isSelesai, progres } from '../lib/visit';
import { useData } from '../state';
import { BayarBadge, DetailTokoView } from './DetailTokoView';
import { Badge, cn, EmptyState, ProgressBar, Segmented, StatusTokoBadge, SummaryCard } from './ui';

export function useKunjungan(kodeSalesman: string, D: ISODate, urutan: UrutanMode = 'prioritas') {
  const { data, fakturIdx, masterIdx } = useData();
  return useMemo(() => hitungKunjungan(data, kodeSalesman, D, { urutan, fakturIdx, masterIdx }), [data, kodeSalesman, D, urutan, fakturIdx, masterIdx]);
}

function KartuToko({ b, kunjungan, onClick }: { b: BarisKunjungan; kunjungan?: StatusKunjungan; onClick: () => void }) {
  const selesai = isSelesai(kunjungan);
  const { masterIdx } = useData();
  const m = masterIdx.get(b.kode_toko);
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex w-full items-start gap-3 rounded-2xl border bg-white p-3 text-left shadow-card transition-colors hover:bg-slate-50 active:bg-slate-100',
          selesai ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200/80',
        )}
      >
        <span
          className={cn(
            'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular',
            selesai ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600',
          )}
          title="Urutan rute"
        >
          {selesai ? <CheckCircle2 size={16} /> : (b.urutan ?? '–')}
        </span>
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 break-words font-semibold leading-snug text-slate-900">{b.nama_toko}</div>
          <div className="truncate text-xs text-slate-500">
            {b.kode_toko}
            {b.area && ` · ${b.area}`}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <StatusTokoBadge status={b.status} label={b.statusLabel} />
            <BayarBadge tipe={m?.tipe_bayar} top={m?.top_hari} />
            {selesai && <Badge tone="green">Selesai</Badge>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className={cn('text-sm font-semibold tabular', b.perluDitagih ? 'text-slate-900' : 'text-slate-400')}>
            {b.perluDitagih ? formatRupiah(b.totalHarusDitagih) : '–'}
          </span>
          <ChevronRight size={18} className="text-slate-300" aria-hidden />
        </div>
      </button>
    </li>
  );
}

/**
 * Tampilan "Kunjungan Hari Ini". Dipakai di Sales (onPilih → buka halaman kunjungan)
 * dan Admin Rute (tanpa onPilih → detail inline).
 */
export function KunjunganPanel({ kodeSalesman, D, onPilih }: { kodeSalesman: string; D: ISODate; onPilih?: (kode: string) => void }) {
  const { aktivitas } = useData();
  const [filter, setFilter] = useState<'semua' | 'tagih' | 'belum'>('semua');
  const [urutan, setUrutan] = useState<UrutanMode>('prioritas');
  const [dipilih, setDipilih] = useState<string | null>(null);
  const hasil = useKunjungan(kodeSalesman, D, urutan);

  const kodeList = hasil.baris.map((b) => b.kode_toko);
  const prog = progres(aktivitas.kunjungan, kodeSalesman, D, kodeList);
  const kj = (kode: string) => cariKunjungan(aktivitas.kunjungan, kodeSalesman, kode, D);
  const tampil = hasil.baris.filter((b) => (filter === 'tagih' ? b.perluDitagih : filter === 'belum' ? !isSelesai(kj(b.kode_toko)) : true));

  if (!onPilih && dipilih) return <DetailTokoView kodeToko={dipilih} D={D} onBack={() => setDipilih(null)} />;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_1fr_1.7fr] gap-2">
        <SummaryCard label="Kunjungan" value={hasil.jumlahKunjungan} />
        <SummaryCard label="Perlu Ditagih" value={hasil.jumlahPerluDitagih} accent={hasil.jumlahPerluDitagih ? 'red' : undefined} />
        <SummaryCard label="Total Tagihan" value={<span className="text-[15px]">{formatRupiah(hasil.totalTagihan)}</span>} />
      </div>

      {hasil.jumlahKunjungan === 0 ? (
        <EmptyState icon={<CalendarX2 size={20} />} title="Tidak ada jadwal kunjungan hari ini">
          Coba pilih tanggal lain.
        </EmptyState>
      ) : (
        <>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-card">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium text-slate-700">Progres kunjungan</span>
              <span className="font-semibold tabular text-slate-900">
                {prog.selesai}/{prog.total} selesai
              </span>
            </div>
            <ProgressBar value={prog.selesai} max={prog.total} tone="green" />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Segmented
              label="Filter"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'semua', label: `Semua` },
                { value: 'tagih', label: `Ditagih (${hasil.jumlahPerluDitagih})` },
                { value: 'belum', label: `Belum (${prog.total - prog.selesai})` },
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
            <EmptyState icon={<Store size={20} />} title={filter === 'tagih' ? 'Tidak ada toko yang perlu ditagih' : 'Semua kunjungan selesai'} />
          ) : (
            <ul className="space-y-2">
              {tampil.map((b) => (
                <KartuToko key={b.kode_toko} b={b} kunjungan={kj(b.kode_toko)} onClick={() => (onPilih ? onPilih(b.kode_toko) : setDipilih(b.kode_toko))} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
