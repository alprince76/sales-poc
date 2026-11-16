import { ClipboardList, Eye, EyeOff, LogOut, ShieldAlert, Smartphone, UserCog } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { Button, Field, Input, Segmented } from '../components/ui';
import { bolehPath, halamanAwal } from '../lib/akses';
import { RemoteError } from '../lib/remote';

const KEY_LOGIN = 'svdi-v2-login-terakhir';
type Mode = 'sales' | 'admin';
const bacaTerakhir = (): { mode: Mode; kode: string; email: string } => {
  try {
    return { mode: 'sales', kode: '', email: '', ...JSON.parse(localStorage.getItem(KEY_LOGIN) ?? '{}') };
  } catch {
    return { mode: 'sales', kode: '', email: '' };
  }
};

const pesanError = (e: unknown) =>
  e instanceof RemoteError ? (e.status === 0 ? 'Tidak bisa terhubung ke server. Cek koneksi internet lalu coba lagi.' : e.message) : 'Terjadi kesalahan. Coba lagi.';

function Kerangka({ children, judul, sub }: { children: ReactNode; judul: string; sub?: string }) {
  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 px-4 py-10">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white">
            <ClipboardList size={22} />
          </span>
          <div>
            <h1 className="text-xl font-bold leading-tight text-slate-900">{judul}</h1>
            {sub && <p className="text-sm text-slate-500">{sub}</p>}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">{children}</div>
      </div>
    </div>
  );
}

function Sandi({ value, onChange, label, pin, autoComplete, autoFocus }: { value: string; onChange: (v: string) => void; label: string; pin: boolean; autoComplete: string; autoFocus?: boolean }) {
  const [lihat, setLihat] = useState(false);
  return (
    <Field label={label}>
      <div className="relative">
        <Input
          aria-label={label}
          type={lihat ? 'text' : 'password'}
          inputMode={pin ? 'numeric' : undefined}
          pattern={pin ? '[0-9]*' : undefined}
          maxLength={pin ? 6 : 128}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(pin ? e.target.value.replace(/\D/g, '').slice(0, 6) : e.target.value)}
          className={pin ? 'pr-11 text-lg tracking-[0.4em]' : 'pr-11'}
        />
        <button
          type="button"
          onClick={() => setLihat((x) => !x)}
          aria-label={lihat ? 'Sembunyikan' : 'Tampilkan'}
          className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700"
        >
          {lihat ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </Field>
  );
}

export function LoginPage() {
  const { masuk } = useAuth();
  const nav = useNavigate();
  const [q] = useSearchParams();
  const awal = bacaTerakhir();
  const [mode, setMode] = useState<Mode>(awal.mode);
  const [kode, setKode] = useState(awal.kode);
  const [email, setEmail] = useState(awal.email);
  const [sandi, setSandi] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [jalan, setJalan] = useState(false);

  const kirim = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (mode === 'sales' && (!kode.trim() || sandi.length !== 6)) return setErr('Isi kode SR dan PIN 6 angka.');
    if (mode === 'admin' && (!email.trim() || !sandi)) return setErr('Isi email dan password.');
    setJalan(true);
    try {
      const s = await masuk(mode === 'sales' ? { kode_salesman: kode.trim(), pin: sandi } : { email: email.trim(), password: sandi });
      try {
        localStorage.setItem(KEY_LOGIN, JSON.stringify({ mode, kode: kode.trim(), email: email.trim() }));
      } catch {
        /* abaikan */
      }
      const ke = q.get('ke');
      // Tujuan dari tautan sebelumnya hanya dipakai bila akun ini memang boleh membukanya.
      nav(ke && ke.startsWith('/') && !ke.startsWith('/login') && bolehPath(s.izin, ke.split('?')[0]) ? ke : halamanAwal(s.izin), { replace: true });
    } catch (e2) {
      setErr(pesanError(e2));
      setSandi('');
    } finally {
      setJalan(false);
    }
  };

  return (
    <Kerangka judul="Sales Visit" sub="Masuk untuk melanjutkan">
      <Segmented
        block
        label="Jenis akun"
        value={mode}
        onChange={(m) => {
          setMode(m);
          setErr(null);
          setSandi('');
        }}
        options={[
          { value: 'sales', label: 'Salesman' },
          { value: 'admin', label: 'Admin' },
        ]}
      />
      <form onSubmit={(e) => void kirim(e)} className="mt-4 space-y-4" noValidate>
        {mode === 'sales' ? (
          <>
            <Field label="Kode SR">
              <Input aria-label="Kode SR" value={kode} onChange={(e) => setKode(e.target.value.toUpperCase())} autoComplete="username" autoCapitalize="characters" placeholder="mis. 000033" autoFocus={!kode} />
            </Field>
            <Sandi label="PIN" pin value={sandi} onChange={setSandi} autoComplete="current-password" autoFocus={!!kode} />
          </>
        ) : (
          <>
            <Field label="Email">
              <Input aria-label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" placeholder="nama@perusahaan.co.id" autoFocus={!email} />
            </Field>
            <Sandi label="Password" pin={false} value={sandi} onChange={setSandi} autoComplete="current-password" autoFocus={!!email} />
          </>
        )}
        {err && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {err}
          </p>
        )}
        <Button type="submit" block size="lg" disabled={jalan}>
          {jalan ? 'Memeriksa…' : 'Masuk'}
        </Button>
        <p className="flex items-start gap-1.5 text-xs text-slate-500">
          {mode === 'sales' ? <Smartphone size={14} className="mt-px shrink-0" /> : <UserCog size={14} className="mt-px shrink-0" />}
          {mode === 'sales' ? 'Lupa PIN? Minta admin untuk reset PIN Anda.' : 'Lupa password? Minta Super Admin untuk reset password.'}
        </p>
      </form>
    </Kerangka>
  );
}

