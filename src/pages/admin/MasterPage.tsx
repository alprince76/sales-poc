import { ChevronLeft, ChevronRight, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Card, cn, EmptyState, Field, IconButton, Input, Select, Sheet, useToast } from '../../components/ui';
import { formatTanggal } from '../../lib/dates';
import { formatRupiah } from '../../lib/format';
import { cekDuplikat, indeksJenis, JENIS_DATA, jenisById, terapkan, type JenisData } from '../../lib/jenisData';
import { SKEMA, validasiBaris, type TipeData } from '../../lib/parse';
import { mintaToken, RemoteError, tokenAdmin } from '../../lib/remote';
import type { DataSet } from '../../lib/types';
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
  const { raw, sumber, versi, updatedAt, koneksi, replace } = useData();
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
  const hasil = useMemo(() => {
    if (!dq) return indeks;
    const kata = dq.split(/\s+/);
    return indeks.filter((i) => {
      const r = rows[i];
      const teks = kolom.map((k) => `${String(r[k.nama] ?? '')} ${tampil(k, r[k.nama])}`).join(' ').toLowerCase();
      return kata.every((w) => teks.includes(w));
    });
  }, [dq, indeks, rows, kolom]);
  useEffect(() => setHal(0), [dq, j.id]);
  const jmlHal = Math.max(1, Math.ceil(hasil.length / PER_HALAMAN));
  const halAman = Math.min(hal, jmlHal - 1);
  const tampilIdx = hasil.slice(halAman * PER_HALAMAN, (halAman + 1) * PER_HALAMAN);

  // Hanya "form mana yang terbuka" di sini; isian diketik di <FormBaris> (state sendiri)
  // supaya mengetik tidak me-render ulang tabel.
  const [form, setForm] = useState<{ id: number; indeks: number | null; awal: Record<string, string> } | null>(null);
  const [simpanJalan, setSimpanJalan] = useState(false);

  const simpanRows = async (next: Baris[], pesanOk: string): Promise<boolean> => {
    let token = tokenAdmin();
    if (koneksi === 'server' && !token) token = mintaToken();
    if (koneksi === 'server' && !token) return false;
    setSimpanJalan(true);
    try {
      for (let coba = 0; ; coba++) {
        try {
          const mode = await replace(j.tipe, next as unknown as DataSet[typeof j.tipe], token, { cekVersi: true });
          toast(mode === 'server' ? `${pesanOk} · tersimpan di server` : `${pesanOk} (lokal, belum tersinkron)`);
          return true;
        } catch (e) {
          if (e instanceof RemoteError && e.status === 401 && coba < 2) {
            token = mintaToken(true);
            if (token) continue;
            return false;
          }
          if (e instanceof RemoteError && e.status === 409) {
            toast('Data sudah diubah admin lain. List dimuat ulang — silakan ulangi.', 'error');
            setForm(null);
            return false;
          }
          toast(`Gagal menyimpan: ${e instanceof Error ? e.message : String(e)}`, 'error');
          return false;
        }
      }
    } finally {
      setSimpanJalan(false);
    }
  };

  const bukaForm = (i: number | null) => {
    setForm({ id: Date.now(), indeks: i, awal: keForm(semuaKolom, i === null ? null : rows[i], j) });
  };
  const tutupForm = useCallback(() => setForm(null), []);

  /** Validasi + simpan. Mengembalikan daftar error (kosong = tersimpan / dibatalkan). */
  const simpanForm = async (indeks: number | null, nilai: Record<string, string>): Promise<string[]> => {
    const v = validasiBaris<Baris>(j.tipe, nilai);
    if (!v.baris) return v.alasan;
    const dup = cekDuplikat(j.tipe, rows, v.baris, indeks);
    if (dup) return [dup];
    const ok = await simpanRows(terapkan(rows, indeks, v.baris), indeks === null ? 'Baris ditambahkan' : 'Perubahan disimpan');
    if (ok) setForm(null);
    return [];
  };

  const hapus = async (i: number) => {
    if (!window.confirm(`Hapus baris ini dari ${j.nama}?\n\n${labelBaris(semuaKolom, rows[i])}`)) return;
    await simpanRows(terapkan(rows, i, null), 'Baris dihapus');
  };

  const s = sumber[j.tipe];
  return (
    <AdminPage
      title={j.nama}
      description={j.desc}
      actions={
        <Button onClick={() => bukaForm(null)} disabled={simpanJalan}>
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
            <Input type="search" aria-label={`Cari di ${j.nama}`} placeholder="Cari kode, nama, tanggal…" value={q} onChange={(e) => setQ(e.target.value)} className="h-10 pl-9" />
          </div>
          <Badge tone={s === 'server' ? 'green' : s === 'lokal' ? 'orange' : 'gray'}>{s === 'server' ? `Server · v${versi[j.tipe]}` : s === 'lokal' ? 'Lokal' : 'Dummy'}</Badge>
          <span className="text-xs text-slate-500">Diperbarui {formatTimestamp(updatedAt[j.tipe])}</span>
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
                  <tr key={i} className="group hover:bg-slate-50">
                    <td className="px-3 py-2 text-right text-xs tabular text-slate-400">{i + 1}</td>
                    {kolom.map((k) => (
                      <td key={k.nama} className={cn('whitespace-nowrap px-3 py-2', k.jenis === 'int' && 'text-right tabular', k.nama.startsWith('nama') && 'max-w-[18rem] truncate')} title={String(rows[i][k.nama] ?? '')}>
                        {tampil(k, rows[i][k.nama])}
                      </td>
                    ))}
                    <td className="sticky right-0 bg-white px-1 py-1 group-hover:bg-slate-50">
                      <div className="flex justify-end">
                        <IconButton label={`Edit baris ${i + 1}`} onClick={() => bukaForm(i)} disabled={simpanJalan} className="h-9 w-9 text-slate-500 hover:text-brand-700">
                          <Pencil size={16} />
                        </IconButton>
                        <IconButton label={`Hapus baris ${i + 1}`} onClick={() => void hapus(i)} disabled={simpanJalan} className="h-9 w-9 text-slate-500 hover:bg-red-50 hover:text-red-600">
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
            <IconButton label="Halaman sebelumnya" onClick={() => setHal(halAman - 1)} disabled={halAman === 0} className="h-9 w-9">
              <ChevronLeft size={18} />
            </IconButton>
            <span className="tabular text-xs">
              {halAman + 1} / {jmlHal}
            </span>
            <IconButton label="Halaman berikutnya" onClick={() => setHal(halAman + 1)} disabled={halAman >= jmlHal - 1} className="h-9 w-9">
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
          sibuk={simpanJalan}
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
  sibuk: boolean;
  onTutup: () => void;
  onSimpan: (indeks: number | null, nilai: Record<string, string>) => Promise<string[]>;
}

/** Form tambah/edit satu baris. Isian disimpan lokal di sini → ketikan tidak me-render tabel induk. */
function FormBaris({ j, kolom, indeks, awal, sibuk, onTutup, onSimpan }: FormProps) {
  const [nilai, setNilai] = useState(awal);
  const [err, setErr] = useState<string[]>([]);
  const set = useCallback((nama: string, x: string) => setNilai((n) => ({ ...n, [nama]: x })), []);
  const simpan = async () => setErr(await onSimpan(indeks, nilai));
  const tutup = useCallback(() => {
    if (!sibuk) onTutup();
  }, [sibuk, onTutup]);

  return (
    <Sheet
      open
      onClose={tutup}
      title={indeks === null ? `Tambah ${j.menu}` : `Edit ${j.menu} · baris ${indeks + 1}`}
      footer={
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => void simpan()} disabled={sibuk}>
            {sibuk ? 'Menyimpan…' : 'Simpan'}
          </Button>
          <Button variant="secondary" onClick={onTutup} disabled={sibuk}>
            Batal
          </Button>
        </div>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void simpan();
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
