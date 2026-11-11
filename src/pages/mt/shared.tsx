import { AlertTriangle, CheckCircle2, Plus } from 'lucide-react';
import { useMemo } from 'react';
import { Badge, cn, NumberStepper } from '../../components/ui';
import { normKode } from '../../lib/billing';
import type { ISODate } from '../../lib/dates';
import { formatRupiah } from '../../lib/format';
import { compliance, daftarSkuMSL, labelWarning, teksTerakhirOrder, type SkuMSL } from '../../lib/msl';
import { bulatkanQty, historiToko, suggestedQty, validasiQty } from '../../lib/order';
import { useData } from '../../state';

/**
 * Daftar SKU MSL satu toko di tanggal D. Dinamis: PO yang sudah disubmit + keranjang PO yang sedang dibuat
 * (SKU di keranjang = akan ditransaksikan → warning hilang; `warningAwal` menyimpan kondisi sebelum PO).
 */
export function useMslToko(kodeToko: string, D: ISODate, pakaiKeranjang = true): SkuMSL[] {
  const { produk, mslIdx, trxIdx, keranjang } = useData();
  const k = pakaiKeranjang ? keranjang[kodeToko] : undefined;
  return useMemo(() => daftarSkuMSL({ produk, mslIdx, trxIdx }, kodeToko, D, k ?? {}), [produk, mslIdx, trxIdx, kodeToko, D, k]);
}

export interface BarisRuteMT {
  kode_toko: string;
  nama_toko: string;
  area: string;
  urutan: number | null;
  warning: number;
  listed: number;
  persen: number;
  keranjang: number;
  poHariIni: number;
}

/** Rute PJP SR MT pada D + ringkasan MSL per toko. */
export function useRuteMT(sales: string, D: ISODate, urutan: 'prioritas' | 'rute' = 'prioritas'): BarisRuteMT[] {
  const { data, produk, mslIdx, trxIdx, masterIdx, keranjang, aktivitas } = useData();
  return useMemo(() => {
    const sa = normKode(sales);
    const rows = data.pjp
      .filter((p) => normKode(p.kode_salesman) === sa && p.tanggal_kunjungan === D)
      .map((p) => {
        const kode = normKode(p.kode_toko);
        const c = compliance(daftarSkuMSL({ produk, mslIdx, trxIdx }, kode, D, keranjang[kode] ?? {}));
        const m = masterIdx.get(kode);
        return {
          kode_toko: kode,
          nama_toko: m?.nama_toko || p.nama_toko || kode,
          area: m?.area ?? '',
          urutan: typeof p.urutan === 'number' ? p.urutan : null,
          warning: c.warning,
          listed: c.listed,
          persen: c.persen,
          keranjang: Object.keys(keranjang[kode] ?? {}).length,
          poHariIni: aktivitas.po.filter((x) => x.kode_toko === kode && x.tanggal === D).length,
        };
      });
    const rute = (a: BarisRuteMT, b: BarisRuteMT) => (a.urutan ?? 1e9) - (b.urutan ?? 1e9) || a.kode_toko.localeCompare(b.kode_toko);
    return rows.sort(urutan === 'rute' ? rute : (a, b) => b.warning - a.warning || rute(a, b));
  }, [data.pjp, produk, mslIdx, trxIdx, masterIdx, keranjang, aktivitas.po, sales, D, urutan]);
}

export function WarningBadge({ s }: { s: Pick<SkuMSL, 'warning'> }) {
  if (!s.warning) return null;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white">
      <AlertTriangle size={12} strokeWidth={2.5} /> {labelWarning(s.warning)}
    </span>
  );
}

/** Satu baris SKU: info + warning + Add to PO (atau stepper bila sudah di keranjang). */
export function SkuRow({ s, kodeToko, D }: { s: SkuMSL; kodeToko: string; D: ISODate }) {
  const { keranjang, setQtyKeranjang, data } = useData();
  const qty = keranjang[kodeToko]?.[s.kode_sku] ?? 0;
  const err = qty ? validasiQty(qty, s) : null;
  const tambah = () => {
    const h = historiToko(data.histori, kodeToko, D).find((x) => x.kode_sku === s.kode_sku);
    const saran = suggestedQty(h, s).qty;
    setQtyKeranjang(kodeToko, s.kode_sku, saran || bulatkanQty(s.moq, s));
  };
  return (
    <li className={cn('rounded-2xl border bg-white p-3 shadow-card', s.warning ? 'border-red-200 ring-1 ring-red-100' : s.diPO ? 'border-emerald-200' : 'border-slate-200/80')}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {s.warning ? (
            <div className="mb-1.5">
              <WarningBadge s={s} />
            </div>
          ) : (
            s.diPO &&
            s.warningAwal && (
              <div className="mb-1.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                  <CheckCircle2 size={12} strokeWidth={2.5} /> Masuk PO · warning teratasi
                </span>
              </div>
            )
          )}
          <div className="text-sm font-semibold leading-snug text-slate-900">{s.nama_sku}</div>
          <div className="mt-0.5 text-xs text-slate-500">
            SAP {s.kode_sku} · {s.kategori ?? s.divisi} · <span className="font-medium tabular text-slate-700">{formatRupiah(s.harga)}</span>/{s.satuan}
          </div>
          {s.warningAwal !== 'BELUM_PERNAH' && <div className={cn('mt-1 text-xs', s.warning ? 'font-medium text-red-700' : 'text-slate-500')}>{teksTerakhirOrder(s)}</div>}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {s.listed ? <Badge tone="brand" dot={false}>Listed MSL</Badge> : <Badge tone="gray" dot={false}>Tidak listed</Badge>}
            <Badge tone="gray" dot={false}>
              Min. {s.moq} {s.satuan}
              {s.kelipatan > 1 ? ` · kelipatan ${s.kelipatan}` : ''}
            </Badge>
          </div>
        </div>
        <div className="shrink-0 self-center">
          {qty > 0 ? (
            <NumberStepper
              label={`qty ${s.nama_sku}`}
              value={qty}
              step={s.kelipatan}
              onIncrementFromZero={s.moq}
              invalid={!!err}
              onChange={(n) => setQtyKeranjang(kodeToko, s.kode_sku, n)}
            />
          ) : (
            <button
              type="button"
              onClick={tambah}
              aria-label={`Add to PO ${s.nama_sku}`}
              className={cn(
                'flex h-11 items-center gap-1 rounded-xl px-3 text-sm font-semibold transition-colors active:scale-[0.97]',
                s.warning ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-brand-50 text-brand-700 hover:bg-brand-100',
              )}
            >
              <Plus size={16} strokeWidth={2.5} /> PO
            </button>
          )}
        </div>
      </div>
      {err && (
        <p role="alert" className="mt-2 flex items-start gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700">
          <AlertTriangle size={14} className="mt-px shrink-0" /> {err}
        </p>
      )}
    </li>
  );
}
