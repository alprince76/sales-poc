import { ChevronLeft, ChevronRight, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Card, cn, EmptyState, Field, IconButton, Input, Select, Sheet, useToast } from '../../components/ui';
import { normKode } from '../../lib/billing';
import { formatTanggal } from '../../lib/dates';
import { formatRupiah } from '../../lib/format';
import { cekDuplikat, indeksJenis, JENIS_DATA, jenisById, type JenisData } from '../../lib/jenisData';
import { SKEMA, validasiBaris, type TipeData } from '../../lib/parse';
import { formatTimestamp, useData } from '../../state';
import { AdminPage } from './AdminLayout';

const PER_HALAMAN = 50;
type Kolom = (typeof SKEMA)[TipeData]['kolom'][number];
type Baris = Record<string, unknown>;

/** Kolom angka yang tampil sebagai rupiah. */
const RUPIAH = new Set(['nilai_faktur', 'sisa_tagihan', 'harga', 'limit_kredit', 'rpp13']);
const PILIHAN: Record<string, string[]> = { channel: ['GT', 'MT'], tipe_bayar: ['TUNAI', 'KREDIT'] };
/** Kolom identitas tampil paling kiri (penting di layar sempit). */
const DEPAN = ['no_faktur', 'kode_toko', 'nama_toko', 'kode_sku', 'nama_sku', 'tanggal_kunjungan', 'tanggal_po'];
const urutan = (n: string) => (DEPAN.includes(n) ? DEPAN.indexOf(n) : DEPAN.length);

function tampil(k: Kolom, v: unknown): string {
  if (v === undefined || v === null || v === '') return '–';
  if (k.jenis === 'date') return formatTanggal(String(v));
  if (k.jenis === 'bool') return v ? 'YA' : 'TIDAK';
  if (k.jenis === 'int') return RUPIAH.has(k.nama) ? formatRupiah(Number(v)) : Number(v).toLocaleString('id-ID');
  return String(v);
}

/** Nilai baris → isi form (string). */
function keForm(kolom: Kolom[], r: Baris | null, j: JenisData): Record<string, string> {
  const f: Record<string, string> = {};
  for (const k of kolom) {
    const v = r?.[k.nama];
    f[k.nama] = v === undefined || v === null ? '' : k.jenis === 'bool' ? (v ? 'YA' : 'TIDAK') : String(v);
  }
  if (j.tipe === 'master' && j.channel) f.channel = j.channel;
  return f;
}

/** "112260 · TOKO NADIRA" — dua kolom wajib pertama. */
function labelBaris(kolom: Kolom[], r: Baris): string {
  return kolom
    .filter((k) => k.wajib)
    .slice(0, 3)
    .map((k) => tampil(k, r[k.nama]))
    .join(' · ');
}

export function MasterPage() {
  const { jenis } = useParams();
  const j = jenisById(jenis);
  if (!j) return <Navigate to={`/admin/master/${JENIS_DATA[0].id}`} replace />;
  return <MasterJenis key={j.id} j={j} />;
}

