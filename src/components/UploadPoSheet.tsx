/**
 * Upload PO dari Excel di aplikasi sales.
 * GT: satu file berisi PO banyak toko → pratinjau per toko → Submit semua (1 PO per toko).
 * MT: satu file untuk toko yang sedang dibuka → isi keranjang PO toko itu.
 */
import { AlertTriangle, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { normKode } from '../lib/billing';
import { formatTanggal } from '../lib/dates';
import { formatRupiah } from '../lib/format';
import { bacaWorkbook } from '../lib/parse';
import { cekJenisFile, pesanBacaFile } from '../lib/pesan';
import { bacaFilePo, templatePo, tokoSalesman, type ChannelPo, type HasilPo } from '../lib/uploadPo';
import { useSalesSession } from '../pages/sales/session';
import { newId, useData } from '../state';
import { Badge, Button, cn, Sheet, useToast } from './ui';

export function UploadPoSheet({ open, onClose, channel, kodeToko }: { open: boolean; onClose: () => void; channel: ChannelPo; kodeToko?: string }) {
  const { kode: sales, D } = useSalesSession();
  const { data, produk, produkMT, aktivitas, submitPO, tandai, setQtyKeranjang } = useData();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<string | null>(null);
  const [hasil, setHasil] = useState<HasilPo | null>(null);
  const [gagal, setGagal] = useState<string | null>(null);
  const [jalan, setJalan] = useState(false);
  const daftarProduk = channel === 'MT' ? produkMT : produk;
  const aktif = useMemo(() => daftarProduk.filter((p) => p.status_aktif !== false), [daftarProduk]);
  const tokoBoleh = useMemo(() => tokoSalesman(data.master, data.pjp, sales), [data.master, data.pjp, sales]);
  const outstanding = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of data.rovi) m.set(normKode(f.kode_toko), (m.get(normKode(f.kode_toko)) ?? 0) + f.sisa_tagihan);
    return m;
  }, [data.rovi]);

  const reset = () => {
    setFile(null);
    setHasil(null);
    setGagal(null);
    if (input.current) input.current.value = '';
  };
  const tutup = () => {
    reset();
    onClose();
  };

  const baca = async (f: File) => {
    reset();
    const salah = cekJenisFile(f.name);
    if (salah) return setGagal(`${salah.judul}. ${salah.saran}`);
    try {
      const wb = bacaWorkbook(new Uint8Array(await f.arrayBuffer()));
      const nama = wb.SheetNames.find((n) => n.toLowerCase() === 'po') ?? wb.SheetNames.find((n) => n.toLowerCase() !== 'petunjuk') ?? wb.SheetNames[0];
      const h = bacaFilePo(wb.Sheets[nama], {
        channel,
        kodeSalesman: sales,
        D,
        produk: daftarProduk,
        master: data.master,
        tokoBoleh,
        outstanding: (k) => outstanding.get(normKode(k)) ?? 0,
        sudahPo: (k, t) => aktivitas.po.some((p) => normKode(p.kode_toko) === k && p.tanggal === t),
        tokoTetap: kodeToko,
      });
      setFile(f.name);
      if (h.kolomHilang.length) return setGagal(`Kolom ${h.kolomHilang.join(', ')} tidak ditemukan. Pakai tombol "Unduh template" supaya formatnya pasti cocok.`);
      if (!h.totalBaris) return setGagal('Tidak ada baris PO di file. Pastikan data ada di bawah baris judul kolom.');
      setHasil(h);
    } catch (e) {
      const p = pesanBacaFile(e);
      setGagal(`${p.judul}. ${p.saran}`);
    }
  };

  const unduhTemplate = () => {
    const contohToko = [...tokoBoleh].slice(0, 2);
    const contohSku = aktif.slice(0, 2);
    const contoh =
      channel === 'GT'
        ? contohToko.flatMap((t) => contohSku.map((p, i) => ({ kode_toko: t, kode_sku: p.kode_sku, qty: (i + 1) * 3 })))
        : contohSku.map((p, i) => ({ kode_sku: p.kode_sku, qty: (i + 1) * 3 }));
    XLSX.writeFile(templatePo(channel, contoh, D), `Template_PO_${channel}${kodeToko ? `_${kodeToko}` : ''}.xlsx`);
  };

  const unduhError = () => {
    if (!hasil?.error.length) return;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hasil.error.map((e) => ({ 'Baris di file': e.baris, Masalah: e.alasan }))), 'Perlu_Diperbaiki');
    XLSX.writeFile(wb, `PO_perlu_diperbaiki.xlsx`);
  };

  const siap = hasil?.grup.filter((g) => !g.ditolak && g.items.length) ?? [];
  const totalSiap = siap.reduce((t, g) => t + g.total, 0);

  const simpan = () => {
    if (!hasil || !siap.length || jalan) return;
    setJalan(true);
    try {
      if (channel === 'MT' && kodeToko) {
        for (const i of siap[0].items) setQtyKeranjang(kodeToko, i.kode_sku, i.qty);
        toast(`${siap[0].items.length} SKU masuk keranjang${hasil.error.length ? ` · ${hasil.error.length} baris dilewati` : ''}`);
      } else {
        for (const g of siap) {
          submitPO({
            id: newId(),
            kode_toko: g.kode_toko,
            kode_salesman: sales,
            tanggal: g.tanggal,
            items: g.items,
            total: g.total,
            status: 'TERKIRIM',
            ...(g.peringatan.some((p) => /blokir/i.test(p)) ? { berpotensi_tidak_release: true } : {}),
            createdAt: new Date().toISOString(),
          });
          tandai(sales, g.kode_toko, g.tanggal, 'po', 'SELESAI');
        }
        toast(`${siap.length} PO tersimpan · ${formatRupiah(totalSiap)}`);
      }
      tutup();
    } finally {
      setJalan(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={tutup}
      title={channel === 'GT' ? 'Upload PO (Excel)' : 'Upload PO toko ini (Excel)'}
      footer={
        hasil ? (
          <Button block size="lg" onClick={simpan} disabled={!siap.length || jalan}>
            {channel === 'MT' ? `Masukkan ${siap[0]?.items.length ?? 0} SKU ke keranjang` : `Submit ${siap.length} PO · ${formatRupiah(totalSiap)}`}
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          {channel === 'GT'
            ? 'Satu file berisi PO semua toko hari ini (kolom kode_toko, kode_sku, qty). Dibuat 1 PO per toko atas nama Anda; harga mengikuti harga SKU.'
            : 'Satu file berisi SKU dan qty untuk toko ini. Item masuk keranjang, lalu lanjut Cek SKU Listed dan Submit seperti biasa.'}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={unduhTemplate}>
            <Download size={16} /> Template
          </Button>
          <Button onClick={() => input.current?.click()}>
            <Upload size={16} /> Pilih file
          </Button>
          <input
            ref={input}
            type="file"
            accept=".xlsx,.xlsm,.xls,.csv,.ods"
            className="sr-only"
            aria-label="File PO"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void baca(f);
            }}
          />
        </div>

        {gagal && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {gagal}
          </p>
        )}

        {hasil && (
          <>
            <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm">
              <FileSpreadsheet size={16} className="shrink-0 text-slate-500" />
              <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{file}</span>
              <span className="shrink-0 text-xs text-slate-500">
                {hasil.totalBaris} baris{hasil.dilewati ? ` · ${hasil.dilewati} judul/total dilewati` : ''}
              </span>
            </div>

            {hasil.error.length > 0 && (
              <div className="rounded-xl bg-red-50/70 p-3 text-xs text-slate-700">
                <p className="font-medium text-red-800">{hasil.error.length} baris tidak ikut (perlu diperbaiki)</p>
                <ul className="mt-1 max-h-32 space-y-0.5 overflow-auto">
                  {hasil.error.slice(0, 50).map((e) => (
                    <li key={e.baris}>
                      Baris {e.baris}: {e.alasan}
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={unduhError} className="mt-1.5 inline-flex items-center gap-1 font-semibold text-red-800 underline underline-offset-2">
                  <Download size={12} /> Unduh daftar
                </button>
              </div>
            )}

            <ul className="space-y-2">
              {hasil.grup.map((g) => (
                <li key={`${g.kode_toko}|${g.tanggal}`} className={cn('rounded-xl border p-3', g.ditolak ? 'border-red-200 bg-red-50/40' : 'border-slate-200')}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-slate-900">{g.nama_toko}</div>
                      <div className="text-xs text-slate-500">
                        {g.kode_toko} · {formatTanggal(g.tanggal)} · {g.items.length} SKU
                      </div>
                    </div>
                    <span className={cn('shrink-0 text-sm font-semibold tabular', g.ditolak ? 'text-slate-400 line-through' : 'text-slate-900')}>{formatRupiah(g.total)}</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-600">{g.items.map((i) => `${i.nama_sku} × ${i.qty}`).join(', ')}</div>
                  {g.ditolak && (
                    <p className="mt-1.5 flex items-start gap-1 text-xs font-medium text-red-700">
                      <AlertTriangle size={13} className="mt-px shrink-0" /> Tidak ikut disubmit: {g.ditolak}
                    </p>
                  )}
                  {g.peringatan.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {g.peringatan.map((p) => (
                        <Badge key={p} tone="orange" dot={false}>
                          {p}
                        </Badge>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Sheet>
  );
}