/** Ganti PIN/password. `wajib` = login pertama / setelah reset (tidak bisa dilewati). */
export function GantiSandiPage({ wajib = false }: { wajib?: boolean }) {
  const { sesi, gantiSandi, keluar } = useAuth();
  const nav = useNavigate();
  const pin = !!sesi?.pengguna.kode_salesman;
  const [lama, setLama] = useState('');
  const [baru, setBaru] = useState('');
  const [ulang, setUlang] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [jalan, setJalan] = useState(false);
  const [ok, setOk] = useState(false);
  const kata = pin ? 'PIN' : 'password';

  const kirim = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (pin ? !/^\d{6}$/.test(baru) : baru.length < 8) return setErr(pin ? 'PIN baru harus 6 angka.' : 'Password baru minimal 8 karakter.');
    if (pin && /^(\d)\1{5}$|^(012345|123456|234567|345678|456789|987654|876543|654321)$/.test(baru)) return setErr('PIN terlalu mudah ditebak. Hindari angka berulang atau berurutan.');
    if (baru !== ulang) return setErr(`Ulangi ${kata} baru tidak sama.`);
    setJalan(true);
    try {
      await gantiSandi(lama, baru);
      setOk(true);
      if (!wajib) setTimeout(() => nav(-1), 900);
    } catch (e2) {
      setErr(pesanError(e2));
    } finally {
      setJalan(false);
    }
  };

  return (
    <Kerangka judul={`Ganti ${kata}`} sub={wajib ? `Demi keamanan, buat ${kata} baru sebelum mulai.` : sesi?.pengguna.nama}>
      <form onSubmit={(e) => void kirim(e)} className="space-y-4" noValidate>
        <Sandi label={wajib ? `${pin ? 'PIN' : 'Password'} sementara` : `${pin ? 'PIN' : 'Password'} lama`} pin={pin} value={lama} onChange={setLama} autoComplete="current-password" autoFocus />
        <Sandi label={`${pin ? 'PIN' : 'Password'} baru`} pin={pin} value={baru} onChange={setBaru} autoComplete="new-password" />
        <Sandi label={`Ulangi ${kata} baru`} pin={pin} value={ulang} onChange={setUlang} autoComplete="new-password" />
        {err && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {err}
          </p>
        )}
        {ok && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{pin ? 'PIN' : 'Password'} berhasil diganti.</p>}
        <Button type="submit" block size="lg" disabled={jalan || ok}>
          {jalan ? 'Menyimpan…' : `Simpan ${kata} baru`}
        </Button>
        {wajib ? (
          <Button variant="ghost" block onClick={() => void keluar()}>
            <LogOut size={16} /> Keluar
          </Button>
        ) : (
          <Button variant="ghost" block onClick={() => nav(-1)}>
            Batal
          </Button>
        )}
      </form>
    </Kerangka>
  );
}

export function AksesDitolak({ menu }: { menu?: string }) {
  const { sesi, keluar } = useAuth();
  const nav = useNavigate();
  const tujuan = halamanAwal(sesi?.izin);
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
        <ShieldAlert size={24} />
      </span>
      <p className="mt-3 font-semibold text-slate-900">Tidak punya akses ke {menu ? `menu ${menu}` : 'halaman ini'}</p>
      <p className="mt-1 text-sm text-slate-600">
        Akun {sesi?.pengguna.nama} ({sesi?.peran.nama}) belum diberi izin. Minta admin menambahkan akses di menu Peran &amp; Akses.
      </p>
      <div className="mt-4 flex gap-2">
        {tujuan !== '/akses-ditolak' && <Button onClick={() => nav(tujuan)}>Ke halaman saya</Button>}
        <Button variant="secondary" onClick={() => void keluar()}>
          Keluar
        </Button>
      </div>
    </div>
  );
}
