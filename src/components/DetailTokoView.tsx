import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { detailToko, type DetailToko, type FakturDinilai } from '../lib/billing';
import { getPenagihanTerakhir } from '../lib/collection';
import { formatTanggal, type ISODate } from '../lib/dates';
import { formatRupiah } from '../lib/format';
import { useData } from '../state';
import { FakturCard, usePenagihanTerakhir } from './Penagihan';
import { Badge, cn } from './ui';

export function useDetailToko(kodeToko: string, D: ISODate): DetailToko {
  const { data, fakturIdx, masterIdx } = useData();
  return detailToko(data, kodeToko, D, { fakturIdx, masterIdx });
}

/** Blok besar "Harus Ditagih". */
export function HarusDitagih({ d }: { d: DetailToko }) {
  return (
    <div className={cn('rounded-2xl px-4 py-3.5', d.perluDitagih ? 'bg-gradient-to-br from-red-600 to-red-700 text-white' : 'bg-slate-100 text-slate-700')}>
      <div className="text-xs font-medium uppercase tracking-wide opacity-80">Harus Ditagih</div>
      <div className="mt-0.5 text-3xl font-bold tabular">{formatRupiah(d.totalHarusDitagih)}</div>
      <div className="mt-1 text-xs opacity-80">
        {d.perluDitagih ? `${d.fakturOverdue} faktur overdue · ${d.fakturJtHariIni} jatuh tempo hari ini` : 'Tidak ada tagihan jatuh tempo'}
      </div>
    </div>
  );
}

/** Faktur dikelompokkan Overdue → JT Hari Ini → Belum JT. */
export function KelompokFaktur({ d, onPilih }: { d: DetailToko; onPilih?: (f: FakturDinilai) => void }) {
  const last = usePenagihanTerakhir();
  const Section = ({ title, items }: { title: string; items: FakturDinilai[] }) =>
    items.length ? (
      <section className="rounded-2xl border border-slate-200/80 bg-white px-4 shadow-card">
        <h3 className="flex items-baseline justify-between border-b border-slate-100 py-2.5 text-sm font-semibold text-slate-700">
          <span>
            {title} <span className="font-normal text-slate-500">({items.length})</span>
          </span>
          <span className="tabular">{formatRupiah(items.reduce((s, f) => s + f.sisa_tagihan, 0))}</span>
        </h3>
        <ul className="divide-y divide-slate-100">
          {items.map((f) => (
            <li key={f.no_faktur}>
              <FakturCard f={f} last={getPenagihanTerakhir(last, f.no_faktur)} onClick={onPilih ? () => onPilih(f) : undefined} />
            </li>
          ))}
        </ul>
      </section>
    ) : null;
  return (
    <>
      <Section title="Overdue" items={d.overdue} />
      <Section title="Jatuh Tempo Hari Ini" items={d.jtHariIni} />
      <Section title="Belum Jatuh Tempo" items={d.belumJt} />
      {!d.faktur.length && <p className="py-6 text-center text-sm text-slate-500">Tidak ada faktur aktif untuk toko ini.</p>}
    </>
  );
}

export function InfoOutlet({ kodeToko }: { kodeToko: string }) {
  const { masterIdx } = useData();
  const m = masterIdx.get(kodeToko);
  if (!m) return null;
  const items: ReactNode[] = [];
  if (m.tipe_outlet) items.push(<Badge key="t" tone="gray" dot={false}>{m.tipe_outlet}</Badge>);
  if (m.status_blokir) items.push(<Badge key="b" tone="red">Diblokir</Badge>);
  if (m.limit_kredit !== undefined) items.push(<Badge key="l" tone="gray" dot={false}>Limit {formatRupiah(m.limit_kredit)}</Badge>);
  return (
    <div className="space-y-1.5">
      {m.alamat && <p className="text-sm text-slate-600">{m.alamat}</p>}
      {items.length > 0 && <div className="flex flex-wrap gap-1.5">{items}</div>}
    </div>
  );
}

export function DetailTokoView({ kodeToko, D, onBack }: { kodeToko: string; D: ISODate; onBack?: () => void }) {
  const d = useDetailToko(kodeToko, D);
  return (
    <div className="space-y-3">
      {onBack && (
        <button type="button" onClick={onBack} className="-ml-1 inline-flex items-center gap-0.5 text-sm font-medium text-slate-600 hover:text-slate-900">
          <ChevronLeft size={16} /> Kembali
        </button>
      )}
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{d.nama_toko}</h2>
        <p className="text-sm text-slate-500">
          {d.kode_toko}
          {d.area && ` · ${d.area}`} · {formatTanggal(D)}
        </p>
      </div>
      <InfoOutlet kodeToko={d.kode_toko} />
      <HarusDitagih d={d} />
      <KelompokFaktur d={d} />
    </div>
  );
}
