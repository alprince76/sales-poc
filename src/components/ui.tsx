import type { ReactNode } from 'react';
import { addDays, formatTanggal, namaHari, type ISODate } from '../lib/dates';
import type { StatusFaktur, StatusToko } from '../lib/types';

const TONE = {
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  orange: 'bg-orange-50 text-orange-700 ring-orange-600/20',
  gray: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  blue: 'bg-sky-50 text-sky-700 ring-sky-600/20',
} as const;

const DOT = { red: 'bg-red-500', orange: 'bg-orange-500', gray: 'bg-slate-400', blue: 'bg-sky-500' } as const;

export function Badge({ tone, children }: { tone: keyof typeof TONE; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE[tone]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[tone]}`} aria-hidden />
      {children}
    </span>
  );
}

export function StatusTokoBadge({ status, label }: { status: StatusToko; label: string }) {
  const tone = status === 'OVERDUE' ? 'red' : status === 'JATUH_TEMPO_HARI_INI' ? 'orange' : 'gray';
  return <Badge tone={tone}>{label}</Badge>;
}

export function StatusFakturBadge({ status, hariTerlambat }: { status: StatusFaktur; hariTerlambat: number }) {
  if (status === 'OVERDUE') return <Badge tone="red">Overdue {hariTerlambat} hari</Badge>;
  if (status === 'JATUH_TEMPO_HARI_INI') return <Badge tone="orange">Jatuh Tempo Hari Ini</Badge>;
  return <Badge tone="blue">Belum Jatuh Tempo</Badge>;
}

export function SummaryCard({ label, value, accent }: { label: string; value: ReactNode; accent?: 'red' }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-2.5 py-2.5">
      <div className="text-[11px] font-medium uppercase leading-tight text-slate-500">{label}</div>
      <div className={`mt-1 whitespace-nowrap text-lg font-semibold tabular-nums ${accent === 'red' ? 'text-red-700' : 'text-slate-900'}`}>
        {value}
      </div>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-slate-100 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            value === o.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function DateNav({ value, onChange }: { value: ISODate; onChange: (d: ISODate) => void }) {
  const btn = 'h-9 w-9 shrink-0 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50';
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" className={btn} onClick={() => onChange(addDays(value, -1))} aria-label="Kemarin">
        ‹
      </button>
      <label className="relative flex h-9 min-w-0 flex-1 items-center justify-center rounded-lg border border-slate-200 bg-white px-2 text-sm font-medium text-slate-800">
        <span className="truncate">
          {namaHari(value)}, {formatTanggal(value)}
        </span>
        <input
          type="date"
          value={value}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label="Pilih tanggal"
        />
      </label>
      <button type="button" className={btn} onClick={() => onChange(addDays(value, 1))} aria-label="Besok">
        ›
      </button>
    </div>
  );
}

export function Select({
  value,
  onChange,
  children,
  label,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-800 ${className}`}
    >
      {children}
    </select>
  );
}
