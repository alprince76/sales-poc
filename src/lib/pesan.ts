/** Ubah error teknis (HTTP, SheetJS, dll.) jadi pesan yang dimengerti user + saran langkah berikutnya. Pure. */
import { RemoteError } from './remote';

export interface PesanGagal {
  /** Apa yang terjadi, singkat. */
  judul: string;
  /** Apa yang bisa dilakukan user. */
  saran: string;
}

export type Aksi = 'upload' | 'simpan' | 'hapus' | 'reset' | 'seed' | 'muat';

const KATA: Record<Aksi, string> = {
  upload: 'Upload gagal',
  simpan: 'Gagal menyimpan',
  hapus: 'Gagal menghapus',
  reset: 'Reset gagal',
  seed: 'Isi data awal gagal',
  muat: 'Data gagal dimuat',
};

/** Error dari server/jaringan → pesan ramah. Data tidak berubah kecuali disebut lain. */
export function pesanGagal(e: unknown, aksi: Aksi): PesanGagal {
  const judul = KATA[aksi];
  const status = e instanceof RemoteError ? e.status : -1;
  switch (true) {
    case status === 0:
      return { judul: `${judul}: tidak bisa terhubung ke server`, saran: 'Cek koneksi internet, lalu coba lagi. Data belum berubah.' };
    case status === 413:
      return {
        judul: `${judul}: file terlalu besar`,
        saran: 'Batas sekali upload sekitar 6 MB. Hapus kolom yang tidak dipakai (cukup kolom di Template), lalu upload lagi.',
      };
    case status === 409:
      return { judul: `${judul}: data baru saja diubah admin lain`, saran: 'Halaman sudah dimuat ulang dengan data terbaru. Silakan ulangi.' };
    case status === 404 && aksi !== 'muat':
      return { judul: `${judul}: baris ini sudah diubah atau dihapus orang lain`, saran: 'Daftar sudah dimuat ulang. Cari barisnya lagi lalu ulangi.' };
    case status === 503:
      return { judul: `${judul}: database belum tersambung`, saran: 'Hubungi tim teknis untuk memeriksa pengaturan database. Data belum berubah.' };
    case status === 400:
      return {
        judul: `${judul}: data tidak terbaca oleh server`,
        saran: 'Coba sekali lagi. Bila tetap gagal, unduh Template, salin datanya ke sana, lalu upload file Template itu.',
      };
    case status === 504 || status === 502:
      return { judul: `${judul}: server terlalu lama merespons`, saran: 'Tunggu sebentar lalu coba lagi. Bila file besar, hapus kolom yang tidak dipakai.' };
    case status >= 500:
      return { judul: `${judul}: server sedang bermasalah`, saran: 'Tunggu sebentar lalu coba lagi. Data belum berubah.' };
    default:
      return { judul, saran: 'Coba lagi. Bila tetap gagal, muat ulang halaman.' };
  }
}

export const teksGagal = (e: unknown, aksi: Aksi) => {
  const p = pesanGagal(e, aksi);
  return `${p.judul}. ${p.saran}`;
};

const EKSTENSI_OK = /\.(xlsx|xlsm|xls|csv|ods)$/i;

/** Cek jenis file sebelum dibaca. null = boleh. */
export function cekJenisFile(nama: string): PesanGagal | null {
  if (EKSTENSI_OK.test(nama)) return null;
  const ext = nama.includes('.') ? nama.split('.').pop()!.toUpperCase() : 'tanpa ekstensi';
  return {
    judul: `File ${ext} belum bisa dibaca`,
    saran: 'Pakai file Excel (.xlsx / .xls) atau CSV. Bila datanya PDF/gambar, salin dulu ke Excel atau pakai Template.',
  };
}

/** Error saat membuka file (SheetJS) → pesan ramah. */
export function pesanBacaFile(e: unknown): PesanGagal {
  const m = (e instanceof Error ? e.message : String(e)).toLowerCase();
  if (/password|encrypt|protected|cfb/.test(m))
    return { judul: 'File dikunci password', saran: 'Buka di Excel, hapus password-nya, simpan, lalu upload lagi.' };
  return {
    judul: 'File tidak bisa dibuka',
    saran: 'Buka file di Excel lalu pilih Simpan Sebagai → Excel Workbook (.xlsx), kemudian upload lagi. Atau pakai Template.',
  };
}
