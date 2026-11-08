import { useMemo, useRef, useState } from 'react';
import { DetailTokoView } from '../components/DetailTokoView';
import { KunjunganPanel } from '../components/KunjunganPanel';
import { DateNav, Segmented, Select, StatusTokoBadge } from '../components/ui';
import { daftarToko } from '../lib/billing';
import { formatTanggal } from '../lib/dates';
import { formatRupiah } from '../lib/format';
import { bacaWorkbook, parseSheet, pilihSheet, SKEMA, type HasilParse, type TipeData } from '../lib/parse';
import type { DataSet, StatusFaktur } from '../lib/types';
import { ringkasUpload, type RingkasanUpload } from '../lib/upload';
import { DEFAULT_DATE, formatTimestamp, useData } from '../state';

type Tab = 'upload' | 'toko' | 'rute';

export function AdminPage() {
  const [tab, setTab] = useState<Tab>('upload');
  const { resetDummy } = useData();

  return (
    <div className="mx-auto max-w-6xl px-4 pb-12 pt-4">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">Admin</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Menu admin"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'upload', label: 'Upload Data' },
              { value: 'toko', label: 'Toko & Faktur' },
              { value: 'rute', label: 'Rute Salesman' },
            ]}
          />
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Ganti semua data (Master, ROVI, PJP) dengan data dummy?')) void resetDummy();
            }}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Reset ke data dummy
          </button>
        </div>
      </header>
      {tab === 'upload' && <UploadSection />}
      {tab === 'toko' && <TokoFakturSection />}
      {tab === 'rute' && <RuteSection />}
    </div>
  );
}

// ───────────────────────── Upload ─────────────────────────

const JUDUL: Record<TipeData, string> = { master: 'Master Toko', rovi: 'Data ROVI', pjp: 'Data PJP' };

function UploadSection() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {(['master', 'rovi', 'pjp'] as const).map((t) => (
        <UploadCard key={t} tipe={t} />
      ))}
    </div>
  );
}

type Pending = { file: string; hasil: HasilParse<unknown> };

