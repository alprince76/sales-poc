/** Peran & Akses: pilih peran → matriks Menu × (Tambah/Lihat/Ubah/Hapus) seperti RBAC Aralia. */
import { Lock, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { api, useAuth, useIzin } from '../../auth';
import { Button, Card, cn, EmptyState, Field, Input, Sheet, useToast } from '../../components/ui';
import { AKSI, ID_SUPER_ADMIN, LABEL_AKSI, MENU, normalIzin, type Aksi, type Izin, type PeranDef } from '../../lib/akses';
import { AdminPage } from './AdminLayout';

const salinIzin = (i: Izin): Izin => JSON.parse(JSON.stringify(i)) as Izin;
const samaIzin = (a: Izin, b: Izin) => JSON.stringify(normalIzin(a)) === JSON.stringify(normalIzin(b));

/** Ubah satu sel; Tambah/Ubah/Hapus otomatis + Lihat; Lihat dicabut → semua aksi menu itu dicabut. */
function setSel(izin: Izin, menu: string, aksi: Aksi, nilai: boolean): Izin {
  const m = MENU.find((x) => x.id === menu)!;
  const cur = { ...(izin[menu] ?? {}) };
  if (aksi === 'lihat' && !nilai) return { ...izin, [menu]: {} };
  cur[aksi] = nilai;
  if (nilai && aksi !== 'lihat' && m.aksi.includes('lihat')) cur.lihat = true;
  return { ...izin, [menu]: cur };
}

export function PeranPage() {
  const { sesi, muatUlang } = useAuth();
  const izin = useIzin('pengguna.peran');
  const toast = useToast();
  const [daftar, setDaftar] = useState<PeranDef[] | null>(null);
  const [pilih, setPilih] = useState<string | null>(null);
  const [draf, setDraf] = useState<Izin>({});
  const [simpan, setSimpan] = useState(false);
  const [form, setForm] = useState<{ mode: 'tambah' | 'ubah'; nama: string } | null>(null);
  const [errForm, setErrForm] = useState<string | null>(null);

  const muat = useCallback(async () => {
    const d = await api<PeranDef[]>('/api/peran');
    setDaftar(d);
    return d;
  }, []);
  useEffect(() => {
    muat()
      .then((d) => setPilih((p) => p ?? d.find((x) => x.id !== ID_SUPER_ADMIN)?.id ?? d[0]?.id ?? null))
      .catch((e) => toast(e instanceof Error ? e.message : 'Gagal memuat peran', 'error'));
  }, [muat, toast]);

  const peran = daftar?.find((p) => p.id === pilih) ?? null;
  useEffect(() => {
    if (peran) setDraf(salinIzin(peran.izin));
  }, [peran]);

  const kunci = !peran || peran.sistem || !izin.ubah;
  const berubah = !!peran && !peran.sistem && !samaIzin(draf, peran.izin);
  const grup = useMemo(() => {
    const g: { grup: string; menu: typeof MENU }[] = [];
    for (const m of MENU) {
      const last = g[g.length - 1];
      if (last?.grup === m.grup) last.menu.push(m);
      else g.push({ grup: m.grup, menu: [m] });
    }
    return g;
  }, []);

  const pindah = (id: string) => {
    if (berubah && !window.confirm('Perubahan akses belum disimpan. Buang perubahan?')) return;
    setPilih(id);
  };

  const simpanIzin = async () => {
    if (!peran) return;
    setSimpan(true);
    try {
      await api(`/api/peran/${encodeURIComponent(peran.id)}`, 'PUT', { izin: draf });
      await muat();
      toast(`Akses ${peran.nama} disimpan. Berlaku saat pengguna membuka halaman berikutnya.`);
      if (sesi?.peran.id === peran.id) void muatUlang();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal menyimpan', 'error');
    } finally {
      setSimpan(false);
    }
  };

  const kirimForm = async () => {
    if (!form) return;
    setErrForm(null);
    const nama = form.nama.trim();
    if (!nama) return setErrForm('Nama peran wajib diisi.');
    try {
      if (form.mode === 'tambah') {
        const p = await api<PeranDef>('/api/peran', 'POST', { nama, izin: {} });
        await muat();
        setPilih(p.id);
        toast(`Peran ${nama} dibuat. Centang menu yang boleh diakses, lalu Simpan.`);
      } else if (peran) {
        await api(`/api/peran/${encodeURIComponent(peran.id)}`, 'PUT', { nama });
        await muat();
        toast('Nama peran diubah');
      }
      setForm(null);
    } catch (e) {
      setErrForm(e instanceof Error ? e.message : 'Gagal menyimpan');
    }
  };

  const hapus = async () => {
    if (!peran || !window.confirm(`Hapus peran ${peran.nama}?`)) return;
    try {
      await api(`/api/peran/${encodeURIComponent(peran.id)}`, 'DELETE');
      const d = await muat();
      setPilih(d.find((x) => x.id !== ID_SUPER_ADMIN)?.id ?? null);
      toast(`Peran ${peran.nama} dihapus`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal menghapus', 'error');
    }
  };

  const nilai = (menu: string, a: Aksi) => (peran?.sistem ? true : !!draf[menu]?.[a]);
  const semuaBaris = (menu: string) => MENU.find((m) => m.id === menu)!.aksi.every((a) => nilai(menu, a));
  const setBaris = (menu: string, v: boolean) =>
    setDraf((d) => ({ ...d, [menu]: v ? Object.fromEntries(MENU.find((m) => m.id === menu)!.aksi.map((a) => [a, true])) : {} }));
  const semuaKolom = (a: Aksi) => MENU.filter((m) => m.aksi.includes(a)).every((m) => nilai(m.id, a));
  const setKolom = (a: Aksi, v: boolean) =>
    setDraf((d) => MENU.filter((m) => m.aksi.includes(a)).reduce((acc, m) => setSel(acc, m.id, a, v), { ...d }));

  return (
    <AdminPage
      title="Peran & Akses"
      description="Atur menu yang boleh dibuka tiap peran dan tindakan yang boleh dilakukan. Izin juga dicek di server."
      actions={
        izin.tambah ? (
          <Button
            onClick={() => {
              setErrForm(null);
              setForm({ mode: 'tambah', nama: '' });
            }}
          >
            <Plus size={16} /> Tambah peran
          </Button>
        ) : undefined
      }
    >
      {!daftar ? (
        <Card className="p-6 text-sm text-slate-500">Memuat peran…</Card>
      ) : (
        <Card className="p-4 sm:p-5">
          <p className="mb-2 text-sm font-semibold text-slate-800">Peran</p>
          <div role="radiogroup" aria-label="Peran" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {daftar.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={p.id === pilih}
                onClick={() => pindah(p.id)}
                className={cn(
                  'flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors',
                  p.id === pilih ? 'border-brand-500 bg-brand-50 text-brand-900' : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50',
                )}
              >
                <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2', p.id === pilih ? 'border-brand-600' : 'border-slate-300')}>
                  {p.id === pilih && <span className="h-2.5 w-2.5 rounded-full bg-brand-600" />}
                </span>
                <span className="flex-1 truncate uppercase tracking-wide">{p.nama}</span>
                {p.sistem && <Lock size={14} className="text-slate-400" aria-label="Terkunci" />}
              </button>
            ))}
          </div>

          {peran && (
            <>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-semibold text-slate-900">Akses {peran.nama}</h2>
                  <p className="text-xs text-slate-500">
                    {peran.sistem
                      ? 'Super Admin selalu punya semua akses, termasuk menu baru. Tidak bisa diubah.'
                      : 'Mencentang Tambah, Ubah, atau Hapus otomatis ikut mencentang Lihat.'}
                  </p>
                </div>
                {!peran.sistem && (
                  <div className="flex gap-2">
                    {izin.ubah && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setErrForm(null);
                          setForm({ mode: 'ubah', nama: peran.nama });
                        }}
                      >
                        <Pencil size={14} /> Ubah nama
                      </Button>
                    )}
                    {izin.hapus && (
                      <Button size="sm" variant="secondary" onClick={() => void hapus()}>
                        <Trash2 size={14} /> Hapus
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="bg-brand-600 text-left text-white">
                      <th className="px-4 py-3 font-semibold">Menu</th>
                      <th className="px-4 py-3 font-semibold">Sub Menu</th>
                      <th className="w-32 px-3 py-3 text-center font-semibold">Centang Semua</th>
                      {AKSI.map((a) => (
                        <th key={a} className="w-28 px-3 py-3 text-center font-semibold">
                          <label className="inline-flex cursor-pointer flex-col items-center gap-1">
                            {LABEL_AKSI[a]}
                            <input
                              type="checkbox"
                              aria-label={`Centang semua ${LABEL_AKSI[a]}`}
                              className="h-4 w-4 accent-white"
                              checked={semuaKolom(a)}
                              disabled={kunci}
                              onChange={(e) => setKolom(a, e.target.checked)}
                            />
                          </label>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {grup.map((g) => (
                      <Fragment key={g.grup}>
                        {g.menu.map((m, i) => (
                          <tr key={m.id} className={cn('border-t border-slate-100', i === 0 && 'border-slate-200')}>
                            <td className="px-4 py-2.5 align-top font-medium text-slate-800">{i === 0 ? g.grup : <span className="text-slate-300">-</span>}</td>
                            <td className="px-4 py-2.5">
                              <span className="block text-slate-900">{m.nama}</span>
                              <span className="block text-xs text-slate-500">{g.grup}</span>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <input
                                type="checkbox"
                                aria-label={`Centang semua ${m.nama}`}
                                className="h-5 w-5 accent-brand-600"
                                checked={semuaBaris(m.id)}
                                disabled={kunci}
                                onChange={(e) => setBaris(m.id, e.target.checked)}
                              />
                            </td>
                            {AKSI.map((a) =>
                              m.aksi.includes(a) ? (
                                <td key={a} className="px-3 py-2.5 text-center">
                                  <input
                                    type="checkbox"
                                    aria-label={`${LABEL_AKSI[a]} ${m.nama}`}
                                    title={m.ket?.[a]}
                                    className="h-5 w-5 accent-brand-600"
                                    checked={nilai(m.id, a)}
                                    disabled={kunci}
                                    onChange={(e) => setDraf((d) => setSel(d, m.id, a, e.target.checked))}
                                  />
                                  {m.ket?.[a] && <span className="mt-0.5 block text-[10px] leading-tight text-slate-400">{m.ket[a]}</span>}
                                </td>
                              ) : (
                                <td key={a} className="px-3 py-2.5 text-center text-slate-300" aria-label="Tidak berlaku">
                                  –
                                </td>
                              ),
                            )}
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

              {berubah && (
                <div className="sticky bottom-3 z-10 mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-card">
                  <p className="text-sm text-amber-900">Ada perubahan akses yang belum disimpan.</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setDraf(salinIzin(peran.izin))} disabled={simpan}>
                      Batal
                    </Button>
                    <Button size="sm" onClick={() => void simpanIzin()} disabled={simpan}>
                      <Save size={14} /> {simpan ? 'Menyimpan…' : 'Simpan'}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
          {daftar.length === 0 && <EmptyState title="Belum ada peran" />}
        </Card>
      )}

      <Sheet
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.mode === 'tambah' ? 'Tambah peran' : 'Ubah nama peran'}
        footer={
          <Button block onClick={() => void kirimForm()}>
            Simpan
          </Button>
        }
      >
        {form && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void kirimForm();
            }}
          >
            <Field label="Nama peran" error={errForm}>
              <Input aria-label="Nama peran" autoFocus value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} placeholder="mis. Supervisor Bandung" />
            </Field>
          </form>
        )}
      </Sheet>
    </AdminPage>
  );
}