function MasterJenis({ j }: { j: JenisData }) {
  const { raw, sumber, versi, updatedAt, ubahBaris, menyimpan } = useData();
  const toast = useToast();
  const nav = useNavigate();
  const semuaKolom = SKEMA[j.tipe].kolom;
  const rows = raw[j.tipe] as unknown as Baris[];
  const indeks = useMemo(() => indeksJenis(raw, j), [raw, j]);

  // Kolom opsional yang kosong di semua baris disembunyikan dari tabel (tetap ada di form).
  const kolom = useMemo(() => {
    const contoh = indeks.slice(0, 3000);
    return semuaKolom
      .filter((k) => k.wajib || contoh.some((i) => rows[i]?.[k.nama] !== undefined && rows[i]?.[k.nama] !== ''))
      .map((k, i) => ({ k, i }))
      .sort((a, b) => urutan(a.k.nama) - urutan(b.k.nama) || a.i - b.i)
      .map((x) => x.k);
  }, [semuaKolom, indeks, rows]);

  const [q, setQ] = useState('');
  const dq = useDeferredValue(q.trim().toLowerCase());
  const [hal, setHal] = useState(0);
  // Teks pencarian dibuat sekali per data (bukan tiap ketik) → cari di 20 ribu baris tetap instan.
  const teksCari = useMemo(() => {
    const cacheTampil = new Map<string, string>();
    const fmt = (k: Kolom, v: unknown) => {
      if (k.jenis !== 'date' && k.jenis !== 'int') return '';
      const key = `${k.nama}|${String(v)}`;
      let t = cacheTampil.get(key);
      if (t === undefined) cacheTampil.set(key, (t = tampil(k, v)));
      return t;
    };
    const m = new Map<number, string>();
    for (const i of indeks) {
      const r = rows[i];
      m.set(i, kolom.map((k) => `${String(r[k.nama] ?? '')} ${fmt(k, r[k.nama])}`).join(' ').toLowerCase());
    }
    return m;
  }, [indeks, rows, kolom]);
  const hasil = useMemo(() => {
    if (!dq) return indeks;
    const kata = dq.split(/\s+/);
    return indeks.filter((i) => {
      const teks = teksCari.get(i) ?? '';
      return kata.every((w) => teks.includes(w));
    });
  }, [dq, indeks, teksCari]);
  useEffect(() => setHal(0), [dq, j.id]);
  const jmlHal = Math.max(1, Math.ceil(hasil.length / PER_HALAMAN));
  // Baris yang baru ditambah/diedit: halaman otomatis lompat ke baris itu & disorot sebentar.
  const [sorot, setSorot] = useState<number | null>(null);
  const posSorot = sorot === null ? -1 : hasil.indexOf(sorot);
  const halAman = posSorot >= 0 ? Math.floor(posSorot / PER_HALAMAN) : Math.min(hal, jmlHal - 1);
  const halAmanRef = useRef(halAman);
  halAmanRef.current = halAman;
  const tampilIdx = hasil.slice(halAman * PER_HALAMAN, (halAman + 1) * PER_HALAMAN);
  useEffect(() => {
    if (sorot === null || posSorot < 0) return;
    document.querySelector(`[data-baris="${sorot}"]`)?.scrollIntoView({ block: 'center' });
    const t = window.setTimeout(() => {
      setHal(halAmanRef.current);
      setSorot(null);
    }, 4000);
    return () => window.clearTimeout(t);
  }, [sorot, posSorot]);
  const keHal = (h: number) => {
    setSorot(null);
    setHal(h);
  };

  // Hanya "form mana yang terbuka" di sini; isian diketik di <FormBaris> (state sendiri)
  // supaya mengetik tidak me-render ulang tabel.
  const [form, setForm] = useState<{ id: number; indeks: number | null; awal: Record<string, string> } | null>(null);
  /** Kirim ke DB di belakang; tampilan sudah berubah (optimistic). */
  const kirim = (indeks: number | null, baru: object | null, pesanOk: string) => {
    ubahBaris(j.tipe, indeks, baru).then(
      (mode) => toast(mode === 'server' ? `${pesanOk} · tersimpan di database` : `${pesanOk} (lokal, server tidak terjangkau)`),
      (e) => toast(`Gagal menyimpan, perubahan dibatalkan: ${e instanceof Error ? e.message : String(e)}`, 'error'),
    );
  };

  const bukaForm = (i: number | null) => {
    setForm({ id: Date.now(), indeks: i, awal: keForm(semuaKolom, i === null ? null : rows[i], j) });
  };
  const tutupForm = useCallback(() => setForm(null), []);

  /** Cek isian; valid → form langsung ditutup & disimpan di belakang. Mengembalikan daftar error. */
  const simpanForm = (indeks: number | null, nilai: Record<string, string>): string[] => {
    const v = validasiBaris<Baris>(j.tipe, nilai);
    if (!v.baris) return v.alasan;
    const dup = cekDuplikat(j.tipe, rows, v.baris, indeks);
    if (dup) return [dup];
    // PJP per channel: toko harus ada di Master Store channel yang sama (kalau tidak, baris tidak tampil di submenu ini).
    if (j.tipe === 'pjp' && j.channel) {
      const kode = normKode(String(v.baris.kode_toko ?? ''));
      const toko = raw.master.find((m) => normKode(m.kode_toko) === kode);
      if (!toko) return [`Kode toko ${kode} belum ada di Master Store. Tambahkan dulu di Store ${j.channel}.`];
      const ch = String(toko.channel ?? '').toUpperCase() === 'MT' ? 'MT' : 'GT';
      if (ch !== j.channel) return [`Toko ${kode} (${toko.nama_toko}) adalah Store ${ch}. Atur jadwalnya di PJP Sales ${ch}.`];
    }
    setForm(null);
    setQ('');
    setSorot(indeks ?? rows.length); // tambah → baris baru di akhir
    kirim(indeks, v.baris, indeks === null ? 'Baris ditambahkan' : 'Perubahan disimpan');
    return [];
  };

  const hapus = (i: number) => {
    if (!window.confirm(`Hapus baris ini dari ${j.nama}?\n\n${labelBaris(semuaKolom, rows[i])}`)) return;
    kirim(i, null, 'Baris dihapus');
  };

  const s = sumber[j.tipe];
  return (
    <AdminPage
      title={j.nama}
      description={j.desc}
      actions={
        <Button onClick={() => bukaForm(null)}>
          <Plus size={16} /> Tambah data
        </Button>
      }
    >
      <Card className="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          <Select label="Jenis data master" value={j.id} onChange={(id) => nav(`/admin/master/${id}`)} className="lg:hidden">
            {JENIS_DATA.map((x) => (
              <option key={x.id} value={x.id}>
                {x.menu}
              </option>
            ))}
          </Select>
          <div className="relative min-w-[12rem] flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input type="search" aria-label={`Cari di ${j.nama}`} placeholder="Cari kode, nama, tanggal…" value={q} onChange={(e) => {
                setSorot(null);
                setQ(e.target.value);
              }} className="h-10 pl-9" />
          </div>
          <Badge tone={s === 'server' ? 'green' : s === 'lokal' ? 'orange' : 'gray'}>{s === 'server' ? `Server · v${versi[j.tipe]}` : s === 'lokal' ? 'Lokal' : 'Dummy'}</Badge>
          <span className="text-xs text-slate-500" aria-live="polite">
            {menyimpan > 0 ? 'Menyimpan ke database…' : `Diperbarui ${formatTimestamp(updatedAt[j.tipe])}`}
          </span>
        </div>

        {hasil.length === 0 ? (
          <EmptyState title={q ? 'Tidak ada yang cocok' : 'Belum ada data'}>{q ? 'Coba kata kunci lain.' : 'Tambah data atau upload file di Data & Upload.'}</EmptyState>
        ) : (
          <div className="max-h-[68vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2.5 text-right">#</th>
                  {kolom.map((k) => (
                    <th key={k.nama} className="whitespace-nowrap px-3 py-2.5">
                      {k.nama.replace(/_/g, ' ')}
                    </th>
                  ))}
                  <th className="sticky right-0 bg-slate-50 px-3 py-2.5 text-right">
                    <span className="sr-only">Aksi</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tampilIdx.map((i) => (
                  <tr key={i} data-baris={i} className={cn('group', i === sorot ? 'bg-amber-50' : 'hover:bg-slate-50')}>
                    <td className="px-3 py-2 text-right text-xs tabular text-slate-400">{i + 1}</td>
                    {kolom.map((k) => (
                      <td key={k.nama} className={cn('whitespace-nowrap px-3 py-2', k.jenis === 'int' && 'text-right tabular', k.nama.startsWith('nama') && 'max-w-[18rem] truncate')} title={String(rows[i][k.nama] ?? '')}>
                        {tampil(k, rows[i][k.nama])}
                      </td>
                    ))}
                    <td className={cn('sticky right-0 px-1 py-1', i === sorot ? 'bg-amber-50' : 'bg-white group-hover:bg-slate-50')}>
                      <div className="flex justify-end">
                        <IconButton label={`Edit baris ${i + 1}`} onClick={() => bukaForm(i)} className="h-9 w-9 text-slate-500 hover:text-brand-700">
                          <Pencil size={16} />
                        </IconButton>
                        <IconButton label={`Hapus baris ${i + 1}`} onClick={() => hapus(i)} className="h-9 w-9 text-slate-500 hover:bg-red-50 hover:text-red-600">
                          <Trash2 size={16} />
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-3 py-2 text-sm text-slate-600">
          <span className="tabular">
            {hasil.length ? `${(halAman * PER_HALAMAN + 1).toLocaleString('id-ID')}–${Math.min((halAman + 1) * PER_HALAMAN, hasil.length).toLocaleString('id-ID')} dari ` : ''}
            {hasil.length.toLocaleString('id-ID')} baris{q && ` (total ${indeks.length.toLocaleString('id-ID')})`}
          </span>
          <div className="flex items-center gap-1">
            <IconButton label="Halaman sebelumnya" onClick={() => keHal(halAman - 1)} disabled={halAman === 0} className="h-9 w-9">
              <ChevronLeft size={18} />
            </IconButton>
            <span className="tabular text-xs">
              {halAman + 1} / {jmlHal}
            </span>
            <IconButton label="Halaman berikutnya" onClick={() => keHal(halAman + 1)} disabled={halAman >= jmlHal - 1} className="h-9 w-9">
              <ChevronRight size={18} />
            </IconButton>
          </div>
        </div>
      </Card>

      {form && (
        <FormBaris
          key={form.id}
          j={j}
          kolom={semuaKolom}
          indeks={form.indeks}
          awal={form.awal}
          onTutup={tutupForm}
          onSimpan={simpanForm}
        />
      )}
    </AdminPage>
  );
}

interface FormProps {
  j: JenisData;
  kolom: Kolom[];
  indeks: number | null;
  awal: Record<string, string>;
  onTutup: () => void;
  onSimpan: (indeks: number | null, nilai: Record<string, string>) => string[];
}

/** Form tambah/edit satu baris. Isian disimpan lokal di sini → ketikan tidak me-render tabel induk. */
function FormBaris({ j, kolom, indeks, awal, onTutup, onSimpan }: FormProps) {
  const [nilai, setNilai] = useState(awal);
  const [err, setErr] = useState<string[]>([]);
  const set = useCallback((nama: string, x: string) => setNilai((n) => ({ ...n, [nama]: x })), []);
  const simpan = () => {
    const e = onSimpan(indeks, nilai);
    if (e.length) setErr(e);
  };

  return (
    <Sheet
      open
      onClose={onTutup}
      title={indeks === null ? `Tambah ${j.menu}` : `Edit ${j.menu} · baris ${indeks + 1}`}
      footer={
        <div className="flex gap-2">
          <Button className="flex-1" onClick={simpan}>
            Simpan
          </Button>
          <Button variant="secondary" onClick={onTutup}>
            Batal
          </Button>
        </div>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          simpan();
        }}
      >
        {err.length > 0 && (
          <div role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            <p className="font-semibold">Data belum valid:</p>
            <ul className="mt-1 list-disc pl-5">
              {err.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
        {kolom.map((k) => (
          <FieldBaris
            key={k.nama}
            k={k}
            value={nilai[k.nama] ?? ''}
            onChange={set}
            kunci={j.tipe === 'master' && j.channel && k.nama === 'channel' ? `Dikunci ke ${j.channel} (submenu ${j.menu})` : null}
          />
        ))}
        <button type="submit" className="sr-only">
          Simpan
        </button>
      </form>
    </Sheet>
  );
}

/** Satu field; memo → hanya field yang diketik yang di-render ulang. */
const FieldBaris = memo(function FieldBaris({ k, value, onChange, kunci }: { k: Kolom; value: string; onChange: (nama: string, v: string) => void; kunci: string | null }) {
  const label = `${k.nama.replace(/_/g, ' ')}${k.wajib ? ' *' : ''}`;
  const opsi = k.jenis === 'bool' ? ['YA', 'TIDAK'] : PILIHAN[k.nama];
  return (
    <Field label={label} hint={kunci ?? undefined}>
      {opsi ? (
        <select
          value={value}
          disabled={!!kunci}
          onChange={(e) => onChange(k.nama, e.target.value)}
          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50"
        >
          <option value="">{k.wajib ? 'Pilih…' : '(kosong)'}</option>
          {opsi.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <Input
          value={value}
          onChange={(e) => onChange(k.nama, e.target.value)}
          type={k.jenis === 'date' ? 'date' : 'text'}
          inputMode={k.jenis === 'int' ? 'numeric' : undefined}
          autoComplete="off"
        />
      )}
    </Field>
  );
});