function UploadCard({ tipe }: { tipe: TipeData }) {
  const { data, updatedAt, replace } = useData();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [tolak, setTolak] = useState<string | null>(null);
  const [hasil, setHasil] = useState<RingkasanUpload | null>(null);

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
    setHasil(ringkasUpload(tipe, { ...data, [tipe]: rows }, { rupiah: formatRupiah, tanggal: formatTanggal }));
    reset();
  };

  const wajib = SKEMA[tipe].kolom.filter((k) => k.wajib).map((k) => k.nama);
  const opsional = SKEMA[tipe].kolom.filter((k) => !k.wajib).map((k) => k.nama);
  const errCount = pending?.hasil.error.length ?? 0;

  return (
    <section className="flex flex-col rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-semibold text-slate-900">{JUDUL[tipe]}</h2>
        <span className="text-xs tabular-nums text-slate-500">{data[tipe].length.toLocaleString('id-ID')} baris</span>
      </div>
      <p className="mt-0.5 text-xs text-slate-500">Data terakhir diperbarui: {formatTimestamp(updatedAt[tipe])}</p>

      <label className="mt-3 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 px-3 py-5 text-center hover:border-slate-400 hover:bg-slate-50">
        <span className="text-sm font-medium text-slate-700">Pilih file XLSX / CSV</span>
        <span className="mt-0.5 text-xs text-slate-500">Upload menggantikan seluruh {JUDUL[tipe]}</span>
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
      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        Sheet <code className="text-slate-700">{SKEMA[tipe].sheet}</code> (atau sheet pertama). Kolom wajib:{' '}
        <code className="text-slate-700">{wajib.join(', ')}</code>
        {opsional.length > 0 && (
          <>
            . Opsional: <code className="text-slate-700">{opsional.join(', ')}</code>
          </>
        )}
      </p>

      {tolak && (
        <div role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <span className="font-semibold">File ditolak.</span> {tolak}
        </div>
      )}

      {pending && (
        <div className="mt-3 rounded-lg border border-slate-200 p-3">
          <p className="text-sm text-slate-800">
            <span className="font-medium">{pending.file}</span>: {pending.hasil.valid.length.toLocaleString('id-ID')} baris valid
            {errCount > 0 && <span className="text-red-700">, {errCount} baris error</span>}
          </p>
          {errCount > 0 && (
            <div className="mt-2 max-h-48 overflow-auto rounded border border-red-100">
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
                      <td className="px-2 py-1 align-top tabular-nums text-slate-700">{e.baris}</td>
                      <td className="px-2 py-1 text-slate-700">{e.alasan}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {errCount > 200 && <p className="px-2 py-1 text-xs text-slate-500">… dan {errCount - 200} error lain</p>}
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={simpan}
              disabled={!pending.hasil.valid.length}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            >
              {errCount ? 'Simpan baris valid saja' : 'Simpan & ganti data'}
            </button>
            <button type="button" onClick={reset} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700">
              Batal
            </button>
          </div>
        </div>
      )}

      {hasil && (
        <div className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm">
          <p className="font-semibold text-emerald-800">Upload berhasil</p>
          <dl className="mt-1 space-y-0.5">
            {hasil.baris.map((b) => (
              <div key={b.label} className="flex justify-between gap-2">
                <dt className="text-emerald-900/70">{b.label}</dt>
                <dd className="font-medium tabular-nums text-emerald-900">{b.nilai}</dd>
              </div>
            ))}
          </dl>
          {hasil.warning.map((w) => (
            <p key={w} className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
              ⚠ {w}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

// ───────────────────────── Toko & Faktur ─────────────────────────

const PILIHAN_STATUS: { value: '' | StatusFaktur; label: string }[] = [
  { value: '', label: 'Semua status' },
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'JATUH_TEMPO_HARI_INI', label: 'Jatuh Tempo Hari Ini' },
  { value: 'BELUM_JATUH_TEMPO', label: 'Belum Jatuh Tempo' },
];

function TokoFakturSection() {
  const { data, salesmen } = useData();
  const [D, setD] = useState(DEFAULT_DATE);
  const [status, setStatus] = useState<'' | StatusFaktur>('');
  const [sales, setSales] = useState('');
  const [cari, setCari] = useState('');
  const [dipilih, setDipilih] = useState<string | null>(null);

  const rows = useMemo(
    () => daftarToko(data, D, { status: status || undefined, kodeSalesman: sales || undefined, cari }),
    [data, D, status, sales, cari],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <section className="min-w-0 rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          <div className="w-64">
            <DateNav value={D} onChange={setD} />
          </div>
          <Select label="Filter status" value={status} onChange={(v) => setStatus(v as '' | StatusFaktur)}>
            {PILIHAN_STATUS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
          <Select label="Filter salesman" value={sales} onChange={setSales}>
            <option value="">Semua salesman</option>
            {salesmen.map((s) => (
              <option key={s.kode} value={s.kode}>
                {s.nama} ({s.kode})
              </option>
            ))}
          </Select>
          <input
            type="search"
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            placeholder="Cari kode / nama toko"
            aria-label="Cari kode atau nama toko"
            className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm"
          />
        </div>
        <p className="px-3 pt-2 text-xs text-slate-500">
          {rows.length.toLocaleString('id-ID')} toko · status relatif terhadap {formatTanggal(D)}
        </p>
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white text-left text-xs text-slate-500 shadow-[0_1px_0_theme(colors.slate.200)]">
              <tr>
                <th className="px-3 py-2 font-medium">Kode</th>
                <th className="px-3 py-2 font-medium">Nama toko</th>
                <th className="px-3 py-2 font-medium">Salesman</th>
                <th className="px-3 py-2 text-right font-medium">Faktur aktif</th>
                <th className="px-3 py-2 text-right font-medium">Outstanding</th>
                <th className="px-3 py-2 text-right font-medium">Overdue</th>
                <th className="px-3 py-2 text-right font-medium">Tertua (hari)</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr
                  key={r.kode_toko}
                  onClick={() => setDipilih(r.kode_toko)}
                  className={`cursor-pointer hover:bg-slate-50 ${dipilih === r.kode_toko ? 'bg-slate-100' : ''}`}
                >
                  <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs">{r.kode_toko}</td>
                  <td className="px-3 py-1.5">{r.nama_toko}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-slate-600">{r.nama_salesman || '–'}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{r.jumlahFakturAktif}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{formatRupiah(r.totalOutstanding)}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{r.totalOverdue ? formatRupiah(r.totalOverdue) : '–'}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{r.maxHariOverdue || '–'}</td>
                  <td className="px-3 py-1.5">
                    <StatusTokoBadge status={r.status} label={r.statusLabel} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <p className="py-10 text-center text-sm text-slate-500">Tidak ada toko yang cocok dengan filter.</p>}
        </div>
      </section>
      <aside className="rounded-xl border border-slate-200 bg-slate-50 p-4 lg:sticky lg:top-16 lg:self-start">
        {dipilih ? (
          <DetailTokoView kodeToko={dipilih} D={D} onBack={() => setDipilih(null)} />
        ) : (
          <p className="py-10 text-center text-sm text-slate-500">Klik toko untuk melihat detail faktur.</p>
        )}
      </aside>
    </div>
  );
}

// ───────────────────────── Rute Salesman ─────────────────────────

function RuteSection() {
  const { salesmen } = useData();
  const [kode, setKode] = useState(salesmen[0]?.kode ?? '');
  const [D, setD] = useState(DEFAULT_DATE);

  return (
    <div className="mx-auto max-w-md space-y-3">
      <Select label="Pilih salesman" value={kode} onChange={setKode} className="w-full">
        {salesmen.map((s) => (
          <option key={s.kode} value={s.kode}>
            {s.nama} ({s.kode})
          </option>
        ))}
      </Select>
      <DateNav value={D} onChange={setD} />
      {kode ? <KunjunganPanel key={kode} kodeSalesman={kode} D={D} /> : <p className="text-sm text-slate-500">Belum ada data salesman.</p>}
    </div>
  );
}
