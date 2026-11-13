import { ChevronDown, Download } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { LABEL_FORMAT, type FormatEkspor } from '../lib/csv';
import { Button } from './ui';

/** Tombol "Export ▾" → CSV / TXT / Excel. */
export function ExportMenu({ onExport, disabled, label = 'Export' }: { onExport: (f: FormatEkspor) => void; disabled?: boolean; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <Button variant="secondary" disabled={disabled} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Download size={16} /> {label} <ChevronDown size={14} className="-mr-1 text-slate-500" />
      </Button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-1.5 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-sheet animate-fade-in">
          {(Object.keys(LABEL_FORMAT) as FormatEkspor[]).map((f) => (
            <button
              key={f}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onExport(f);
              }}
              className="block w-full px-3.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              {LABEL_FORMAT[f]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
