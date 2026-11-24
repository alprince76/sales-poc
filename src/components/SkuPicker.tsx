import { Check, Plus, Search, X } from 'lucide-react';
import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { formatRupiah } from '../lib/format';
import type { ProdukLengkap } from '../lib/order';
import { cariSkuLengkap, sorotNama } from '../lib/sku-search';
import { cn } from './ui';

/**
 * Combobox pilih SKU: ketik kode SAP atau nama → daftar saran → klik / Enter untuk menambah.
 * Dipakai di Cek Stok (GT), Input PO (GT & MT).
 */
export function SkuPicker({
  produk,
  onPilih,
  terpilih,
  placeholder = 'Cari kode atau nama SKU',
  label = 'Cari SKU',
  /**
   * Slot opsional di kanan setiap baris saran.
   * Bila diberikan, menggantikan ikon + / ✓ default.
   * Pakai di PO (GT & MT) untuk stepper qty inline.
   * onMouseDown harus `e.preventDefault()` di dalam elemen interaktif
   * agar input tidak kehilangan fokus dan dropdown tidak menutup.
   */
  renderExtra,
  info,
}: {
  produk: readonly ProdukLengkap[];
  onPilih: (p: ProdukLengkap) => void;
  /** Kode SKU yang sudah ada di daftar (ditandai ✓). */
  terpilih?: ReadonlySet<string>;
  placeholder?: string;
  label?: string;
  renderExtra?: (p: ProdukLengkap, sudah: boolean) => ReactNode;
  /** Baris info tambahan di bawah kode · harga, mis. "Min. 12 Pcs/item" (MOQ di menu PO). */
  info?: (p: ProdukLengkap) => ReactNode;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [aktif, setAktif] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const { items: hasil, total } = useMemo(() => cariSkuLengkap(produk, q, 50), [produk, q]);

  const pilih = (p: ProdukLengkap) => {
    onPilih(p);
    setQ('');
    setAktif(0);
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-label={label}
          aria-expanded={open && q.trim().length > 0}
          aria-controls={listId}
          aria-activedescendant={hasil[aktif] ? `${listId}-${hasil[aktif].kode_sku}` : undefined}
          autoComplete="off"
          value={q}
          placeholder={placeholder}
          onChange={(e) => {
            setQ(e.target.value);
            setAktif(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setAktif((i) => Math.min(hasil.length - 1, i + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setAktif((i) => Math.max(0, i - 1));
            } else if (e.key === 'Enter' && hasil[aktif]) {
              e.preventDefault();
              pilih(hasil[aktif]);
            } else if (e.key === 'Escape') setOpen(false);
          }}
          className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-10 text-slate-900 shadow-card placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 [&::-webkit-search-cancel-button]:hidden"
        />
        {q && (
          <button type="button" aria-label="Hapus pencarian" onClick={() => setQ('')} className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
            <X size={16} />
          </button>
        )}
      </div>
      {open && q.trim() && (
        <ul id={listId} role="listbox" className="absolute inset-x-0 top-[calc(100%+4px)] z-40 max-h-[min(24rem,60vh)] overflow-auto overscroll-contain rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {hasil.length > 0 && (
            <li role="presentation" className="sticky top-0 z-10 -mt-1 border-b border-slate-100 bg-white/95 px-3 py-1.5 text-[11px] font-medium text-slate-500 backdrop-blur">
              {total.toLocaleString('id-ID')} SKU cocok
              {total > hasil.length && ` · menampilkan ${hasil.length}, ketik lebih spesifik untuk mempersempit`}
            </li>
          )}
          {hasil.length === 0 ? (
            <li className="px-4 py-3 text-sm text-slate-500">SKU tidak ditemukan. Coba kata lain, mis. sebagian nama atau kode SKU.</li>
          ) : (
            hasil.map((p, i) => {
              const sudah = terpilih?.has(p.kode_sku) ?? false;
              return (
                <li
                  key={p.kode_sku}
                  id={`${listId}-${p.kode_sku}`}
                  role="option"
                  aria-selected={i === aktif}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => !renderExtra && pilih(p)}
                  onMouseEnter={() => setAktif(i)}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 px-3 py-2.5',
                    i === aktif && 'bg-brand-50',
                    renderExtra && 'cursor-default',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-sm text-slate-900">
                      {sorotNama(p.nama_sku, q).map((b, j) =>
                        b.cocok ? (
                          <b key={j} className="font-semibold text-brand-800">
                            {b.teks}
                          </b>
                        ) : (
                          <span key={j} className="font-medium">
                            {b.teks}
                          </span>
                        ),
                      )}
                    </div>
                    <div className="truncate text-xs text-slate-500">
                      {p.kode_sku} · {p.divisi} · {formatRupiah(p.harga)}/{p.satuan}
                    </div>
                    {info?.(p)}
                  </div>
                  {renderExtra ? (
                    renderExtra(p, sudah)
                  ) : sudah ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-700">
                      <Check size={14} /> Ditambah
                    </span>
                  ) : (
                    <Plus size={18} className="shrink-0 text-brand-600" />
                  )}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
