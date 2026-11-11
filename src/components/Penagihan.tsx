import { CheckCircle2, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { FakturDinilai } from '../lib/billing';
import { ALASAN_BAD_DEBT, buatPenagihan, getPenagihanTerakhir, LABEL_STATUS_BAYAR, penagihanTerakhir, validasiPenagihan, type InputPenagihan } from '../lib/collection';
import { addDays, formatTanggal, type ISODate } from '../lib/dates';
import { namaDivisi, tanggalDMY } from '../lib/divisi';
import { formatRupiah } from '../lib/format';
import type { Penagihan, StatusBayar } from '../lib/types';
import { newId, useData } from '../state';
import { Button, cn, Field, Input, RupiahInput, Sheet, StatusBayarBadge, StatusFakturBadge, useToast } from './ui';

/** Map no_faktur → catatan penagihan terakhir (seluruh aktivitas). */
export function usePenagihanTerakhir() {
  const { aktivitas } = useData();
  return useMemo(() => penagihanTerakhir(aktivitas.penagihan), [aktivitas.penagihan]);
}

/** Chip kode divisi faktur (DNE / CBN / MRS …), nama lengkap di tooltip & screen reader. */
export function DivisiChip({ kode }: { kode: string }) {
  const nama = namaDivisi(kode);
  return (
    <span title={nama} className="mb-0.5 inline-flex items-center rounded-md bg-slate-800 px-1.5 py-px text-[11px] font-bold tracking-wide text-white">
      {kode.toUpperCase()}
      <span className="sr-only"> ({nama})</span>
    </span>
  );
}

export function FakturCard({ f, last, onClick, subtitle }: { f: FakturDinilai; last?: Penagihan; onClick?: () => void; subtitle?: string }) {
  const body = (
    <>
      <div className="min-w-0 flex-1">
        {subtitle && <div className="truncate text-sm font-semibold text-slate-900">{subtitle}</div>}
        {f.divisi && <DivisiChip kode={f.divisi} />}
        <div className={cn('truncate font-mono text-[13px]', subtitle ? 'text-slate-500' : 'text-slate-900')}>{f.no_faktur}</div>
        <div className="mt-0.5 text-xs text-slate-500">JT {tanggalDMY(f.tanggal_jatuh_tempo)}</div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <StatusFakturBadge status={f.status} hariTerlambat={f.hariTerlambat} />
          {last && <StatusBayarBadge p={last} />}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-sm font-semibold tabular text-slate-900">{formatRupiah(f.sisa_tagihan)}</div>
        {f.sisa_tagihan !== f.nilai_faktur && <div className="text-xs tabular text-slate-500">dari {formatRupiah(f.nilai_faktur)}</div>}
      </div>
      {onClick && <ChevronRight size={18} className="mt-0.5 shrink-0 text-slate-400" aria-hidden />}
    </>
  );
  if (!onClick) return <div className="flex items-start gap-3 py-3">{body}</div>;
  return (
    <button type="button" onClick={onClick} className="-mx-2 flex w-[calc(100%+1rem)] items-start gap-3 rounded-xl px-2 py-3 text-left hover:bg-slate-50 active:bg-slate-100">
      {body}
    </button>
  );
}

const OPSI: { value: StatusBayar; label: string; desc: string }[] = [
  { value: 'PAID', label: 'Paid', desc: 'Lunas seluruh sisa' },
  { value: 'PARTIAL', label: 'Partially Paid', desc: 'Bayar sebagian' },
  { value: 'JANJI_BAYAR', label: 'Janji Bayar', desc: 'Bayar di tanggal lain' },
  { value: 'BAD_DEBT', label: 'Bad Debt', desc: 'Tidak tertagih' },
];

/** Form update status penagihan satu faktur (bottom sheet). */
export function PenagihanSheet({ faktur, kodeSalesman, D, onClose }: { faktur: FakturDinilai | null; kodeSalesman: string; D: ISODate; onClose: () => void }) {
  return (
    <Sheet open={!!faktur} onClose={onClose} title={faktur ? 'Update Penagihan' : ''}>
      {faktur && <PenagihanForm key={faktur.no_faktur} faktur={faktur} kodeSalesman={kodeSalesman} D={D} onDone={onClose} />}
    </Sheet>
  );
}

function PenagihanForm({ faktur, kodeSalesman, D, onDone }: { faktur: FakturDinilai; kodeSalesman: string; D: ISODate; onDone: () => void }) {
  const { tambahPenagihan, aktivitas } = useData();
  const toast = useToast();
  const [input, setInput] = useState<InputPenagihan>({ status: null, nominal: null, tanggal_janji: addDays(D, 3), alasan: null, alasan_lain: '' });
  const [tried, setTried] = useState(false);
  const errors = validasiPenagihan(input, faktur.sisa_tagihan, D);
  const riwayat = aktivitas.penagihan.filter((p) => p.no_faktur === faktur.no_faktur).slice().reverse();
  const last = getPenagihanTerakhir(penagihanTerakhir(riwayat), faktur.no_faktur);

  const simpan = () => {
    setTried(true);
    if (errors.length) return;
    const p = buatPenagihan(input, { faktur, sisa: faktur.sisa_tagihan, kode_salesman: kodeSalesman, D, id: newId(), now: new Date().toISOString() });
    tambahPenagihan(p);
    toast(
      p.status === 'PAID' || p.status === 'PARTIAL'
        ? `${LABEL_STATUS_BAYAR[p.status]} ${formatRupiah(p.nominal)} tercatat`
        : `${LABEL_STATUS_BAYAR[p.status]} tercatat`,
    );
    onDone();
  };

  const err = (k: StatusBayar) => (tried && input.status === k ? errors[0] : null);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-slate-50 p-3">
        {faktur.divisi && (
          <div className="flex items-center gap-1.5">
            <DivisiChip kode={faktur.divisi} />
            <span className="text-xs text-slate-500">{namaDivisi(faktur.divisi)}</span>
          </div>
        )}
        <div className="font-mono text-sm text-slate-900">{faktur.no_faktur}</div>
        <div className="mt-0.5 text-xs text-slate-500">
          Faktur {tanggalDMY(faktur.tanggal_faktur)} · JT {tanggalDMY(faktur.tanggal_jatuh_tempo)}
        </div>
        <div className="mt-2 flex items-end justify-between gap-2">
          <StatusFakturBadge status={faktur.status} hariTerlambat={faktur.hariTerlambat} />
          <div className="text-right">
            <div className="text-xs text-slate-500">Sisa tagihan</div>
            <div className="text-xl font-bold tabular text-slate-900">{formatRupiah(faktur.sisa_tagihan)}</div>
          </div>
        </div>
        {last && (
          <div className="mt-2 text-xs text-slate-500">
            Terakhir: <StatusBayarBadge p={last} />
          </div>
        )}
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-700">Status penagihan</legend>
        <div className="grid grid-cols-2 gap-2">
          {OPSI.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={input.status === o.value}
              onClick={() => setInput((p) => ({ ...p, status: o.value }))}
              className={cn(
                'rounded-xl border p-3 text-left transition-colors',
                input.status === o.value ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-500/20' : 'border-slate-200 hover:bg-slate-50',
              )}
            >
              <div className="flex items-center justify-between text-sm font-semibold text-slate-900">
                {o.label}
                {input.status === o.value && <CheckCircle2 size={16} className="text-brand-600" />}
              </div>
              <div className="text-xs text-slate-500">{o.desc}</div>
            </button>
          ))}
        </div>
        {tried && !input.status && <p className="mt-2 text-sm text-red-600">{errors[0]}</p>}
      </fieldset>

      {input.status === 'PAID' && (
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Diterima <span className="font-semibold">{formatRupiah(faktur.sisa_tagihan)}</span>. Faktur akan lunas.
        </p>
      )}
      {input.status === 'PARTIAL' && (
        <Field label="Nominal dibayar" error={err('PARTIAL')} hint={input.nominal ? `Sisa setelah bayar: ${formatRupiah(Math.max(0, faktur.sisa_tagihan - input.nominal))}` : undefined}>
          <RupiahInput value={input.nominal ?? null} onChange={(n) => setInput((p) => ({ ...p, nominal: n }))} placeholder="0" autoFocus />
        </Field>
      )}
      {input.status === 'JANJI_BAYAR' && (
        <Field label="Tanggal janji bayar" error={err('JANJI_BAYAR')}>
          <Input type="date" min={D} value={input.tanggal_janji ?? ''} onChange={(e) => setInput((p) => ({ ...p, tanggal_janji: e.target.value }))} />
        </Field>
      )}
      {input.status === 'BAD_DEBT' && (
        <div className="space-y-3">
          <Field label="Alasan" error={tried && !input.alasan ? errors[0] : null}>
            <select
              value={input.alasan ?? ''}
              onChange={(e) => setInput((p) => ({ ...p, alasan: e.target.value || null }))}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="">Pilih alasan…</option>
              {ALASAN_BAD_DEBT.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </Field>
          {input.alasan === 'Lainnya' && (
            <Field label="Alasan lainnya" error={tried && input.alasan ? errors[0] : null}>
              <Input value={input.alasan_lain ?? ''} onChange={(e) => setInput((p) => ({ ...p, alasan_lain: e.target.value }))} placeholder="Tulis alasan" autoFocus />
            </Field>
          )}
        </div>
      )}

      <Button block size="lg" onClick={simpan}>
        Simpan
      </Button>

      {riwayat.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-medium uppercase text-slate-500">Riwayat faktur ini</div>
          <ul className="space-y-1 text-sm">
            {riwayat.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2">
                <StatusBayarBadge p={p} />
                <span className="text-xs text-slate-500">{formatTanggal(p.tanggal)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
