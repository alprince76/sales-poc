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

/**
 * Qty ringkas untuk baris hasil pencarian SKU: belum dipesan → tombol "+", sudah → − qty +.
 * Nilai dalam satuan dasar (Pcs). Semua tombol mencegah blur supaya dropdown pencarian tetap terbuka.
 */
export function QtyInline({ value, onChange, isi = 1, label }: { value: number; onChange: (n: number) => void; isi?: number; satuan?: string; label: string }) {
  const tahan = (e: { preventDefault: () => void; stopPropagation: () => void }) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const tombol = 'flex h-8 w-8 items-center justify-center rounded-lg text-base font-bold leading-none';
  if (value <= 0)
    return (
      <button
        type="button"
        aria-label={`Tambah ${label}`}
        onMouseDown={tahan}
        onClick={(e) => {
          e.stopPropagation();
          onChange(1);
        }}
        className={cn(tombol, 'shrink-0 bg-brand-50 text-brand-700 hover:bg-brand-100')}
      >
        +
      </button>
    );
  return (
    <div className="flex shrink-0 flex-col items-end" onMouseDown={tahan} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center rounded-lg border border-brand-200 bg-white">
        <button type="button" aria-label={`Kurangi ${label}`} onClick={() => onChange(value - 1)} className={cn(tombol, 'text-slate-600 hover:bg-slate-100')}>
          −
        </button>
        <input
          aria-label={`Qty ${label}`}
          inputMode="numeric"
          value={value}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            const n = Number(e.target.value.replace(/\D/g, ''));
            onChange(Number.isFinite(n) ? n : 0);
          }}
          className="h-8 w-10 border-x border-slate-100 text-center text-sm font-semibold tabular text-slate-900 focus:outline-none"
        />
        <button type="button" aria-label={`Tambah ${label}`} onClick={() => onChange(value + 1)} className={cn(tombol, 'text-brand-700 hover:bg-brand-50')}>
          +
        </button>
      </div>
      {isi > 1 && value >= isi && value % isi === 0 && <span className="mt-0.5 text-[10px] tabular text-slate-500">= {value / isi} CAR</span>}
    </div>
  );
}
