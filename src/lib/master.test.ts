/** v9: Master Data (edit/hapus per baris), cek versi 409, pemilihan seed. */
import { describe, expect, it } from 'vitest';
import { handle } from '../../netlify/lib/handler';
import { pilihTipeSeed } from '../../netlify/lib/seed';
import { memoryStore } from '../../netlify/lib/store';
import { cekDuplikat, indeksJenis, jenisById, JENIS_DATA, terapkan } from './jenisData';
import { SEMUA_TIPE, validasiBaris } from './parse';
import { simpanData } from './remote';
import type { DataSet } from './types';

describe('validasiBaris = aturan upload Excel', () => {
  it('normKode, angka & bool dari string form', () => {
    const v = validasiBaris('rules', { kode_sku: ' 124024 ', satuan: 'Pcs', moq: '9', isi_karton: '' });
    expect(v.baris).toEqual({ kode_sku: '124024', satuan: 'Pcs', moq: 9 });
    const p = validasiBaris('produk', { kode_sku: '1', nama_sku: 'X', divisi: 'Y', harga: '1000', status_aktif: 'TIDAK' });
    expect(p.baris).toMatchObject({ status_aktif: false, harga: 1000 });
  });
  it('error: wajib kosong, moq < 1, bukan angka, tanggal salah', () => {
    expect(validasiBaris('rules', { kode_sku: '1', satuan: 'Pcs', moq: '0' }).alasan).toContain('moq minimal 1');
    expect(validasiBaris('rules', { kode_sku: '', satuan: 'Pcs', moq: 'x' }).alasan).toEqual(expect.arrayContaining(['kode_sku kosong', 'moq bukan angka bulat ("x")']));
    expect(validasiBaris('pjp', { kode_salesman: '1', nama_salesman: 'A', tanggal_kunjungan: 'besok', kode_toko: 'T' }).baris).toBeNull();
  });
});

describe('jenis data & operasi baris', () => {
  const data = {
    master: [
      { kode_toko: 'G1', channel: 'GT' },
      { kode_toko: 'M1', channel: 'MT' },
      { kode_toko: 'G2' },
    ],
    pjp: [{ kode_toko: 'M1' }, { kode_toko: 'G1' }, { kode_toko: 'X' }],
    rules: [{ kode_sku: '1' }, { kode_sku: '2' }],
  } as unknown as DataSet;

  it('submenu lengkap & segmen GT/MT pakai indeks asli', () => {
    expect(new Set(JENIS_DATA.map((j) => j.tipe))).toEqual(new Set(SEMUA_TIPE));
    expect(indeksJenis(data, jenisById('store-mt')!)).toEqual([1]);
    expect(indeksJenis(data, jenisById('store-gt')!)).toEqual([0, 2]);
    expect(indeksJenis(data, jenisById('pjp-gt')!)).toEqual([1, 2]);
    expect(indeksJenis(data, jenisById('moq-gt')!)).toEqual([0, 1]);
  });

  it('duplikat ditolak kecuali baris yang sedang diedit', () => {
    const rows = data.rules as unknown as Record<string, unknown>[];
    expect(cekDuplikat('rules', rows, { kode_sku: '2' }, null)).toMatch(/Kode SKU sudah ada \(baris 2\)/);
    expect(cekDuplikat('rules', rows, { kode_sku: '2' }, 1)).toBeNull();
    expect(cekDuplikat('histori', rows, { kode_sku: '2' }, null)).toBeNull();
  });

  it('terapkan: edit, tambah, hapus tanpa mengubah array asli', () => {
    const a = [1, 2, 3];
    expect(terapkan(a, 1, 9)).toEqual([1, 9, 3]);
    expect(terapkan(a, null, 4)).toEqual([1, 2, 3, 4]);
    expect(terapkan(a, 0, null)).toEqual([2, 3]);
    expect(a).toEqual([1, 2, 3]);
  });
});

describe('cek versi (dua admin)', () => {
  it('PUT dengan versi lama → 409; versi benar → sukses; 0 = hanya bila belum ada', async () => {
    const store = memoryStore();
    const api: typeof fetch = async (input, init) => handle(new Request(`http://x${String(input)}`, init), store, 'pin');
    expect((await simpanData('rules', [1], 'pin', api, 0)).version).toBe(1);
    await expect(simpanData('rules', [2], 'pin', api, 0)).rejects.toMatchObject({ status: 409 });
    expect((await simpanData('rules', [2], 'pin', api, 1)).version).toBe(2);
    await expect(simpanData('rules', [3], 'pin', api, 1)).rejects.toMatchObject({ status: 409 });
    expect((await simpanData('rules', [3], 'pin', api)).version).toBe(3); // upload file: tanpa cek
  });
});

describe('seed', () => {
  it('default hanya isi yang kosong; --force menimpa; --only memfilter', () => {
    expect(pilihTipeSeed(['rules', 'master'], {}).isi).toEqual(['rovi', 'pjp', 'produk', 'histori', 'msl', 'price']);
    expect(pilihTipeSeed(['rules'], { force: true }).isi).toEqual([...SEMUA_TIPE]);
    expect(pilihTipeSeed(['rules'], { only: ['rules', 'produk'] })).toEqual({ isi: ['produk'], lewati: ['rules'], tidakDikenal: [] });
    expect(pilihTipeSeed([], { only: ['xyz'] }).tidakDikenal).toEqual(['xyz']);
  });
});
