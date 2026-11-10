import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { LABEL_STATUS_BAYAR } from '../lib/collection';
import { addDays, formatTanggal, namaHari, type ISODate } from '../lib/dates';
import { formatRupiah } from '../lib/format';
import type { Penagihan, StatusFaktur, StatusToko } from '../lib/types';

export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ───────────────────────── Button ─────────────────────────

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
const VARIANT: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 disabled:bg-slate-300',
  secondary: 'border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 active:bg-slate-100 disabled:text-slate-400',
  ghost: 'text-slate-700 hover:bg-slate-100 active:bg-slate-200 disabled:text-slate-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 disabled:bg-slate-300',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-slate-300',
};
const SIZE = { sm: 'h-8 px-3 text-sm gap-1.5', md: 'h-10 px-4 text-sm gap-2', lg: 'h-12 px-5 text-base gap-2' };

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  block,
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: keyof typeof SIZE; block?: boolean }) {
  return (
    <button
      type="button"
      {...p}
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap rounded-xl font-semibold transition-[background-color,transform] active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100',
        VARIANT[variant],
        SIZE[size],
        block && 'w-full',
        className,
      )}
    />
  );
}

export function IconButton({ label, className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...p}
      className={cn('inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 active:bg-slate-200', className)}
    />
  );
}

export function Card({ children, className, as: As = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'section' }) {
  return <As className={cn('rounded-2xl border border-slate-200/80 bg-white shadow-card', className)}>{children}</As>;
}

// ───────────────────────── Badges ─────────────────────────

const TONE = {
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  orange: 'bg-orange-50 text-orange-700 ring-orange-600/20',
  gray: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  blue: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  violet: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  brand: 'bg-brand-50 text-brand-700 ring-brand-600/20',
} as const;
const DOT = {
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  gray: 'bg-slate-400',
  blue: 'bg-sky-500',
  green: 'bg-emerald-500',
  violet: 'bg-violet-500',
  brand: 'bg-brand-500',
} as const;
export type Tone = keyof typeof TONE;

