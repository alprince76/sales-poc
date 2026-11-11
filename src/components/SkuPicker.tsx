import { Check, Plus, Search, X } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { formatRupiah } from '../lib/format';
import type { ProdukLengkap } from '../lib/order';
import { cariSku } from '../lib/sku-search';
import { cn } from './ui';

/**
 * Combobox pilih SKU: ketik kode SAP atau nama → daftar saran → klik / Enter untuk menambah.
 * Dipakai di Cek Stok (GT), Input PO (GT & MT).
 */
export function SkuPicker({
  produk,
  onPilih,
  terpilih,
  placeholder = 'Cari kode SAP atau nama SKU',
  label = 'Cari SKU',
}: {
  produk: readonly ProdukLengkap[];
  onPilih: (p: ProdukLengkap) => void;
  /** Kode SKU yang sudah ada di daftar (ditandai ✓). */
  terpilih?: ReadonlySet<string>;
  placeholder?: string;
  label?: string;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [aktif, setAktif] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const hasil = cariSku(produk, q, 8);

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
        <ul id={listId} role="listbox" className="absolute inset-x-0 top-[calc(100%+4px)] z-40 max-h-80 overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {hasil.length === 0 ? (
            <li className="px-4 py-3 text-sm text-slate-500">SKU tidak ditemukan</li>
          ) : (
            hasil.map((p, i) => {
              const sudah = terpilih?.has(p.kode_sku);
              return (
                <li
                  key={p.kode_sku}
                  id={`${listId}-${p.kode_sku}`}
                  role="option"
                  aria-selected={i === aktif}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pilih(p)}
                  onMouseEnter={() => setAktif(i)}
                  className={cn('flex cursor-pointer items-center gap-3 px-3 py-2.5', i === aktif && 'bg-brand-50')}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-900">{p.nama_sku}</div>
                    <div className="truncate text-xs text-slate-500">
                      SAP {p.kode_sku} · {p.divisi} · {formatRupiah(p.harga)}/{p.satuan}
                    </div>
                  </div>
                  {sudah ? (
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
