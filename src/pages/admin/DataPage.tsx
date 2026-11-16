import { Cloud, CloudOff, DatabaseZap, Download, FileSpreadsheet, RefreshCw, RotateCcw, Trash2, Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Badge, Button, Card, Input, Select, useToast } from '../../components/ui';
import { formatTanggal } from '../../lib/dates';
import { formatRupiah } from '../../lib/format';
import { analisaSheet, bacaWorkbook, buatWorkbook, deteksiKolom, labelKolom, parseAnalisa, pilihSheet, ringkasError, SEMUA_TIPE, SKEMA, workbookError, type AnalisaSheet, type PetaKolom, type TipeData, type ErrorBaris } from '../../lib/parse';
import { cekJenisFile, pesanBacaFile, pesanGagal, teksGagal, type PesanGagal } from '../../lib/pesan';
import { RemoteError } from '../../lib/remote';
import type { DataSet, Kunjungan, MasterToko } from '../../lib/types';
import { gabungMaster, gabungPjp, gabungUpsert, hitungSegmen, ringkasUpload, type RingkasanUpload } from '../../lib/upload';
import { skuTanpaMoq } from '../../lib/order';
import { formatTimestamp, INTERVAL_AKTIVITAS, INTERVAL_SINKRON, useData } from '../../state';
import { AdminPage } from './AdminLayout';
import { indeksJenis, JENIS_DATA, type JenisData } from '../../lib/jenisData';
import { useIzin } from '../../auth';

type Kartu = JenisData;

export function DataPage() {
  const { resetDummy, resetAktivitas, aktivitas, storageWarning, koneksi, sinkron } = useData();
  const izinData = useIzin('data.upload');
  const toast = useToast();
  const jumlahAkt = aktivitas.penagihan.length + aktivitas.po.length + aktivitas.stok.length + aktivitas.kunjungan.length;
  const [cek, setCek] = useState(false);
  return (
    <AdminPage
      title="Data & Upload"
      description="Upload XLSX/CSV per jenis data. Default tambah & perbarui: data lama tetap, baris dengan kunci sama (mis. kode SKU) diperbarui. Setelah disimpan langsung dipakai aplikasi sales di semua perangkat."
      actions={
        izinData.hapus ? (
        <>
          <Button
            variant="secondary"
            onClick={async () => {
              const server = koneksi === 'server';
              const ok = window.confirm(
                server
                  ? `Hapus SEMUA aktivitas sales (${jumlahAkt} catatan PO, penagihan, cek stok, kunjungan) di database? Semua perangkat ikut terhapus dan tidak bisa dikembalikan.`
                  : `Hapus semua aktivitas sales (${jumlahAkt} catatan) di browser ini?`,
              );
              if (!ok) return;
              try {
                const mode = await resetAktivitas();
                toast(mode === 'server' ? 'Aktivitas dihapus di semua perangkat' : 'Aktivitas dihapus di browser ini', 'info');
              } catch (e) {
                toast(teksGagal(e, 'reset'), 'error');
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
                toast(teksGagal(e, 'reset'), 'error');
              }
            }}
          >
            <RotateCcw size={16} /> Reset ke data dummy
          </Button>
        </>
        ) : undefined
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
  const izinTambah = useIzin('data.upload').tambah;
  const { koneksi, infoKoneksi } = useData();
  if (koneksi === 'cek') return null;
  if (koneksi === 'lokal')
    return (
      <div role="status" className="mb-4 flex items-start gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <CloudOff size={18} className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="font-semibold">Belum tersambung ke database</p>
          <p className="mt-0.5 text-amber-800">
            Upload dan edit saat ini hanya tersimpan di browser ini dan belum sampai ke HP sales. Cek koneksi internet lalu klik <b>Cek pembaruan</b>. Bila tetap begini, hubungi tim teknis.
          </p>
          <details className="mt-1 text-xs text-amber-700/80">
            <summary className="cursor-pointer select-none">Detail untuk tim teknis</summary>
            <p className="mt-1">
              {infoKoneksi ? `${infoKoneksi}. ` : ''}Lokal: isi DATABASE_URL di .env lalu jalankan ulang npm run dev. Netlify: cek env DATABASE_URL dan /api/data/meta (docs/SETUP_NEON.md).
            </p>
          </details>
        </div>
      </div>
    );
  return (
    <div role="status" className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
      <Cloud size={18} className="shrink-0" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">Tersambung ke database.</span> Upload & edit Master Data langsung tersimpan. PO, penagihan, cek stok & kunjungan dari semua HP sales masuk otomatis (±{INTERVAL_AKTIVITAS / 1000} detik); master data dicek tiap {INTERVAL_SINKRON / 1000} detik.
      </p>
      <Button size="sm" variant="secondary" onClick={onCek} disabled={cek}>
        <RefreshCw size={14} className={cek ? 'animate-spin' : ''} /> Cek pembaruan
      </Button>
      {izinTambah && <SeedServer />}
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
          if (!(e instanceof RemoteError && e.status === 409)) gagal.push(`${JENIS_DATA.find((j) => j.tipe === t)?.menu ?? t}: ${pesanGagal(e, 'seed').judul.replace(/^Isi data awal gagal: /, '')}`);
        }
      }
    } finally {
      setJalan(false);
    }
    toast(gagal.length ? `${ok} jenis data berhasil diisi. Gagal: ${gagal.join('; ')}. Klik Seed server lagi untuk mencoba ulang.` : `Seed selesai: ${ok} jenis data tersimpan di server`, gagal.length ? 'error' : 'success');
  };
  return (
    <Button size="sm" onClick={() => void seed()} disabled={jalan}>
      <DatabaseZap size={14} /> {jalan ? 'Mengisi server…' : `Seed server (${kosong.length} jenis)`}
    </Button>
  );
}