export function Badge({ tone, children, dot = true }: { tone: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', TONE[tone])}>
      {dot && <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', DOT[tone])} aria-hidden />}
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

export const TONE_BAYAR: Record<Penagihan['status'], Tone> = { PAID: 'green', PARTIAL: 'brand', JANJI_BAYAR: 'violet', BAD_DEBT: 'red' };

/** Label hasil penagihan terakhir: "Paid Rp 7.250.000" / "Janji bayar 12 Nov 2026" / "Bad Debt · Toko Tutup". */
export function labelPenagihan(p: Penagihan): string {
  if (p.status === 'PAID' || p.status === 'PARTIAL') return `${LABEL_STATUS_BAYAR[p.status]} ${formatRupiah(p.nominal)}`;
  if (p.status === 'JANJI_BAYAR') return `Janji bayar ${p.tanggal_janji ? formatTanggal(p.tanggal_janji) : ''}`;
  return `Bad Debt · ${p.alasan ?? ''}`;
}

export function StatusBayarBadge({ p }: { p: Penagihan }) {
  return <Badge tone={TONE_BAYAR[p.status]}>{labelPenagihan(p)}</Badge>;
}

// ───────────────────────── Ringkasan & layout ─────────────────────────

export function SummaryCard({
  label,
  value,
  accent,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  accent?: 'red' | 'green' | 'brand';
  hint?: ReactNode;
  icon?: ReactNode;
}) {
  const color = accent === 'red' ? 'text-red-700' : accent === 'green' ? 'text-emerald-700' : accent === 'brand' ? 'text-brand-700' : 'text-slate-900';
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-card">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase leading-tight tracking-tight text-slate-500">
        {icon}
        <span>{label}</span>
      </div>
      <div className={cn('mt-1 whitespace-nowrap text-lg font-semibold tabular', color)}>{value}</div>
      {hint && <div className="mt-0.5 truncate text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function ProgressBar({ value, max, tone = 'brand' }: { value: number; max: number; tone?: 'brand' | 'green' }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <div className={cn('h-full rounded-full transition-[width] duration-500', tone === 'green' ? 'bg-emerald-500' : 'bg-brand-500')} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      {icon && <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500">{icon}</div>}
      <p className="font-semibold text-slate-800">{title}</p>
      {children && <div className="mt-1 text-sm text-slate-500">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-2">
      <h3 className="text-sm font-semibold text-slate-700">{children}</h3>
      {right && <div className="text-sm text-slate-500">{right}</div>}
    </div>
  );
}

// ───────────────────────── Inputs ─────────────────────────

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  block,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  label: string;
  block?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex rounded-xl bg-slate-100 p-1', block && 'flex w-full')}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
            block && 'flex-1',
            value === o.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chips<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
            value === o.value ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function DateNav({ value, onChange, compact }: { value: ISODate; onChange: (d: ISODate) => void; compact?: boolean }) {
  const btn = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100';
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" className={btn} onClick={() => onChange(addDays(value, -1))} aria-label="Hari sebelumnya">
        <ChevronLeft size={18} />
      </button>
      <label className="relative flex h-10 min-w-0 flex-1 cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-800 hover:bg-slate-50">
        <span className="truncate">
          {compact ? '' : `${namaHari(value)}, `}
          {formatTanggal(value)}
        </span>
        <input type="date" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Pilih tanggal" />
      </label>
      <button type="button" className={btn} onClick={() => onChange(addDays(value, 1))} aria-label="Hari berikutnya">
        <ChevronRight size={18} />
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
      className={cn('h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20', className)}
    >
      {children}
    </select>
  );
}

export function Input({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...p}
      className={cn(
        'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50',
        className,
      )}
    />
  );
}

export function Field({ label, children, error, hint }: { label: string; children: ReactNode; error?: string | null; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-sm text-red-600">{error}</span> : hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

/** Input angka rupiah dengan pemisah ribuan. */
export function RupiahInput({ value, onChange, ...p }: { value: number | null; onChange: (n: number | null) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">Rp</span>
      <Input
        {...p}
        inputMode="numeric"
        className="pl-10 tabular"
        value={value === null ? '' : value.toLocaleString('id-ID')}
        onChange={(e) => {
          const d = e.target.value.replace(/\D/g, '');
          onChange(d ? Number(d) : null);
        }}
      />
    </div>
  );
}

/** − [qty] + ; step dipakai tombol, input bebas. */
export function NumberStepper({
  value,
  onChange,
  step = 1,
  min = 0,
  label,
  onIncrementFromZero,
  invalid,
}: {
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  label: string;
  /** Nilai saat menekan + dari 0 (mis. MOQ). */
  onIncrementFromZero?: number;
  invalid?: boolean;
}) {
  const btn = 'flex h-9 w-9 items-center justify-center rounded-lg text-lg font-semibold text-slate-700 hover:bg-slate-100 active:bg-slate-200 disabled:text-slate-300';
  return (
    <div className={cn('inline-flex items-center rounded-xl border bg-white p-0.5', invalid ? 'border-red-300 ring-2 ring-red-500/15' : 'border-slate-200')}>
      <button type="button" className={btn} aria-label={`Kurangi ${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))}>
        −
      </button>
      <input
        aria-label={label}
        inputMode="numeric"
        value={value}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const d = e.target.value.replace(/\D/g, '');
          onChange(d ? Number(d) : 0);
        }}
        className="h-9 w-12 bg-transparent text-center font-semibold tabular text-slate-900 focus:outline-none"
      />
      <button
        type="button"
        className={btn}
        aria-label={`Tambah ${label}`}
        onClick={() => onChange(value === 0 && onIncrementFromZero ? onIncrementFromZero : value + step)}
      >
        +
      </button>
    </div>
  );
}

// ───────────────────────── Bottom sheet / Dialog ─────────────────────────

/** Bottom sheet di mobile, dialog di tengah layar ≥ sm. */
export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 animate-fade-in bg-slate-900/40" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="relative flex max-h-[92dvh] w-full animate-sheet-in flex-col rounded-t-3xl bg-white shadow-sheet focus:outline-none sm:max-w-lg sm:animate-toast-in sm:rounded-3xl"
      >
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-slate-200 sm:hidden" aria-hidden />
        <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-3">
          <div className="min-w-0 text-base font-semibold text-slate-900">{title}</div>
          <IconButton label="Tutup" onClick={onClose} className="-mr-2 -mt-1 h-9 w-9">
            <X size={18} />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className="border-t border-slate-100 px-5 py-3 pb-safe">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ───────────────────────── Toast ─────────────────────────

type ToastItem = { id: number; text: string; tone: 'success' | 'error' | 'info' };
const ToastCtx = createContext<(text: string, tone?: ToastItem['tone']) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const show = useCallback((text: string, tone: ToastItem['tone'] = 'success') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x.slice(-1), { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6" aria-live="polite">
          {items.map((t) => (
            <div
              key={t.id}
              className={cn(
                'pointer-events-auto max-w-sm animate-toast-in rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-lg',
                t.tone === 'error' ? 'bg-red-600' : t.tone === 'info' ? 'bg-slate-800' : 'bg-emerald-600',
              )}
            >
              {t.text}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
