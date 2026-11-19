/** v16: upload PO Excel (GT per hari, MT per toko). */
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { gabungProduk } from './order';
import { bacaWorkbook } from './parse';
import type { MasterToko } from './types';
import { bacaFilePo, templatePo, tokoSalesman, type KonteksPo } from './uploadPo';

const produk = gabungProduk(
  [
    { kode_sku: '114608', nama_sku: 'Yupi Albylicious Mini Bag', divisi: 'CP YUPI', harga: 2_853 },
    { kode_sku: '122121', nama_sku: 'NP Koepoe Pewarna', divisi: 'CP BELIBIS', harga: 6_500 },
    { kode_sku: '999999', nama_sku: 'Nonaktif', divisi: 'X', harga: 1, status_aktif: false },
  ],
  [{ kode_sku: '114608', satuan: 'Pcs', moq: 3, isi_karton: 12 }],
);
const master = [
  { kode_salesman: '000032', nama_salesman: 'Jajang', kode_toko: 'A01329', nama_toko: 'AL FAZZA', tipe_bayar: 'KREDIT', limit_kredit: 2_205_984 },
  { kode_salesman: '000032', nama_salesman: 'Jajang', kode_toko: 'A00001', nama_toko: 'KECIL', tipe_bayar: 'KREDIT', limit_kredit: 10_000 },
  { kode_salesman: '000033', nama_salesman: 'Yudha', kode_toko: 'B00001', nama_toko: 'MILIK YUDHA' },
] as MasterToko[];
const ctx: KonteksPo = {
  channel: 'GT',
  kodeSalesman: '000032',
  D: '2026-11-17',
  produk,
  master,
  tokoBoleh: tokoSalesman(master, [{ kode_salesman: '000032', kode_toko: 'P99' }], '000032'),
  outstanding: (k) => (k === 'A01329' ? 866_764 : 0),
  sudahPo: (k) => k === 'A01329',
};
const ws = (aoa: unknown[][]) => XLSX.utils.aoa_to_sheet(aoa);

describe('upload PO GT', () => {
  it('kelompok per toko, alias header, baris judul & TOTAL dilewati, CAR → Pcs, duplikat dijumlah', () => {
    const h = bacaFilePo(
      ws([
        ['PO HARIAN SALESMAN JAJANG'],
        [],
        ['Outlet', 'SKU', 'Quantity', 'UOM'],
        ['A01329', '114608', 1, 'CAR'],
        ['a01329', '114608', 3, ''],
        ['A01329', '122121', '2', 'PCS'],
        ['P99', '122121', 1, ''],
        ['', '', 7, ''],
      ]),
      ctx,
    );
    expect(h.kolomHilang).toEqual([]);
    expect(h.error).toEqual([]);
    expect(h.dilewati).toBe(1);
    const a = h.grup.find((g) => g.kode_toko === 'A01329')!;
    expect(a.items.map((i) => `${i.kode_sku}:${i.qty}`).sort()).toEqual(['114608:15', '122121:2']);
    expect(a.total).toBe(15 * 2_853 + 2 * 6_500);
    expect(a.tanggal).toBe('2026-11-17');
    expect(a.peringatan).toContain('Toko ini sudah punya PO di tanggal yang sama');
    expect(h.grup.map((g) => g.kode_toko).sort()).toEqual(['A01329', 'P99']);
  });

  it('error per baris dengan bahasa biasa; toko melebihi limit ditolak', () => {
    const h = bacaFilePo(
      ws([
        ['kode_toko', 'kode_sku', 'qty', 'tanggal'],
        ['B00001', '114608', 1, ''],
        ['A01329', 'XXXX', 1, ''],
        ['A01329', '999999', 1, ''],
        ['A01329', '114608', 0, ''],
        ['A01329', '114608', 'dua', ''],
        ['A00001', '122121', 5, '18-11-2026'],
      ]),
      ctx,
    );
    expect(h.error.map((e) => [e.baris, e.alasan])).toEqual([
      [2, 'Toko B00001 bukan toko Anda (tidak ada di coverage salesman)'],
      [3, 'SKU XXXX tidak ada di Master SKU'],
      [4, 'SKU 999999 tidak aktif'],
      [5, 'Qty harus lebih dari 0'],
      [6, 'Qty harus angka, bukan "dua"'],
    ]);
    const kecil = h.grup.find((g) => g.kode_toko === 'A00001')!;
    expect(kecil.tanggal).toBe('2026-11-18');
    expect(kecil.ditolak).toMatch(/Melebihi limit kredit/);
  });

  it('kolom wajib tidak ada → kolomHilang', () => {
    expect(bacaFilePo(ws([['sku', 'qty'], ['114608', 1]]), ctx).kolomHilang).toEqual(['kode_toko']);
  });

  it('template GT & MT bisa langsung di-upload balik tanpa error', () => {
    const wbGt = bacaWorkbook(XLSX.write(templatePo('GT', [{ kode_toko: 'A01329', kode_sku: '114608', qty: 3 }], '2026-11-17'), { type: 'array', bookType: 'xlsx' }));
    expect(bacaFilePo(wbGt.Sheets.PO, ctx)).toMatchObject({ error: [], kolomHilang: [] });
    const wbMt = bacaWorkbook(XLSX.write(templatePo('MT', [{ kode_sku: '122121', qty: 2 }], '2026-11-17'), { type: 'array', bookType: 'xlsx' }));
    const mt = bacaFilePo(wbMt.Sheets.PO, { ...ctx, channel: 'MT', tokoTetap: 'MT00001' });
    expect(mt.error).toEqual([]);
    expect(mt.grup).toHaveLength(1);
    expect(mt.grup[0]).toMatchObject({ kode_toko: 'MT00001', ditolak: null });
  });
});
