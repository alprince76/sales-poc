import { Cloud, CloudOff, DatabaseZap, FileSpreadsheet, RefreshCw, RotateCcw, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Badge, Button, Card, useToast } from '../../components/ui';
import { formatTanggal } from '../../lib/dates';
import { formatRupiah } from '../../lib/format';
import { bacaWorkbook, parseSheet, pilihSheet, SEMUA_TIPE, SKEMA, type HasilParse } from '../../lib/parse';
import { RemoteError } from '../../lib/remote';
import type { DataSet, Kunjungan, MasterToko } from '../../lib/types';
import { gabungMaster, gabungPjp, hitungSegmen, ringkasUpload, type RingkasanUpload } from '../../lib/upload';
import { formatTimestamp, INTERVAL_SINKRON, useData } from '../../state';
import { AdminPage } from './AdminLayout';
import { JENIS_DATA, type JenisData } from '../../lib/jenisData';

type Kartu = JenisData;

export function DataPage() {
  const { resetDummy, resetAktivitas, aktivitas, storageWarning, koneksi, sinkron } = useData();
  const toast = useToast();
  const jumlahAkt = aktivitas.penagihan.length + aktivitas.po.length + aktivitas.stok.length + aktivitas.kunjungan.length;
  const [cek, setCek] = useState(false);
  return (
    <AdminPage
      title="Data & Upload"
      description="Upload XLSX/CSV per jenis data. Setelah disimpan, data langsung dipakai aplikasi sales di semua perangkat."
      actions={
        <>
          <Button
            variant="secondary"
            onClick={() => {
              if (window.confirm(`Hapus semua aktivitas SR (${jumlahAkt} catatan penagihan, stok, PO, kunjungan) di browser ini?`)) {
                resetAktivitas();
                toast('Aktivitas dihapus', 'info');
              }
            }}
          >
            <Trash2 size={16} /> Reset aktivitas
          </Button>
          <Button
            variant="secondary"
            onClick={async () => {
              const server = koneksi === 'server';
              const ok = window.confirm(
                server
                  ? 'Hapus SEMUA data upload di server dan kembali ke data dummy? Semua perangkat sales ikut kembali ke dummy.'
                  : 'Ganti semua data master di browser ini dengan data dummy?',
              );
              if (!ok) return;
              try {
                await resetDummy();
                toast('Data dummy dimuat', 'info');
              } catch (e) {
                toast(`Gagal reset: ${e instanceof Error ? e.message : String(e)}`, 'error');
              }
            }}
          >
            <RotateCcw size={16} /> Reset ke data dummy
          </Button>
        </>
      }
    >
      <StatusServer
        cek={cek}
        onCek={async () => {
          setCek(true);
          await sinkron();
          setCek(false);
        }}
      />
      {storageWarning && (
        <div role="alert" className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Sebagian data terlalu besar untuk cache browser. Data tetap dipakai; saat dimuat ulang akan diunduh lagi dari server.
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {JENIS_DATA.map((k) => (
          <UploadCard key={k.id} kartu={k} />
        ))}
      </div>
    </AdminPage>
  );
}

function StatusServer({ cek, onCek }: { cek: boolean; onCek: () => void }) {
  const { koneksi, infoKoneksi } = useData();
  if (koneksi === 'cek') return null;
  if (koneksi === 'lokal')
    return (
      <div role="status" className="mb-4 flex items-start gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <CloudOff size={18} className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="font-semibold">Mode lokal — upload hanya tersimpan di browser ini</p>
          <p className="mt-0.5 text-amber-800">
            Server data tidak terjangkau{infoKoneksi ? ` (${infoKoneksi})` : ''}. Perangkat sales tidak ikut ter-update sampai server aktif. Lokal: isi DATABASE_URL di .env lalu jalankan ulang npm run dev. Netlify: lihat docs/SETUP_NEON.md.
          </p>
        </div>
      </div>
    );
  return (
    <div role="status" className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
      <Cloud size={18} className="shrink-0" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">Tersambung ke database.</span> Upload & edit di Master Data langsung tersimpan; aplikasi sales mengecek pembaruan tiap {INTERVAL_SINKRON / 1000} detik & saat dibuka.
      </p>
      <Button size="sm" variant="secondary" onClick={onCek} disabled={cek}>
        <RefreshCw size={14} className={cek ? 'animate-spin' : ''} /> Cek pembaruan
      </Button>
      <SeedServer />
    </div>
  );
}

/** Isi server dengan data yang sedang tampil (dummy/lokal) untuk jenis yang belum ada di server. */
function SeedServer() {
  const { raw, sumber, replace } = useData();
  const toast = useToast();
  const [jalan, setJalan] = useState(false);
  const kosong = SEMUA_TIPE.filter((t) => sumber[t] !== 'server');
  if (!kosong.length) return null;
  const seed = async () => {
    if (!window.confirm(`Isi server dengan data saat ini (dummy/lokal) untuk ${kosong.length} jenis data yang belum ada di server?\n\n${kosong.join(', ')}`)) return;
    setJalan(true);
    let ok = 0;
    const gagal: string[] = [];
    try {
      for (const t of kosong) {
        try {
          await replace(t, raw[t], { hanyaBilaKosong: true });
          ok++;
        } catch (e) {
          // 409 = sudah diisi admin lain → biarkan versi server.
          if (!(e instanceof RemoteError && e.status === 409)) gagal.push(`${t}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    } finally {
      setJalan(false);
    }
    toast(gagal.length ? `Seed ${ok} jenis, gagal: ${gagal.join('; ')}` : `Seed selesai: ${ok} jenis data tersimpan di server`, gagal.length ? 'error' : 'success');
  };
  return (
    <Button size="sm" onClick={() => void seed()} disabled={jalan}>
      <DatabaseZap size={14} /> {jalan ? 'Mengisi server…' : `Seed server (${kosong.length} jenis)`}
    </Button>
  );
}

type Pending = { file: string; hasil: HasilParse<unknown> };

function UploadCard({ kartu }: { kartu: Kartu }) {
  const { tipe, channel } = kartu;
  const { data, raw, updatedAt, sumber, versi, replace } = useData();
  const [menyimpan, setMenyimpan] = useState(false);
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

  const simpan = async () => {
    if (!pending) return;
    const valid = pending.hasil.valid;
    let rows = valid as DataSet[typeof tipe];
    const catatan: string[] = [];
    if (tipe === 'master' && channel) {
      const g = gabungMaster(raw.master, valid as MasterToko[], channel);
      rows = g.rows as DataSet[typeof tipe];
      if (g.dipaksa) catatan.push(`${g.dipaksa} baris ber-channel lain disimpan sebagai ${channel}.`);
    } else if (tipe === 'pjp' && channel) {
      const g = gabungPjp(raw.pjp, valid as Kunjungan[], channel, raw.master);
      rows = g.rows as DataSet[typeof tipe];
      if (g.diLuar) catatan.push(`${g.diLuar} kunjungan ke toko yang bukan Store ${channel} di Master (tetap disimpan).`);
    }
    setMenyimpan(true);
    try {
      const mode = await replace(tipe, rows);
      const r = ringkasUpload(tipe, { ...raw, [tipe]: rows }, { rupiah: formatRupiah, tanggal: formatTanggal });
      setHasil({ ...r, warning: [...catatan, ...r.warning, ...(mode === 'lokal' ? ['Mode lokal: data hanya tersimpan di browser ini, perangkat sales belum ter-update.'] : [])] });
      toast(mode === 'server' ? `${kartu.nama} disimpan ke database` : `${kartu.nama} disimpan (lokal)`);
      reset();
    } catch (e) {
      setTolak(`Gagal menyimpan ke database: ${e instanceof Error ? e.message : String(e)}. Data belum berubah.`);
    } finally {
      setMenyimpan(false);
    }
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
            <h2 className="font-semibold text-slate-900">{kartu.nama}</h2>
            <p className="text-xs text-slate-500">{kartu.desc}</p>
          </div>
        </div>
        <Badge tone={sumber[tipe] === 'server' ? 'green' : sumber[tipe] === 'lokal' ? 'orange' : 'gray'}>
          {sumber[tipe] === 'server' ? `Server · v${versi[tipe]}` : sumber[tipe] === 'lokal' ? 'Lokal' : 'Dummy'}
        </Badge>
      </div>
      <div className="mt-3 flex items-baseline justify-between text-xs text-slate-500">
        <span>
          <span className="font-semibold tabular text-slate-800">{(tipe === 'master' || tipe === 'pjp') && channel ? hitungSegmen(data, tipe, channel).toLocaleString('id-ID') : data[tipe].length.toLocaleString('id-ID')}</span> baris
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
            <Button size="sm" onClick={() => void simpan()} disabled={!pending.hasil.valid.length || menyimpan}>
              {menyimpan ? 'Menyimpan…' : errCount ? 'Simpan baris valid saja' : channel ? `Simpan & ganti data ${channel}` : 'Simpan & ganti data'}
            </Button>
            <Button size="sm" variant="secondary" onClick={reset} disabled={menyimpan}>
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
