/** v12: pesan gagal ramah (tanpa istilah teknis) + percobaan ulang otomatis. */
import { describe, expect, it } from 'vitest';
import { handle } from '../../netlify/lib/handler';
import { memoryStore } from '../../netlify/lib/store';
import { cekJenisFile, pesanBacaFile, pesanGagal } from './pesan';
import { ambilData, RemoteError, simpanData } from './remote';
import { ringkasError } from './parse';

const TEKNIS = /json|body|http|gzip|database_url|undefined|null|error:|\b\d{3}\b/i;

describe('pesan gagal', () => {
  it('setiap status → judul + saran tanpa istilah teknis', () => {
    for (const st of [0, 400, 404, 409, 413, 500, 502, 503, 504, 418]) {
      const p = pesanGagal(new RemoteError('Body bukan JSON yang valid', st), 'upload');
      expect(p.judul).toMatch(/^Upload gagal/);
      expect(`${p.judul} ${p.saran}`, String(st)).not.toMatch(TEKNIS);
    }
    expect(pesanGagal(new RemoteError('x', 413), 'upload').judul).toContain('terlalu besar');
    expect(pesanGagal(new RemoteError('x', 0), 'simpan').judul).toContain('tidak bisa terhubung');
    expect(pesanGagal(new TypeError('Failed to fetch'), 'hapus').judul).toBe('Gagal menghapus');
  });

  it('jenis file & file rusak', () => {
    expect(cekJenisFile('data.xlsx')).toBeNull();
    expect(cekJenisFile('Data.CSV')).toBeNull();
    expect(cekJenisFile('laporan.pdf')?.judul).toBe('File PDF belum bisa dibaca');
    expect(pesanBacaFile(new Error('File is password-protected')).judul).toBe('File dikunci password');
    expect(pesanBacaFile(new Error('Unsupported ZIP Compression method NaN')).saran).not.toMatch(/zip/i);
  });

  it('ringkasError mengelompokkan alasan yang sama', () => {
    const g = ringkasError([
      { baris: 2, alasan: 'Kode toko kosong; Limit kredit harus angka, bukan "abc"' },
      { baris: 3, alasan: 'Kode toko kosong' },
      { baris: 4, alasan: 'Limit kredit harus angka, bukan "x"' },
      { baris: 5, alasan: 'Tanggal faktur bukan tanggal "besok". Tulis seperti 09-11-2026 atau 2026-11-09' },
      { baris: 6, alasan: 'No faktur F1 sudah ada di baris sebelumnya' },
      { baris: 7, alasan: 'No faktur F2 sudah ada di baris sebelumnya' },
    ]);
    expect(g).toEqual([
      { alasan: 'Kode toko kosong', jumlah: 2, contohBaris: [2, 3] },
      { alasan: 'Limit kredit harus angka', jumlah: 2, contohBaris: [2, 4] },
      { alasan: 'No faktur sudah ada di baris sebelumnya', jumlah: 2, contohBaris: [6, 7] },
      { alasan: 'Tanggal faktur bukan tanggal', jumlah: 1, contohBaris: [5] },
    ]);
  });
});

describe('simpan: percobaan ulang otomatis untuk gangguan sementara', () => {
  it('gagal 2× (jaringan putus, 502 HTML) lalu berhasil → tersimpan', async () => {
    const store = memoryStore();
    let n = 0;
    const api: typeof fetch = async (input, init) => {
      n++;
      if (n === 1) throw new TypeError('Failed to fetch');
      if (n === 2) return new Response('<html>Bad gateway</html>', { status: 502, headers: { 'content-type': 'text/html' } });
      return handle(new Request(`http://x${String(input)}`, init), store);
    };
    const rows = [{ kode_sku: '1', satuan: 'Pcs', moq: 2 }];
    expect((await simpanData('rules', rows, api)).jumlah).toBe(1);
    expect(n).toBe(3);
    expect(await ambilData('rules', (i, o) => handle(new Request(`http://x${String(i)}`, o), store))).toEqual(rows);
  }, 10000);

  it('413 (file terlalu besar) tidak diulang & status terbawa walau respons HTML', async () => {
    let n = 0;
    const api: typeof fetch = async () => {
      n++;
      return new Response('<html>Payload Too Large</html>', { status: 413, headers: { 'content-type': 'text/html' } });
    };
    await expect(simpanData('rules', [], api)).rejects.toMatchObject({ status: 413 });
    expect(n).toBe(1);
  });
});