type Berkas = { file: string; a: AnalisaSheet };

const kunciPeta = (id: string) => `sv-peta-kolom:${id}`;
function bacaPeta(id: string): PetaKolom {
  try {
    return JSON.parse(localStorage.getItem(kunciPeta(id)) ?? '{}') as PetaKolom;
  } catch {
    return {};
  }
}
function simpanPeta(id: string, peta: PetaKolom) {
  try {
    if (Object.keys(peta).length) localStorage.setItem(kunciPeta(id), JSON.stringify(peta));
    else localStorage.removeItem(kunciPeta(id));
  } catch {
    /* abaikan */
  }
}

const namaFile = (s: string) => s.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');

function UploadCard({ kartu }: { kartu: Kartu }) {
  const { tipe, channel } = kartu;
  const { data, raw, updatedAt, sumber, versi, replace } = useData();
  const izinUpload = useIzin('data.upload').tambah;
  const [menyimpan, setMenyimpan] = useState(false);
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [berkas, setBerkas] = useState<Berkas | null>(null);
  const [peta, setPeta] = useState<PetaKolom>(() => bacaPeta(kartu.id));
  const [bukaPeta, setBukaPeta] = useState(false);
  const [gantiSemua, setGantiSemua] = useState(false);
  const [tolak, setTolak] = useState<PesanGagal | null>(null);
  const [hasil, setHasil] = useState<RingkasanUpload | null>(null);
  const [drag, setDrag] = useState(false);

  const parsed = useMemo(() => (berkas ? parseAnalisa(tipe, berkas.a, peta) : null), [berkas, peta, tipe]);
  const pending = berkas && parsed ? { file: berkas.file, hasil: parsed } : null;
  const perluPeta = !!parsed?.kolomHilang.length;
  const pratinjau = useMemo(
    () => (parsed && !perluPeta && parsed.valid.length ? gabungUpsert(tipe, raw[tipe] as unknown[], parsed.valid, channel) : null),
    [parsed, perluPeta, raw, tipe, channel],
  );

  const reset = () => {
    setBerkas(null);
    setGantiSemua(false);
    setBukaPeta(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const onFile = async (file: File) => {
    setTolak(null);
    setHasil(null);
    reset();
    const salahJenis = cekJenisFile(file.name);
    if (salahJenis) {
      setTolak(salahJenis);
      return;
    }
    let a: AnalisaSheet;
    try {
      const wb = bacaWorkbook(new Uint8Array(await file.arrayBuffer()));
      const ws = pilihSheet(wb, tipe);
      if (!ws) {
        setTolak({ judul: 'File kosong', saran: 'Tidak ada sheet berisi data. Isi datanya dulu, atau pakai Template.' });
        return;
      }
      a = analisaSheet(tipe, ws, peta);
    } catch (e) {
      setTolak(pesanBacaFile(e));
      return;
    }
    if (!a.rows.length) {
      setTolak({ judul: 'Tidak ada data di file', saran: 'Pastikan data ada di bawah baris judul kolom. Bila ragu, unduh Template sebagai contoh.' });
      return;
    }
    setBerkas({ file: file.name, a });
  };

  const barisJenis = () => indeksJenis(raw, kartu).map((i) => (raw[tipe] as unknown[])[i]);
  const unduh = (semua: boolean) => {
    const rows = barisJenis();
    const wb = buatWorkbook(tipe, semua ? rows : rows.slice(0, 3));
    XLSX.writeFile(wb, semua ? `Data_${namaFile(kartu.menu)}_${new Date().toISOString().slice(0, 10)}.xlsx` : `Template_${namaFile(kartu.menu)}.xlsx`);
  };

  const simpan = async () => {
    if (!pending) return;
    const valid = pending.hasil.valid;
    let rows = valid as DataSet[typeof tipe];
    const catatan: string[] = [];
    let gabung: ((terbaru: DataSet[typeof tipe]) => DataSet[typeof tipe]) | undefined;
    if (!gantiSemua) {
      // Tambah & perbarui: data lama tetap; kunci sama diganti isi file; kunci baru ditambah.
      const hitung = (lama: readonly unknown[]) => gabungUpsert(tipe, lama, valid, channel);
      const g = hitung(raw[tipe] as unknown[]);
      rows = g.rows as DataSet[typeof tipe];
      gabung = (terbaru) => hitung(terbaru as unknown[]).rows as DataSet[typeof tipe];
      catatan.push(`${g.baru.toLocaleString('id-ID')} baris baru, ${g.diperbarui.toLocaleString('id-ID')} diperbarui, ${g.tetap.toLocaleString('id-ID')} data lama tetap.`);
      if (g.pindahChannel) catatan.push(`${g.pindahChannel} toko sebelumnya terdaftar di channel lain, sekarang dipindah ke ${channel}.`);
    } else if (tipe === 'master' && channel) {
      const g = gabungMaster(raw.master, valid as MasterToko[], channel);
      rows = g.rows as DataSet[typeof tipe];
      if (g.dipaksa) catatan.push(`${g.dipaksa} baris ber-channel lain disimpan sebagai ${channel}.`);
    } else if (tipe === 'pjp' && channel) {
      const g = gabungPjp(raw.pjp, valid as Kunjungan[], channel, raw.master);
      rows = g.rows as DataSet[typeof tipe];
      if (g.diLuar) catatan.push(`${g.diLuar} kunjungan ke toko yang bukan Store ${channel} di Master (tetap disimpan).`);
    }
    if (gantiSemua && !window.confirm(`Ganti SELURUH ${kartu.nama}${channel ? ` (${channel})` : ''} dengan isi file? Data yang tidak ada di file akan dihapus.`)) return;
    setMenyimpan(true);
    try {
      const mode = await replace(tipe, rows, gabung ? { gabung } : undefined);
      const r = ringkasUpload(tipe, { ...raw, [tipe]: rows }, { rupiah: formatRupiah, tanggal: formatTanggal });
      setHasil({ ...r, warning: [...catatan, ...r.warning, ...(mode === 'lokal' ? ['Mode lokal: data hanya tersimpan di browser ini, perangkat sales belum ter-update.'] : [])] });
      toast(mode === 'server' ? `${kartu.nama} disimpan ke database` : `${kartu.nama} disimpan (lokal)`);
      simpanPeta(kartu.id, peta);
      reset();
    } catch (e) {
      setTolak(pesanGagal(e, 'upload'));
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

      {izinUpload && (
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
        <span className="mt-0.5 text-xs text-slate-500">Excel / CSV · Template atau laporan mentah</span>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xlsm,.xls,.csv,.ods"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
          }}
        />
      </label>
      )}
      {(tipe === 'rules' || tipe === 'produk') && <TanpaMoq />}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => unduh(false)}>
          <Download size={14} /> Template
        </Button>
        <Button size="sm" variant="secondary" onClick={() => unduh(true)}>
          <Download size={14} /> Unduh data saat ini
        </Button>
      </div>
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
          <br />
          File laporan mentah juga bisa: baris judul dilewati otomatis, nama kolom umum (mis. “cust code1”, “NO. INVOICE”) dikenali, sisanya bisa dipetakan.
        </p>
      </details>

      {tolak && (
        <div role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          <p className="font-semibold">{tolak.judul}</p>
          <p className="mt-0.5 text-red-700/90">{tolak.saran}</p>
          {pending && !perluPeta && (
            <Button size="sm" className="mt-2" onClick={() => void simpan()} disabled={menyimpan}>
              {menyimpan ? 'Mencoba lagi…' : 'Coba lagi'}
            </Button>
          )}
        </div>
      )}

      {berkas && (bukaPeta || perluPeta) && (
        <PanelPeta
          tipe={tipe}
          a={berkas.a}
          peta={peta}
          kolomHilang={parsed?.kolomHilang ?? []}
          onChange={(p) => {
            setPeta(p);
            setBukaPeta(true);
          }}
          onTutup={perluPeta ? undefined : () => setBukaPeta(false)}
        />
      )}

      {pending && perluPeta && (
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="secondary" onClick={reset}>
            Batal
          </Button>
        </div>
      )}

      {pending && !perluPeta && (
        <div className="mt-3 rounded-xl border border-slate-200 p-3">
          <p className="text-xs text-slate-500">
            Header di baris {berkas!.a.barisHeader}
            {!bukaPeta && (
              <>
                {' · '}
                <button type="button" className="font-medium text-brand-700 underline-offset-2 hover:underline" onClick={() => setBukaPeta(true)}>
                  Atur pemetaan kolom
                </button>
              </>
            )}
          </p>
          <RingkasanFile pending={pending} header={berkas!.a.header} kartu={kartu} onPetakan={() => setBukaPeta(true)} />
          {pratinjau && !gantiSemua && (
            <p className="mt-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700">
              Saat disimpan: <b className="text-emerald-700">{pratinjau.baru.toLocaleString('id-ID')} baru</b> ·{' '}
              <b className="text-brand-700">{pratinjau.diperbarui.toLocaleString('id-ID')} diperbarui</b> · {pratinjau.tetap.toLocaleString('id-ID')} data lama tetap
              {pratinjau.sama > 0 && <> · {pratinjau.sama.toLocaleString('id-ID')} sama (tidak berubah)</>}
            </p>
          )}
          <label className="mt-2 flex items-start gap-2 text-xs text-slate-600">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-red-600" checked={gantiSemua} onChange={(e) => setGantiSemua(e.target.checked)} />
            <span>
              Ganti seluruh data{channel ? ` ${channel}` : ''} (hapus yang tidak ada di file)
              {gantiSemua && <span className="block font-medium text-red-700">Data lama yang tidak ada di file akan dihapus.</span>}
            </span>
          </label>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant={gantiSemua ? 'danger' : 'primary'} onClick={() => void simpan()} disabled={!pending.hasil.valid.length || menyimpan}>
              {menyimpan ? 'Menyimpan…' : gantiSemua ? 'Ganti semua' : errCount ? `Simpan ${pending.hasil.valid.length.toLocaleString('id-ID')} baris yang benar` : 'Simpan (tambah & perbarui)'}
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

const TETAP = '__tetap';

/** Petakan kolom skema ke header file mentah, atau isi nilai tetap untuk semua baris. */
function PanelPeta({
  tipe,
  a,
  peta,
  kolomHilang,
  onChange,
  onTutup,
}: {
  tipe: TipeData;
  a: AnalisaSheet;
  peta: PetaKolom;
  kolomHilang: string[];
  onChange: (p: PetaKolom) => void;
  onTutup?: () => void;
}) {
  const otomatis = useMemo(() => deteksiKolom(tipe, a.header_raw), [tipe, a]);
  const pilihan = useMemo(() => [...new Set(a.header.filter(Boolean))], [a]);
  const [semua, setSemua] = useState(false);
  const kolom = [...SKEMA[tipe].kolom].sort((x, y) => Number(y.wajib) - Number(x.wajib));
  const tampil = semua ? kolom : kolom.filter((k) => k.wajib || peta[k.nama]);
  const sisa = kolom.length - tampil.length;
  const set = (k: string, v: PetaKolom[string] | null) => {
    const n = { ...peta };
    if (v) n[k] = v;
    else delete n[k];
    onChange(n);
  };
  return (
    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">Petakan kolom</p>
          <p className="text-xs text-slate-600">
            {kolomHilang.length
              ? `Beberapa kolom wajib tidak ada di file (${kolomHilang.map(labelKolom).join(', ')}). Pilih kolom file yang berisi data itu, atau pilih “Isi nilai tetap” bila nilainya sama untuk semua baris.`
              : 'Cek kolom file yang dipakai. Pemetaan diingat untuk upload berikutnya.'}
            {' '}Header file di baris {a.barisHeader}.
          </p>
        </div>
        {onTutup && (
          <button type="button" className="text-xs font-medium text-slate-500 hover:text-slate-800" onClick={onTutup}>
            Tutup
          </button>
        )}
      </div>
      <div className="mt-2 space-y-2.5">
        {tampil.map((k) => {
          const p = peta[k.nama];
          const nilai = !p ? '' : 'tetap' in p ? TETAP : `h:${p.header}`;
          const hilang = kolomHilang.includes(k.nama);
          return (
            <div key={k.nama}>
              <span className={`mb-1 block text-xs font-medium ${hilang ? 'text-red-700' : 'text-slate-700'}`}>
                {labelKolom(k.nama)}
                {k.wajib && ' *'}
                {hilang && ' — belum ada'}
              </span>
              <Select
                label={`Kolom file untuk ${k.nama}`}
                value={nilai}
                className={`h-9 w-full ${hilang ? 'border-red-300' : ''}`}
                onChange={(v) => set(k.nama, v === '' ? null : v === TETAP ? { tetap: '' } : { header: v.slice(2) })}
              >
                <option value="">{otomatis[k.nama] ? `Otomatis: ${otomatis[k.nama]}` : '— tidak ada —'}</option>
                {pilihan.map((h) => (
                  <option key={h} value={`h:${h}`}>
                    {h}
                  </option>
                ))}
                <option value={TETAP}>Isi nilai tetap…</option>
              </Select>
              {p && 'tetap' in p && <NilaiTetap label={`Nilai tetap ${k.nama}`} awal={p.tetap} jenis={k.jenis} onSimpan={(v) => set(k.nama, { tetap: v })} />}
            </div>
          );
        })}
      </div>
      {sisa > 0 && (
        <button type="button" className="mt-2 text-xs font-medium text-brand-700 hover:underline" onClick={() => setSemua(true)}>
          Tampilkan {sisa} kolom opsional
        </button>
      )}
    </div>
  );
}

/** Input nilai tetap — state lokal, diterapkan saat blur/Enter supaya ketikan tetap mulus. */
function NilaiTetap({ label, awal, jenis, onSimpan }: { label: string; awal: string; jenis: string; onSimpan: (v: string) => void }) {
  const [v, setV] = useState(awal);
  return (
    <Input
      aria-label={label}
      autoFocus={!awal}
      type={jenis === 'date' ? 'date' : 'text'}
      inputMode={jenis === 'int' ? 'numeric' : undefined}
      placeholder={jenis === 'bool' ? 'YA / TIDAK' : 'Nilai untuk semua baris'}
      value={v}
      className="mt-1 h-9"
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== awal && onSimpan(v)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSimpan(v);
      }}
    />
  );
}

/** Ringkasan hasil baca file: berapa persen siap disimpan, alasan error dikelompokkan, unduh baris error. */
function RingkasanFile({
  pending,
  header,
  kartu,
  onPetakan,
}: {
  pending: { file: string; hasil: { valid: unknown[]; error: ErrorBaris[]; totalBaris: number; dilewati?: number } };
  header: string[];
  kartu: Kartu;
  onPetakan: () => void;
}) {
  const { valid, error, totalBaris, dilewati = 0 } = pending.hasil;
  const persen = totalBaris ? Math.floor((valid.length / totalBaris) * 100) : 0;
  const grup = useMemo(() => ringkasError(error), [error]);
  const fmt = (n: number) => n.toLocaleString('id-ID');
  const unduhError = () =>
    XLSX.writeFile(workbookError(header, error), `Perbaiki_${namaFile(kartu.menu)}_${namaFile(pending.file.replace(/\.[^.]+$/, ''))}.xlsx`);
  return (
    <div className="mt-1">
      <p className="text-sm text-slate-800">
        <span className="font-medium">{pending.file}</span>
      </p>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-red-100" aria-hidden>
        <div className={`h-full rounded-full ${error.length ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${persen}%` }} />
      </div>
      <p className="mt-1 text-sm text-slate-800">
        {error.length === 0 ? (
          <>
            Semua <span className="font-semibold">{fmt(totalBaris)}</span> baris siap disimpan.
          </>
        ) : (
          <>
            <span className="font-semibold">{fmt(valid.length)}</span> dari {fmt(totalBaris)} baris ({persen}%) siap disimpan ·{' '}
            <span className="text-red-700">{fmt(error.length)} baris perlu diperbaiki</span>
          </>
        )}
      </p>
      {dilewati > 0 && <p className="text-xs text-slate-500">{fmt(dilewati)} baris judul/total/kosong dilewati otomatis.</p>}
      {error.length > 0 && (
        <div className="mt-2 rounded-lg bg-red-50/70 p-2 text-xs text-slate-700">
          <p className="font-medium text-slate-800">Yang perlu diperbaiki:</p>
          <ul className="mt-1 space-y-0.5">
            {grup.slice(0, 6).map((g) => (
              <li key={g.alasan}>
                • {g.alasan} — <span className="tabular">{fmt(g.jumlah)}</span> baris
                <span className="text-slate-500"> (mis. baris {g.contohBaris.join(', ')})</span>
              </li>
            ))}
            {grup.length > 6 && <li className="text-slate-500">• dan {grup.length - 6} jenis masalah lain</li>}
          </ul>
          <p className="mt-2 text-slate-600">
            Baris yang bermasalah tidak ikut disimpan. Unduh daftarnya, perbaiki di Excel, lalu upload lagi
            {persen < 50 ? '. Banyak baris gagal biasanya karena kolom tertukar, jadi cek pemetaan kolom dulu.' : '.'}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={unduhError}>
              <Download size={14} /> Unduh baris yang error
            </Button>
            {persen < 50 && (
              <Button size="sm" variant="secondary" onClick={onPetakan}>
                Cek pemetaan kolom
              </Button>
            )}
          </div>
          <details className="mt-2">
            <summary className="cursor-pointer select-none text-slate-600">Lihat per baris</summary>
            <div className="mt-1 max-h-48 overflow-auto rounded-lg border border-red-100 bg-white">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-red-50 text-left text-red-800">
                  <tr>
                    <th className="px-2 py-1 font-medium">Baris</th>
                    <th className="px-2 py-1 font-medium">Masalah</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-red-50">
                  {error.slice(0, 200).map((e) => (
                    <tr key={e.baris}>
                      <td className="px-2 py-1 align-top tabular text-slate-700">{e.baris}</td>
                      <td className="px-2 py-1 text-slate-700">{e.alasan}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {error.length > 200 && <p className="px-2 py-1 text-xs text-slate-500">… dan {fmt(error.length - 200)} baris lain (lihat file unduhan)</p>}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

/** Banner: SKU di Master SKU yang belum punya MOQ (tampil "tanpa MOQ" di HP sales) + unduh template MOQ yang sudah terisi. */
function TanpaMoq() {
  const { raw } = useData();
  const daftar = useMemo(() => skuTanpaMoq(raw.produk, raw.rules), [raw.produk, raw.rules]);
  if (!daftar.length) return null;
  const unduh = () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(
      daftar.map((p) => ({ kode_sku: p.kode_sku, nama_sku: p.new_material?.trim() || p.nama_sku, satuan: 'Pcs', moq: '', isi_karton: '' })),
      { header: ['kode_sku', 'nama_sku', 'satuan', 'moq', 'isi_karton'] },
    );
    ws['!cols'] = [{ wch: 12 }, { wch: 48 }, { wch: 8 }, { wch: 8 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws, SKEMA.rules.sheet);
    XLSX.writeFile(wb, `MOQ_belum_diisi_${daftar.length}_SKU.xlsx`);
  };
  return (
    <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <b>{daftar.length.toLocaleString('id-ID')} SKU belum punya MOQ</b>. Di HP sales SKU ini tampil tanpa label "Min. … Pcs".
      <button type="button" onClick={unduh} className="ml-1 font-semibold text-amber-800 underline underline-offset-2">
        Unduh daftar
      </button>
      , isi kolom moq, lalu upload di kartu Data MOQ GT (data lama tetap aman).
    </div>
  );
}
