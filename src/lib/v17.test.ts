/** v17: isi karton dari nama SKU, Avg Order MT, reason kunjungan GT. */
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { laporanKunjungan } from './laporanKunjungan';
import { gabungProduk, indexAvgOrder, isiDariNama } from './order';
import { parseSheet } from './parse';
import { gabungUpsert } from './upload';
import { bacaFilePo, type KonteksPo } from './uploadPo';
import { reasonWajib, selesaikan, teksReason } from './visit';

describe('isi karton dari nama SKU', () => {
  it('pola yang jelas dibaca; pola ambigu tidak ditebak', () => {
    expect(isiDariNama('Yupi Apple Rings Hanging Bag 24×108gr')).toBe(24);
    expect(isiDariNama('Yupi Milly Moos Hanging 24x108 gr')).toBe(24);
    expect(isiDariNama('KELLOGGS FRUIT STRAWBERRY CF 1×18×180 g')).toBe(18);
    expect(isiDariNama('HUKI COTTON BUD BAYI 100S 1X48')).toBe(48);
    expect(isiDariNama('Yupi Bolicious Strawberry 12x6x40 gr')).toBeNull();
    expect(isiDariNama('Yupi Box 12x24x5gr')).toBeNull();
    expect(isiDariNama('Kardus 10x20 cm')).toBeNull();
    expect(isiDariNama('Susu 400gr')).toBeNull();
    expect(isiDariNama('Sosis 1x500gr')).toBeNull();
  });

  it('nilai upload menang atas nama SKU', () => {
    const p = [{ kode_sku: 'A', nama_sku: 'Permen 24x108gr', divisi: 'X', harga: 1 }];
    expect(gabungProduk(p, [])[0].isi_karton).toBe(24);
    expect(gabungProduk(p, [{ kode_sku: 'A', satuan: 'Pcs', moq: 1 }])[0].isi_karton).toBe(24);
    expect(gabungProduk(p, [{ kode_sku: 'A', satuan: 'Pcs', moq: 1, isi_karton: 12 }])[0].isi_karton).toBe(12);
  });

  it('upload PO satuan CAR tanpa isi karton → error, bukan dianggap Pcs', () => {
    const ctx: KonteksPo = {
      channel: 'MT',
      kodeSalesman: 'S',
      D: '2026-11-26',
      produk: gabungProduk([{ kode_sku: 'A', nama_sku: 'Tanpa isi', divisi: 'X', harga: 1 }], []),
      master: [],
      tokoBoleh: new Set(['T1']),
      tokoTetap: 'T1',
    };
    const h = bacaFilePo(XLSX.utils.aoa_to_sheet([['kode_sku', 'qty', 'satuan'], ['A', 2, 'CAR']]), ctx);
    expect(h.grup).toEqual([]);
    expect(h.error[0].alasan).toContain('Isi per karton');
  });
});

describe('Avg Order MT', () => {
  it('parse alias header; upload ulang toko+SKU memperbarui; index per toko+SKU', () => {
    const h = parseSheet('avgorder', XLSX.utils.aoa_to_sheet([['Outlet', 'SKU', 'Avg'], ['T1', 'A', 12], ['T1', 'B', 4.6]]));
    expect(h.kolomHilang).toEqual([]);
    expect(h.error).toEqual([]);
    const u = gabungUpsert('avgorder', [{ kode_toko: 'T1', kode_sku: 'A', avg_order: 6 }], h.valid);
    expect(u.rows).toHaveLength(2);
    expect(indexAvgOrder(u.rows).get('T1|A')).toBe(12);
    expect(indexAvgOrder(u.rows).get('T1|B')).toBe(5);
  });
});

describe('reason kunjungan GT', () => {
  it('jenis reason yang wajib mengikuti data yang tercatat', () => {
    expect(reasonWajib({ stok: false, collection: false, po: false })).toBe('alasan_tidak_dikunjungi');
    expect(reasonWajib({ stok: true, collection: false, po: false })).toBe('alasan_tidak_transaksi');
    expect(reasonWajib({ stok: false, collection: true, po: false })).toBe('alasan_tidak_transaksi');
    expect(reasonWajib({ stok: false, collection: false, po: true })).toBeNull();
  });

  it('"Lainnya" wajib diberi teks', () => {
    expect(teksReason('')).toBeNull();
    expect(teksReason('Toko Tutup')).toBe('Toko Tutup');
    expect(teksReason('Lainnya', '  ')).toBeNull();
    expect(teksReason('Lainnya', ' banjir ')).toBe('Lainnya: banjir');
  });

  it('reason tersimpan sekali dan ikut di laporan', () => {
    let list = selesaikan([], 'S', 'T1', '2026-11-26', 'a', { alasan_tidak_dikunjungi: 'Toko Tutup' });
    list = selesaikan(list, 'S', 'T1', '2026-11-26', 'b');
    expect(list[0]).toMatchObject({ selesaiAt: 'a', alasan_tidak_dikunjungi: 'Toko Tutup' });
    const [r] = laporanKunjungan([{ kode_toko: 'T1', nama_toko: 'Toko 1' }], { kunjungan: list, penagihan: [], po: [] }, 'S', '2026-11-26');
    expect(r).toMatchObject({ status_kunjungan: 'SELESAI', purchase_order: 'DILEWATI', reason_tidak_dikunjungi: 'Toko Tutup', reason_tidak_transaksi: '' });
  });
});
