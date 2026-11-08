import { useMemo, useState } from 'react';
import { hitungKunjungan, type BarisKunjungan } from '../lib/billing';
import type { ISODate } from '../lib/dates';
import { formatRupiah } from '../lib/format';
import type { UrutanMode } from '../lib/types';
import { useData } from '../state';
import { DetailTokoView } from './DetailTokoView';
import { Segmented, StatusTokoBadge, SummaryCard } from './ui';

function KartuToko({ b, onClick }: { b: BarisKunjungan; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`flex w-full items-start gap-3 rounded-xl border bg-white p-3 text-left transition-colors hover:bg-slate-50 ${
          b.perluDitagih ? 'border-slate-300' : 'border-slate-200'
        }`}
      >
        <span className="mt-0.5 w-6 shrink-0 text-right text-xs tabular-nums text-slate-400" title="Urutan rute">
          {b.urutan ?? '–'}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-slate-900">{b.nama_toko}</div>
          <div className="truncate text-xs text-slate-500">
            {b.kode_toko}
            {b.area && ` · ${b.area}`}
          </div>
          <div className="mt-1.5">
            <StatusTokoBadge status={b.status} label={b.statusLabel} />
          </div>
        </div>
        <div className={`shrink-0 text-right text-sm font-semibold tabular-nums ${b.perluDitagih ? 'text-slate-900' : 'text-slate-400'}`}>
          {b.perluDitagih ? formatRupiah(b.totalHarusDitagih) : '–'}
        </div>
      </button>
    </li>
  );
}

/** Tampilan "Kunjungan Hari Ini" — dipakai di /sales dan Rute Salesman (admin). */
export function KunjunganPanel({ kodeSalesman, D }: { kodeSalesman: string; D: ISODate }) {
  const { data, fakturIdx, masterIdx } = useData();
  const [filter, setFilter] = useState<'semua' | 'tagih'>('semua');
  const [urutan, setUrutan] = useState<UrutanMode>('prioritas');
  const [dipilih, setDipilih] = useState<string | null>(null);

  const hasil = useMemo(
    () => hitungKunjungan(data, kodeSalesman, D, { urutan, fakturIdx, masterIdx }),
    [data, kodeSalesman, D, urutan, fakturIdx, masterIdx],
  );
  const tampil = filter === 'tagih' ? hasil.baris.filter((b) => b.perluDitagih) : hasil.baris;

  if (dipilih) return <DetailTokoView kodeToko={dipilih} D={D} onBack={() => setDipilih(null)} />;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_1fr_1.7fr] gap-2">
        <SummaryCard label="Kunjungan" value={hasil.jumlahKunjungan} />
        <SummaryCard label="Perlu Ditagih" value={hasil.jumlahPerluDitagih} accent={hasil.jumlahPerluDitagih ? 'red' : undefined} />
        <SummaryCard label="Total Tagihan" value={<span className="text-[15px]">{formatRupiah(hasil.totalTagihan)}</span>} />
      </div>

      {hasil.jumlahKunjungan === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
          <p className="font-medium text-slate-700">Tidak ada jadwal kunjungan hari ini</p>
          <p className="mt-1 text-sm text-slate-500">Coba pilih tanggal lain.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Segmented
              label="Filter"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'semua', label: `Semua (${hasil.jumlahKunjungan})` },
                { value: 'tagih', label: `Perlu Ditagih (${hasil.jumlahPerluDitagih})` },
              ]}
            />
            <Segmented
              label="Urutan"
              value={urutan}
              onChange={setUrutan}
              options={[
                { value: 'prioritas', label: 'Prioritas' },
                { value: 'rute', label: 'Urutan rute' },
              ]}
            />
          </div>
          {tampil.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">Tidak ada toko yang perlu ditagih.</p>
          ) : (
            <ul className="space-y-2">
              {tampil.map((b) => (
                <KartuToko key={b.kode_toko} b={b} onClick={() => setDipilih(b.kode_toko)} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
