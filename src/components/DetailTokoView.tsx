import { detailToko, type FakturDinilai } from '../lib/billing';
import { formatTanggal, type ISODate } from '../lib/dates';
import { formatRupiah } from '../lib/format';
import { useData } from '../state';
import { StatusFakturBadge } from './ui';

function FakturItem({ f }: { f: FakturDinilai }) {
  return (
    <li className="flex items-start justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="truncate font-mono text-sm text-slate-900">{f.no_faktur}</div>
        <div className="mt-0.5 text-xs text-slate-500">
          Faktur {formatTanggal(f.tanggal_faktur)} · JT {formatTanggal(f.tanggal_jatuh_tempo)}
        </div>
        <div className="mt-1.5">
          <StatusFakturBadge status={f.status} hariTerlambat={f.hariTerlambat} />
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-sm font-semibold tabular-nums text-slate-900">{formatRupiah(f.sisa_tagihan)}</div>
        {f.sisa_tagihan !== f.nilai_faktur && (
          <div className="text-xs tabular-nums text-slate-500">dari {formatRupiah(f.nilai_faktur)}</div>
        )}
      </div>
    </li>
  );
}

function Section({ title, items }: { title: string; items: FakturDinilai[] }) {
  if (!items.length) return null;
  const total = items.reduce((s, f) => s + f.sisa_tagihan, 0);
  return (
    <section className="rounded-xl border border-slate-200 bg-white px-4">
      <h3 className="flex items-baseline justify-between border-b border-slate-100 py-2.5 text-sm font-semibold text-slate-700">
        <span>
          {title} <span className="font-normal text-slate-500">({items.length})</span>
        </span>
        <span className="tabular-nums">{formatRupiah(total)}</span>
      </h3>
      <ul className="divide-y divide-slate-100">
        {items.map((f) => (
          <FakturItem key={f.no_faktur} f={f} />
        ))}
      </ul>
    </section>
  );
}

export function DetailTokoView({ kodeToko, D, onBack }: { kodeToko: string; D: ISODate; onBack?: () => void }) {
  const { data, fakturIdx, masterIdx } = useData();
  const d = detailToko(data, kodeToko, D, { fakturIdx, masterIdx });

  return (
    <div className="space-y-3">
      {onBack && (
        <button type="button" onClick={onBack} className="text-sm font-medium text-slate-600 hover:text-slate-900">
          ‹ Kembali
        </button>
      )}
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{d.nama_toko}</h2>
        <p className="text-sm text-slate-500">
          {d.kode_toko}
          {d.area && ` · ${d.area}`} · kunjungan {formatTanggal(D)}
        </p>
      </div>

      <div className={`rounded-xl px-4 py-3 ${d.perluDitagih ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
        <div className="text-xs font-medium uppercase tracking-wide opacity-80">Harus Ditagih</div>
        <div className="mt-0.5 text-3xl font-bold tabular-nums">{formatRupiah(d.totalHarusDitagih)}</div>
        <div className="mt-1 text-xs opacity-80">
          {d.perluDitagih
            ? `${d.fakturOverdue} faktur overdue · ${d.fakturJtHariIni} jatuh tempo hari ini`
            : 'Tidak ada tagihan jatuh tempo'}
        </div>
      </div>

      <Section title="Overdue" items={d.overdue} />
      <Section title="Jatuh Tempo Hari Ini" items={d.jtHariIni} />
      <Section title="Belum Jatuh Tempo" items={d.belumJt} />
      {!d.faktur.length && <p className="py-6 text-center text-sm text-slate-500">Tidak ada faktur aktif untuk toko ini.</p>}
    </div>
  );
}
