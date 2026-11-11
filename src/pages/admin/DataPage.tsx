import { FileSpreadsheet, RotateCcw, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Badge, Button, Card, useToast } from '../../components/ui';
import { formatTanggal } from '../../lib/dates';
import { formatRupiah } from '../../lib/format';
import { bacaWorkbook, parseSheet, pilihSheet, SEMUA_TIPE, SKEMA, type HasilParse, type TipeData } from '../../lib/parse';
import type { DataSet } from '../../lib/types';
import { ringkasUpload, type RingkasanUpload } from '../../lib/upload';
import { formatTimestamp, useData } from '../../state';
import { AdminPage } from './AdminLayout';

const JUDUL: Record<TipeData, { nama: string; desc: string }> = {
  master: { nama: 'Master Outlet', desc: 'Toko, salesman, channel GT/MT, alamat, tipe, limit kredit, blokir' },
  rovi: { nama: 'ROVI (AR)', desc: 'Faktur & sisa tagihan per toko' },
  pjp: { nama: 'PJP', desc: 'Jadwal kunjungan salesman per tanggal' },
  produk: { nama: 'Master Produk', desc: 'SKU, divisi (principal), kategori, price list, status aktif' },
  rules: { nama: 'Order Rules', desc: 'Satuan, MOQ, kelipatan order per SKU' },
  histori: { nama: 'Historical Sales', desc: 'Pembelian toko per SKU (suggested order & last order date MSL)' },
  msl: { nama: 'MSL (Toko – SKU Listing)', desc: 'SKU yang wajib ada di toko MT (status_listed YES/NO)' },
};

export function DataPage() {
  const { resetDummy, resetAktivitas, aktivitas, storageWarning } = useData();
  const toast = useToast();
  const jumlahAkt = aktivitas.penagihan.length + aktivitas.po.length + aktivitas.stok.length + aktivitas.kunjungan.length;
  return (
    <AdminPage
      title="Data & Upload"
      description="Upload XLSX/CSV per jenis data. Upload menggantikan seluruh data jenis tersebut."
      actions={
        <>
          <Button
            variant="secondary"
            onClick={() => {
              if (window.confirm(`Hapus semua aktivitas SR (${jumlahAkt} catatan penagihan, stok, PO, kunjungan)?`)) {
                resetAktivitas();
                toast('Aktivitas dihapus', 'info');
              }
            }}
          >
            <Trash2 size={16} /> Reset aktivitas
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              if (window.confirm('Ganti semua data master dengan data dummy?')) void resetDummy().then(() => toast('Data dummy dimuat', 'info'));
            }}
          >
            <RotateCcw size={16} /> Reset ke data dummy
          </Button>
        </>
      }
    >
      {storageWarning && (
        <div role="alert" className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Sebagian data upload terlalu besar untuk penyimpanan browser. Data tetap dipakai, tapi akan hilang saat halaman dimuat ulang.
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {SEMUA_TIPE.map((t) => (
          <UploadCard key={t} tipe={t} />
        ))}
      </div>
    </AdminPage>
  );
}

type Pending = { file: string; hasil: HasilParse<unknown> };

