import { useState } from 'react';
import type { SatuanInput } from '../lib/types';
import { cn, NumberStepper } from './ui';

/** Toggle kecil CAR / PCS. */
export function UnitToggle({ value, onChange, satuan = 'Pcs', label }: { value: SatuanInput; onChange: (u: SatuanInput) => void; satuan?: string; label: string }) {
  return (
    <div role="radiogroup" aria-label={`Satuan ${label}`} className="inline-flex shrink-0 rounded-lg bg-slate-100 p-0.5">
      {(['CAR', 'PCS'] as const).map((u) => (
        <button
          key={u}
          type="button"
          role="radio"
          aria-checked={value === u}
          onClick={() => onChange(u)}
          className={cn('h-8 rounded-md px-1.5 text-[11px] font-bold tracking-wide transition-colors', value === u ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800')}
        >
          {u === 'PCS' ? satuan.toUpperCase() : 'CAR'}
        </button>
      ))}
    </div>
  );
}

/**
 * Input qty dengan pilihan satuan CAR / PCS. Nilai (`value`/`onChange`) selalu dalam satuan dasar (Pcs),
 * CAR = `isi` Pcs. Tanpa `isi` > 1, toggle disembunyikan.
 */
export function QtyUnit({
  value,
  onChange,
  isi = 1,
  satuan = 'Pcs',
  label,
  moq,
  invalid,
}: {
  value: number;
  onChange: (n: number) => void;
  isi?: number;
  satuan?: string;
  label: string;
  /** Nilai saat + dari 0 (satuan dasar). */
  moq?: number;
  invalid?: boolean;
}) {
  const [pilih, setPilih] = useState<SatuanInput>(() => (isi > 1 && value > 0 && value % isi === 0 ? 'CAR' : 'PCS'));
  const car = isi > 1 && pilih === 'CAR' && value % isi === 0;
  const ganti = (u: SatuanInput) => {
    setPilih(u);
    if (u === 'CAR' && value % isi) onChange(Math.ceil(value / isi) * isi);
  };
  return (
    <div className="flex flex-col items-start gap-0.5">
      <div className="flex items-center gap-1.5">
        <NumberStepper
          label={label}
          value={car ? value / isi : value}
          onIncrementFromZero={car ? 1 : moq}
          invalid={invalid}
          onChange={(n) => onChange(car ? n * isi : n)}
        />
        {isi > 1 && <UnitToggle value={car ? 'CAR' : 'PCS'} onChange={ganti} satuan={satuan} label={label} />}
      </div>
      {isi > 1 && (
        <span className="pl-1 text-[11px] tabular text-slate-500">
          {car ? `= ${value} ${satuan}` : `1 CAR = ${isi} ${satuan}`}
        </span>
      )}
    </div>
  );
}
