import { ChevronLeft } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { detailToko, type DetailToko, type FakturDinilai } from '../lib/billing';
import { getPenagihanTerakhir } from '../lib/collection';
import { formatTanggal, type ISODate } from '../lib/dates';
import { formatRupiah } from '../lib/format';
import { alamatLengkap, lastOrder } from '../lib/outlet';
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

/** "TUNAI" / "KREDIT · TOP 30 hari" */
export function BayarBadge({ tipe, top }: { tipe?: string; top?: number }) {
  if (!tipe) return null;
  const tunai = tipe === 'TUNAI';
  return (
    <Badge tone={tunai ? 'green' : 'brand'} dot={false}>
      <span className="font-bold">{tunai ? 'TUNAI' : 'KREDIT'}</span>
      {!tunai && top ? ` · TOP ${top} hari` : ''}
    </Badge>
  );
}

/** Info toko MT: Cust group + alamat (tanpa limit/TOP). */
export function InfoOutletMT({ kodeToko }: { kodeToko: string }) {
  const { masterIdx } = useData();
  const m = masterIdx.get(kodeToko);
  if (!m) return null;
  const alamat = alamatLengkap(m);
  return (
    <div className="space-y-1.5">
      {alamat && <p className="text-sm text-slate-600">{alamat}</p>}
      {m.cust_group && (
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="violet" dot={false}>
            <span className="font-semibold">{m.cust_group}</span>
          </Badge>
        </div>
      )}
    </div>
  );
}

/**
 * Info toko GT sesuai customer master: alamat (bill address 1–4), credit limit, TOP,
 * average sales (RPP13), last order value/date, outstanding.
 */
export function InfoOutlet({ kodeToko, D, outstanding }: { kodeToko: string; D: ISODate; outstanding: number }) {
  const { masterIdx, data, aktivitas, produk } = useData();
  const m = masterIdx.get(kodeToko);
  const last = useMemo(() => lastOrder(kodeToko, D, data.histori, aktivitas.po, produk), [kodeToko, D, data.histori, aktivitas.po, produk]);
  if (!m) return null;
  const alamat = alamatLengkap(m);
  const tunai = m.tipe_bayar === 'TUNAI';
  const Item = ({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) => (
    <div className={cn('min-w-0', wide && 'col-span-2')}>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold tabular text-slate-900">{children}</dd>
    </div>
  );
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card" aria-label="Info toko">
      <div className="flex flex-wrap items-center gap-1.5">
        <BayarBadge tipe={m.tipe_bayar} top={m.top_hari} />
        {m.status_blokir && <Badge tone="red">Diblokir</Badge>}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5">
        {alamat && (
          <Item label="Alamat" wide>
            <span className="font-normal text-slate-700">{alamat}</span>
          </Item>
        )}
        <Item label="Credit limit">{!tunai && m.limit_kredit !== undefined ? formatRupiah(m.limit_kredit) : '–'}</Item>
        <Item label="TOP">{tunai ? 'Tunai' : m.top_hari ? `${m.top_hari} hari` : '–'}</Item>
        <Item label="Average sales">{m.rpp13 !== undefined ? formatRupiah(m.rpp13) : '–'}</Item>
        <Item label="Outstanding">{formatRupiah(outstanding)}</Item>
        <Item label="Last order value">{last ? formatRupiah(last.nilai) : '–'}</Item>
        <Item label="Last order date">{last ? formatTanggal(last.tanggal) : '–'}</Item>
      </dl>
    </section>
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
      <InfoOutlet kodeToko={d.kode_toko} D={D} outstanding={d.totalOutstanding} />
      <HarusDitagih d={d} />
      <KelompokFaktur d={d} />
    </div>
  );
}
