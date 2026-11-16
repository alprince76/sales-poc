/** Pengguna: akun admin (email) & sales (kode SR + PIN), peran, lingkup salesman, reset sandi, buat akun massal, log aktivitas. */
import { Copy, Download, KeyRound, Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { api, useAuth, useIzin, type PenggunaSesi } from '../../auth';
import { Badge, Button, Card, cn, EmptyState, Field, IconButton, Input, Segmented, Select, Sheet, useToast } from '../../components/ui';
import { ID_SUPER_ADMIN, type PeranDef } from '../../lib/akses';
import { formatTimestamp, useData } from '../../state';
import { AdminPage } from './AdminLayout';

type Draf = { id: string | null; jenis: 'admin' | 'sales'; nama: string; email: string; kode_salesman: string; peran_id: string; lingkup: string[]; sebagian: boolean; aktif: boolean; sandi: string };
type HasilMassal = { kode_salesman: string; nama: string; peran: string; pin: string }[];
type Audit = { waktu: string; pengguna: string; aksi: string; objek: string; detail: unknown };

const kosong = (peran: PeranDef[]): Draf => ({
  id: null,
  jenis: 'admin',
  nama: '',
  email: '',
  kode_salesman: '',
  peran_id: peran.find((p) => p.id === 'admin')?.id ?? peran[0]?.id ?? '',
  lingkup: [],
  sebagian: false,
  aktif: true,
  sandi: '',
});

export function PenggunaPage() {
  const { sesi } = useAuth();
  const izin = useIzin('pengguna.user');
  const { salesmen } = useData();
  const toast = useToast();
  const [daftar, setDaftar] = useState<PenggunaSesi[] | null>(null);
  const [peran, setPeran] = useState<PeranDef[]>([]);
  const [q, setQ] = useState('');
  const [fPeran, setFPeran] = useState('');
  const [draf, setDraf] = useState<Draf | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [jalan, setJalan] = useState(false);
  const [rahasia, setRahasia] = useState<{ judul: string; nama: string; login: string; sandi: string; pin: boolean } | null>(null);
  const [massal, setMassal] = useState<HasilMassal | null>(null);

  const muat = useCallback(async () => {
    const [u, p] = await Promise.all([api<PenggunaSesi[]>('/api/pengguna'), api<PeranDef[]>('/api/peran')]);
    setDaftar(u);
    setPeran(p);
  }, []);
  useEffect(() => {
    muat().catch((e) => toast(e instanceof Error ? e.message : 'Gagal memuat pengguna', 'error'));
  }, [muat, toast]);

  const namaPeran = (id: string) => peran.find((p) => p.id === id)?.nama ?? id;
  const namaSR = useMemo(() => new Map(salesmen.map((s) => [s.kode, s.nama])), [salesmen]);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (daftar ?? []).filter(
      (u) => (!fPeran || u.peran_id === fPeran) && (!t || `${u.nama} ${u.email ?? ''} ${u.kode_salesman ?? ''} ${namaPeran(u.peran_id)}`.toLowerCase().includes(t)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daftar, q, fPeran, peran]);
  const tanpaAkun = useMemo(() => {
    const punya = new Set((daftar ?? []).map((u) => u.kode_salesman).filter(Boolean));
    return salesmen.filter((s) => !punya.has(s.kode));
  }, [daftar, salesmen]);

  const buka = (u: PenggunaSesi | null) => {
    setErr(null);
    setDraf(
      u
        ? { id: u.id, jenis: u.kode_salesman ? 'sales' : 'admin', nama: u.nama, email: u.email ?? '', kode_salesman: u.kode_salesman ?? '', peran_id: u.peran_id, lingkup: u.lingkup, sebagian: u.lingkup.length > 0, aktif: u.aktif, sandi: '' }
        : kosong(peran),
    );
  };

  const kirim = async () => {
    if (!draf) return;
    setErr(null);
    const body = {
      nama: draf.nama.trim(),
      email: draf.jenis === 'admin' ? draf.email.trim() : null,
      kode_salesman: draf.jenis === 'sales' ? draf.kode_salesman.trim() : null,
      peran_id: draf.peran_id,
      lingkup: draf.jenis === 'admin' && draf.sebagian ? draf.lingkup : [],
      aktif: draf.aktif,
      ...(draf.id ? {} : { sandi: draf.sandi.trim() || undefined }),
    };
    if (!body.nama) return setErr('Nama wajib diisi.');
    if (draf.jenis === 'admin' && !body.email) return setErr('Email wajib diisi untuk akun admin.');
    if (draf.jenis === 'sales' && !body.kode_salesman) return setErr('Pilih kode SR.');
    if (draf.jenis === 'admin' && draf.sebagian && !draf.lingkup.length) return setErr('Pilih minimal 1 salesman, atau centang "Semua salesman".');
    setJalan(true);
    try {
      if (draf.id) {
        await api(`/api/pengguna/${draf.id}`, 'PUT', body);
        toast(`${body.nama} disimpan`);
      } else {
        const r = await api<{ pengguna: PenggunaSesi; sandi: string }>('/api/pengguna', 'POST', body);
        setRahasia({ judul: 'Akun dibuat', nama: r.pengguna.nama, login: r.pengguna.email ?? r.pengguna.kode_salesman ?? '', sandi: r.sandi, pin: draf.jenis === 'sales' });
      }
      setDraf(null);
      await muat();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Gagal menyimpan');
    } finally {
      setJalan(false);
    }
  };

  const reset = async (u: PenggunaSesi) => {
    const kata = u.kode_salesman ? 'PIN' : 'password';
    if (!window.confirm(`Reset ${kata} ${u.nama}? ${kata} lama langsung tidak berlaku dan ${u.nama} keluar dari semua perangkat.`)) return;
    try {
      const r = await api<{ sandi: string }>(`/api/pengguna/${u.id}/reset-sandi`, 'POST');
      setRahasia({ judul: `${kata === 'PIN' ? 'PIN' : 'Password'} direset`, nama: u.nama, login: u.email ?? u.kode_salesman ?? '', sandi: r.sandi, pin: !!u.kode_salesman });
      await muat();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal reset', 'error');
    }
  };

  const hapus = async (u: PenggunaSesi) => {
    if (!window.confirm(`Hapus akun ${u.nama}? Akun langsung tidak bisa login. Data yang sudah diinput tetap ada.`)) return;
    try {
      await api(`/api/pengguna/${u.id}`, 'DELETE');
      toast(`Akun ${u.nama} dihapus`);
      await muat();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal menghapus', 'error');
    }
  };

  const buatMassal = async () => {
    if (!window.confirm(`Buat akun untuk ${tanpaAkun.length} salesman yang belum punya akun? PIN awal dibuat acak dan hanya ditampilkan sekali.`)) return;
    try {
      const r = await api<HasilMassal>('/api/pengguna/massal', 'POST', { salesmen: tanpaAkun });
      setMassal(r);
      await muat();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal membuat akun', 'error');
    }
  };

  const unduhMassal = () => {
    if (!massal) return;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(massal.map((m) => ({ 'Kode SR': m.kode_salesman, Nama: m.nama, Peran: m.peran, 'PIN awal': m.pin }))),
      'Akun Sales',
    );
    XLSX.writeFile(wb, `Akun_Sales_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const lingkupTeks = (u: PenggunaSesi) => (u.kode_salesman ? 'Diri sendiri' : u.lingkup.length ? `${u.lingkup.length} salesman` : 'Semua');

  return (
    <AdminPage
      title="Pengguna"
      description="Akun admin (email + password) dan salesman (kode SR + PIN). Akses menu diatur di Peran & Akses."
      actions={
        izin.tambah ? (
          <>
            {tanpaAkun.length > 0 && (
              <Button variant="secondary" onClick={() => void buatMassal()}>
                <Users size={16} /> Buat akun {tanpaAkun.length} salesman
              </Button>
            )}
            <Button onClick={() => buka(null)}>
              <Plus size={16} /> Tambah pengguna
            </Button>
          </>
        ) : undefined
      }
    >
      <Card className="p-0">
        <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
          <div className="relative min-w-[12rem] flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input type="search" aria-label="Cari pengguna" placeholder="Cari nama, email, kode SR…" value={q} onChange={(e) => setQ(e.target.value)} className="h-10 pl-9" />
          </div>
          <Select label="Filter peran" value={fPeran} onChange={setFPeran}>
            <option value="">Semua peran</option>
            {peran.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nama}
              </option>
            ))}
          </Select>
        </div>
        {!daftar ? (
          <p className="p-6 text-sm text-slate-500">Memuat pengguna…</p>
        ) : !rows.length ? (
          <div className="p-4">
            <EmptyState title={q || fPeran ? 'Tidak ada yang cocok' : 'Belum ada pengguna'} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Nama</th>
                  <th className="px-4 py-2.5 font-semibold">Login</th>
                  <th className="px-4 py-2.5 font-semibold">Peran</th>
                  <th className="px-4 py-2.5 font-semibold">Lingkup data</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 font-semibold">Login terakhir</th>
                  <th className="px-2 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-900">
                      {u.nama}
                      {u.id === sesi?.pengguna.id && <span className="ml-1.5 text-xs font-normal text-slate-500">(Anda)</span>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">{u.email ?? <span className="font-mono">SR {u.kode_salesman}</span>}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={u.peran_id === ID_SUPER_ADMIN ? 'violet' : u.kode_salesman ? 'blue' : 'brand'} dot={false}>
                        {namaPeran(u.peran_id)}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-slate-700" title={u.lingkup.map((k) => `${k} ${namaSR.get(k) ?? ''}`).join(', ')}>
                      {lingkupTeks(u)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        <Badge tone={u.aktif ? 'green' : 'gray'}>{u.aktif ? 'Aktif' : 'Nonaktif'}</Badge>
                        {u.wajib_ganti && u.aktif && (
                          <Badge tone="orange" dot={false}>
                            Belum ganti {u.kode_salesman ? 'PIN' : 'password'}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{u.login_terakhir ? formatTimestamp(u.login_terakhir) : 'Belum pernah'}</td>
                    <td className="px-2 py-1.5">
                      <div className="flex justify-end">
                        {izin.ubah && (
                          <>
                            <IconButton label={`Ubah ${u.nama}`} onClick={() => buka(u)} className="h-9 w-9 text-slate-500 hover:text-brand-700">
                              <Pencil size={16} />
                            </IconButton>
                            <IconButton label={`Reset ${u.kode_salesman ? 'PIN' : 'password'} ${u.nama}`} onClick={() => void reset(u)} className="h-9 w-9 text-slate-500 hover:text-amber-700">
                              <KeyRound size={16} />
                            </IconButton>
                          </>
                        )}
                        {izin.hapus && u.id !== sesi?.pengguna.id && (
                          <IconButton label={`Hapus ${u.nama}`} onClick={() => void hapus(u)} className="h-9 w-9 text-slate-500 hover:bg-red-50 hover:text-red-600">
                            <Trash2 size={16} />
                          </IconButton>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <LogAktivitas />

      <Sheet
        open={!!draf}
        onClose={() => setDraf(null)}
        title={draf?.id ? 'Ubah pengguna' : 'Tambah pengguna'}
        footer={
          <Button block onClick={() => void kirim()} disabled={jalan}>
            {jalan ? 'Menyimpan…' : 'Simpan'}
          </Button>
        }
      >
        {draf && (
          <FormPengguna
            draf={draf}
            setDraf={setDraf}
            peran={peran.filter((p) => p.id !== ID_SUPER_ADMIN || sesi?.peran.id === ID_SUPER_ADMIN)}
            salesmen={salesmen}
            sendiri={draf.id === sesi?.pengguna.id}
            err={err}
          />
        )}
      </Sheet>

      <Sheet open={!!rahasia} onClose={() => setRahasia(null)} title={rahasia?.judul ?? ''} footer={<Button block onClick={() => setRahasia(null)}>Sudah dicatat</Button>}>
        {rahasia && <TampilRahasia {...rahasia} />}
      </Sheet>

      <Sheet
        open={!!massal}
        onClose={() => setMassal(null)}
        title={`${massal?.length ?? 0} akun sales dibuat`}
        footer={
          <Button block onClick={unduhMassal} disabled={!massal?.length}>
            <Download size={16} /> Unduh daftar PIN (Excel)
          </Button>
        }
      >
        {massal && (
          <div className="space-y-3">
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
              PIN awal hanya ditampilkan <b>sekali</b>. Unduh daftarnya lalu bagikan ke masing-masing salesman. Setiap salesman wajib mengganti PIN saat login pertama.
            </p>
            <div className="max-h-[50vh] overflow-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Kode SR</th>
                    <th className="px-3 py-2">Nama</th>
                    <th className="px-3 py-2">Peran</th>
                    <th className="px-3 py-2">PIN awal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {massal.map((m) => (
                    <tr key={m.kode_salesman}>
                      <td className="px-3 py-1.5 font-mono">{m.kode_salesman}</td>
                      <td className="px-3 py-1.5">{m.nama}</td>
                      <td className="px-3 py-1.5">{m.peran}</td>
                      <td className="px-3 py-1.5 font-mono tracking-widest">{m.pin}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Sheet>
    </AdminPage>
  );
}

function FormPengguna({
  draf,
  setDraf,
  peran,
  salesmen,
  sendiri,
  err,
}: {
  draf: Draf;
  setDraf: (d: Draf) => void;
  peran: PeranDef[];
  salesmen: { kode: string; nama: string; channel: string }[];
  sendiri: boolean;
  err: string | null;
}) {
  const set = (p: Partial<Draf>) => setDraf({ ...draf, ...p });
  const [cari, setCari] = useState('');
  const pilihSR = (kode: string) => {
    const s = salesmen.find((x) => x.kode === kode);
    set({ kode_salesman: kode, nama: draf.nama || s?.nama || '', peran_id: s ? (s.channel === 'MT' ? 'sales_mt' : 'sales_gt') : draf.peran_id });
  };
  const daftarSR = salesmen.filter((s) => !cari || `${s.kode} ${s.nama}`.toLowerCase().includes(cari.toLowerCase()));
  const semua = !draf.sebagian;
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => e.preventDefault()}
      noValidate
    >
      {!draf.id && (
        <Field label="Jenis akun">
          <Segmented
            block
            label="Jenis akun"
            value={draf.jenis}
            onChange={(jenis) => set({ jenis, peran_id: jenis === 'sales' ? 'sales_gt' : peran.find((p) => p.id === 'admin')?.id ?? draf.peran_id })}
            options={[
              { value: 'admin', label: 'Admin / Supervisor' },
              { value: 'sales', label: 'Salesman' },
            ]}
          />
        </Field>
      )}
      {draf.jenis === 'sales' ? (
        <Field label="Kode SR" hint="Salesman login dengan kode ini + PIN 6 angka.">
          <Select label="Kode SR" value={draf.kode_salesman} onChange={pilihSR} className="w-full">
            <option value="">Pilih salesman…</option>
            {salesmen.map((s) => (
              <option key={s.kode} value={s.kode}>
                {s.kode} · {s.nama} ({s.channel})
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <Field label="Email" hint="Dipakai untuk login.">
          <Input aria-label="Email" type="email" value={draf.email} onChange={(e) => set({ email: e.target.value })} placeholder="nama@perusahaan.co.id" />
        </Field>
      )}
      <Field label="Nama">
        <Input aria-label="Nama" value={draf.nama} onChange={(e) => set({ nama: e.target.value })} />
      </Field>
      <Field label="Peran" hint={sendiri ? 'Peran akun sendiri tidak bisa diganti.' : undefined}>
        <Select label="Peran" value={draf.peran_id} onChange={(peran_id) => set({ peran_id })} className={cn('w-full', sendiri && 'pointer-events-none opacity-60')}>
          {peran.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nama}
            </option>
          ))}
        </Select>
      </Field>
      {draf.jenis === 'admin' && (
        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">Lingkup data salesman</p>
          <label className="flex items-center gap-2 text-sm text-slate-800">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={semua} onChange={(e) => set({ sebagian: !e.target.checked })} />
            Semua salesman
          </label>
          {!semua && (
            <div className="mt-2 rounded-xl border border-slate-200">
              <div className="border-b border-slate-100 p-2">
                <Input type="search" aria-label="Cari salesman" placeholder="Cari kode / nama…" value={cari} onChange={(e) => setCari(e.target.value)} className="h-9" />
              </div>
              <div className="max-h-56 space-y-0.5 overflow-auto p-2">
                {daftarSR.map((s) => (
                  <label key={s.kode} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-brand-600"
                      checked={draf.lingkup.includes(s.kode)}
                      onChange={(e) => set({ lingkup: e.target.checked ? [...draf.lingkup, s.kode] : draf.lingkup.filter((k) => k !== s.kode) })}
                    />
                    <span className="font-mono text-xs text-slate-500">{s.kode}</span>
                    <span className="flex-1 truncate">{s.nama}</span>
                    <span className="text-xs text-slate-400">{s.channel}</span>
                  </label>
                ))}
              </div>
              <p className="border-t border-slate-100 px-3 py-1.5 text-xs text-slate-500">{draf.lingkup.length} salesman dipilih. Dashboard & laporan hanya menampilkan data mereka.</p>
            </div>
          )}
        </div>
      )}
      {!draf.id && (
        <Field label={draf.jenis === 'sales' ? 'PIN awal (opsional)' : 'Password awal (opsional)'} hint="Kosongkan untuk dibuat otomatis. Wajib diganti saat login pertama.">
          <Input
            aria-label="Sandi awal"
            value={draf.sandi}
            inputMode={draf.jenis === 'sales' ? 'numeric' : undefined}
            maxLength={draf.jenis === 'sales' ? 6 : 128}
            onChange={(e) => set({ sandi: draf.jenis === 'sales' ? e.target.value.replace(/\D/g, '') : e.target.value })}
          />
        </Field>
      )}
      {draf.id && !sendiri && (
        <label className="flex items-center gap-2 text-sm text-slate-800">
          <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={draf.aktif} onChange={(e) => set({ aktif: e.target.checked })} />
          Akun aktif (nonaktif = langsung keluar dari semua perangkat)
        </label>
      )}
      {err && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {err}
        </p>
      )}
    </form>
  );
}

function TampilRahasia({ nama, login, sandi, pin }: { nama: string; login: string; sandi: string; pin: boolean }) {
  const toast = useToast();
  const teks = `Login Sales Visit\n${pin ? 'Kode SR' : 'Email'}: ${login}\n${pin ? 'PIN' : 'Password'} sementara: ${sandi}\nWajib diganti saat login pertama.`;
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-700">
        Berikan ke <b>{nama}</b>. {pin ? 'PIN' : 'Password'} ini hanya ditampilkan <b>sekali</b> dan wajib diganti saat login pertama.
      </p>
      <dl className="rounded-xl bg-slate-50 p-4 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">{pin ? 'Kode SR' : 'Email'}</dt>
          <dd className="font-mono font-semibold text-slate-900">{login}</dd>
        </div>
        <div className="mt-1 flex justify-between gap-2">
          <dt className="text-slate-500">{pin ? 'PIN' : 'Password'} sementara</dt>
          <dd className="font-mono text-lg font-bold tracking-widest text-slate-900">{sandi}</dd>
        </div>
      </dl>
      <Button
        variant="secondary"
        block
        onClick={() => {
          navigator.clipboard?.writeText(teks).then(
            () => toast('Disalin, tinggal tempel ke chat'),
            () => toast('Gagal menyalin', 'error'),
          );
        }}
      >
        <Copy size={16} /> Salin untuk dikirim
      </Button>
    </div>
  );
}

const LABEL_AUDIT: Record<string, string> = {
  login: 'Login',
  'ganti-sandi': 'Ganti PIN/password',
  upload: 'Upload Excel',
  seed: 'Seed data awal',
  tambah: 'Tambah',
  ubah: 'Ubah',
  hapus: 'Hapus',
  'hapus-semua': 'Reset data',
  reset: 'Reset aktivitas',
  'reset-sandi': 'Reset PIN/password',
  'tambah-massal': 'Buat akun massal',
};

function LogAktivitas() {
  const [log, setLog] = useState<Audit[] | null>(null);
  const [buka, setBuka] = useState(false);
  useEffect(() => {
    if (buka && !log) api<Audit[]>('/api/audit').then(setLog, () => setLog([]));
  }, [buka, log]);
  return (
    <details className="mt-4 rounded-2xl border border-slate-200/80 bg-white shadow-card" onToggle={(e) => setBuka((e.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-slate-800">Log aktivitas admin (200 terakhir)</summary>
      <div className="max-h-96 overflow-auto border-t border-slate-100">
        {!log ? (
          <p className="p-4 text-sm text-slate-500">Memuat…</p>
        ) : !log.length ? (
          <p className="p-4 text-sm text-slate-500">Belum ada catatan.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {log.map((a, i) => (
                <tr key={i}>
                  <td className="whitespace-nowrap px-4 py-1.5 text-xs text-slate-500">{formatTimestamp(a.waktu)}</td>
                  <td className="px-2 py-1.5 text-slate-700">{a.pengguna}</td>
                  <td className="px-2 py-1.5 font-medium text-slate-900">{LABEL_AUDIT[a.aksi] ?? a.aksi}</td>
                  <td className="px-4 py-1.5 text-slate-600">{a.objek.replace(/^data:/, 'Data ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </details>
  );
}