function UploadCard({ tipe }: { tipe: TipeData }) {
  const { data, raw, updatedAt, sumber, replace } = useData();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [tolak, setTolak] = useState<string | null>(null);
  const [hasil, setHasil] = useState<RingkasanUpload | null>(null);
  const [drag, setDrag] = useState(false);

  const reset = () => {
    setPending(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const onFile = async (file: File) => {
    setTolak(null);
    setHasil(null);
    setPending(null);
    try {
      const wb = bacaWorkbook(new Uint8Array(await file.arrayBuffer()));
      const ws = pilihSheet(wb, tipe);
      if (!ws) throw new Error('File tidak berisi sheet.');
      const h = parseSheet(tipe, ws);
      if (h.kolomHilang.length) {
        setTolak(`Kolom wajib tidak ditemukan: ${h.kolomHilang.join(', ')}`);
        reset();
        return;
      }
      if (!h.totalBaris) {
        setTolak('File tidak berisi baris data.');
        reset();
        return;
      }
      setPending({ file: file.name, hasil: h });
    } catch (e) {
      setTolak(`File tidak bisa dibaca: ${e instanceof Error ? e.message : String(e)}`);
      reset();
    }
  };

  const simpan = () => {
    if (!pending) return;
    const rows = pending.hasil.valid as DataSet[typeof tipe];
    replace(tipe, rows);
    setHasil(ringkasUpload(tipe, { ...raw, [tipe]: rows }, { rupiah: formatRupiah, tanggal: formatTanggal }));
    toast(`${JUDUL[tipe].nama} diperbarui`);
    reset();
  };

  const wajib = SKEMA[tipe].kolom.filter((k) => k.wajib).map((k) => k.nama);
  const opsional = SKEMA[tipe].kolom.filter((k) => !k.wajib).map((k) => k.nama);
  const errCount = pending?.hasil.error.length ?? 0;

  return (
    <Card as="section" className="flex flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            <FileSpreadsheet size={18} />
          </span>
          <div>
            <h2 className="font-semibold text-slate-900">{JUDUL[tipe].nama}</h2>
            <p className="text-xs text-slate-500">{JUDUL[tipe].desc}</p>
          </div>
        </div>
        <Badge tone={sumber[tipe] === 'upload' ? 'green' : 'gray'}>{sumber[tipe] === 'upload' ? 'Upload' : 'Dummy'}</Badge>
      </div>
      <div className="mt-3 flex items-baseline justify-between text-xs text-slate-500">
        <span>
          <span className="font-semibold tabular text-slate-800">{data[tipe].length.toLocaleString('id-ID')}</span> baris
        </span>
        <span>Diperbarui {formatTimestamp(updatedAt[tipe])}</span>
      </div>

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void onFile(f);
        }}
        className={`mt-3 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-3 py-5 text-center transition-colors ${drag ? 'border-brand-500 bg-brand-50' : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'}`}
      >
        <Upload size={18} className="mb-1 text-slate-400" />
        <span className="text-sm font-medium text-slate-700">Tarik file ke sini atau pilih file</span>
        <span className="mt-0.5 text-xs text-slate-500">XLSX / CSV · sheet “{SKEMA[tipe].sheet}” atau sheet pertama</span>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
          }}
        />
      </label>
      <details className="mt-2 text-xs text-slate-500">
        <summary className="cursor-pointer select-none">Format kolom</summary>
        <p className="mt-1 leading-relaxed">
          Wajib: <code className="text-slate-700">{wajib.join(', ')}</code>
          {opsional.length > 0 && (
            <>
              <br />
              Opsional: <code className="text-slate-700">{opsional.join(', ')}</code>
            </>
          )}
        </p>
      </details>

      {tolak && (
        <div role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          <span className="font-semibold">File ditolak.</span> {tolak}
        </div>
      )}

      {pending && (
        <div className="mt-3 rounded-xl border border-slate-200 p-3">
          <p className="text-sm text-slate-800">
            <span className="font-medium">{pending.file}</span>: {pending.hasil.valid.length.toLocaleString('id-ID')} baris valid
            {errCount > 0 && <span className="text-red-700">, {errCount} baris error</span>}
          </p>
          {errCount > 0 && (
            <div className="mt-2 max-h-48 overflow-auto rounded-lg border border-red-100">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-red-50 text-left text-red-800">
                  <tr>
                    <th className="px-2 py-1 font-medium">Baris</th>
                    <th className="px-2 py-1 font-medium">Alasan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-red-50">
                  {pending.hasil.error.slice(0, 200).map((e) => (
                    <tr key={e.baris}>
                      <td className="px-2 py-1 align-top tabular text-slate-700">{e.baris}</td>
                      <td className="px-2 py-1 text-slate-700">{e.alasan}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {errCount > 200 && <p className="px-2 py-1 text-xs text-slate-500">… dan {errCount - 200} error lain</p>}
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={simpan} disabled={!pending.hasil.valid.length}>
              {errCount ? 'Simpan baris valid saja' : 'Simpan & ganti data'}
            </Button>
            <Button size="sm" variant="secondary" onClick={reset}>
              Batal
            </Button>
          </div>
        </div>
      )}

      {hasil && (
        <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm">
          <p className="font-semibold text-emerald-800">Upload berhasil</p>
          <dl className="mt-1 space-y-0.5">
            {hasil.baris.map((b) => (
              <div key={b.label} className="flex justify-between gap-2">
                <dt className="text-emerald-900/70">{b.label}</dt>
                <dd className="text-right font-medium tabular text-emerald-900">{b.nilai}</dd>
              </div>
            ))}
          </dl>
          {hasil.warning.map((w) => (
            <p key={w} className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-800">
              ⚠ {w}
            </p>
          ))}
        </div>
      )}
    </Card>
  );
}
