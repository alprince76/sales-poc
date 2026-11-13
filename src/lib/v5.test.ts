/** Feedback 12/11: customer master, Inkasso, CAR/PCS, MOQ tanpa kelipatan, price list, new material, export. */
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { indexFaktur } from './billing';
import { applyPenagihan } from './collection';
import { toTXT, toXLSX } from './csv';
import { daftarInkasso } from './inkasso';
import { catatanMoq, formatQty, gabungProduk, labelMoq, validasiPO } from './order';
import { alamatLengkap, lastOrder } from './outlet';
import type { Faktur, MasterToko, Penagihan, PurchaseOrder } from './types';

const D = '2026-11-09';

describe('Customer master', () => {
  it('alamat = bill address 1–4 digabung, yang kosong dilewati; fallback kolom alamat', () => {
    expect(alamatLengkap({ alamat_1: 'Jl. Raya No. 18', alamat_2: 'RT 06/RW 02', alamat_3: ' ', alamat_4: 'Cileungsi' })).toBe('Jl. Raya No. 18, RT 06/RW 02, Cileungsi');
    expect(alamatLengkap({ alamat: 'Jl. Lama 1' })).toBe('Jl. Lama 1');
    expect(alamatLengkap({})).toBe('');
  });

  it('last order: tanggal terakhir ≤ D dari histori (qty × harga) + PO aplikasi, dijumlah per tanggal', () => {
    const produk = [
      { kode_sku: 'A', harga: 1000 },
      { kode_sku: 'B', harga: 500 },
    ];
    const histori = [
      { kode_toko: 'TK1', kode_sku: 'A', tanggal_po: '2026-10-01', qty: 2 },
      { kode_toko: 'TK1', kode_sku: 'A', tanggal_po: '2026-10-20', qty: 3 },
      { kode_toko: 'TK1', kode_sku: 'B', tanggal_po: '2026-10-20', qty: 4 },
      { kode_toko: 'TK1', kode_sku: 'A', tanggal_po: '2026-11-10', qty: 99 }, // setelah D
      { kode_toko: 'TK2', kode_sku: 'A', tanggal_po: '2026-11-01', qty: 1 },
    ];
    expect(lastOrder('tk1', D, histori, [], produk)).toEqual({ tanggal: '2026-10-20', nilai: 5000 });
    const po = { kode_toko: 'TK1', tanggal: D, total: 77_000 } as PurchaseOrder;
    expect(lastOrder('TK1', D, histori, [po], produk)).toEqual({ tanggal: D, nilai: 77_000 });
    expect(lastOrder('TK9', D, histori, [], produk)).toBeNull();
  });
});

describe('Daftar Inkasso (coverage SR, tertagih / belum ditagih)', () => {
  const m = (kode: string, sales = 'SLS01'): MasterToko => ({ kode_salesman: sales, nama_salesman: 'Arli', kode_toko: kode, nama_toko: `Toko ${kode}` });
  const f = (kode: string, no: string, jt: string, sisa: number): Faktur => ({
    kode_toko: kode,
    nama_toko: kode,
    no_faktur: no,
    tanggal_faktur: '2026-09-01',
    tanggal_jatuh_tempo: jt,
    nilai_faktur: sisa,
    sisa_tagihan: sisa,
  });
  const master = [m('TK1'), m('TK2'), m('TK3'), m('TK4'), m('TK5', 'SLS02')];
  const rovi = [f('TK1', 'I1', '2026-10-01', 400), f('TK2', 'I2', D, 300), f('TK3', 'I3', '2026-10-05', 200), f('TK4', 'I4', '2026-12-01', 900), f('TK5', 'I5', '2026-10-01', 100)];
  const log = (toko: string, no: string, status: Penagihan['status'], nominal: number): Penagihan => ({
    id: no,
    no_faktur: no,
    kode_toko: toko,
    kode_salesman: 'SLS01',
    tanggal: D,
    status,
    nominal,
    createdAt: `${D}T08:00:00Z`,
  });
  const logs = [log('TK1', 'I1', 'PAID', 400), log('TK3', 'I3', 'PARTIAL', 50)];
  const ink = daftarInkasso(master, indexFaktur(rovi), indexFaktur(applyPenagihan(rovi, logs)), 'sls01', D, logs);

  it('semesta = toko coverage SR dengan tagihan JT/overdue (bukan hanya PJP); belum JT & SR lain tidak masuk', () => {
    const semua = [...ink.tertagih, ...ink.belum].map((r) => r.kode_toko).sort();
    expect(semua).toEqual(['TK1', 'TK2', 'TK3']);
  });
  it('lunas → tertagih; partial / belum dikunjungi → belum ditagih', () => {
    expect(ink.tertagih.map((r) => r.kode_toko)).toEqual(['TK1']);
    expect(ink.tertagih[0]).toMatchObject({ terkumpul: 400, sisa: 0, harusAwal: 400 });
    expect(ink.belum.map((r) => r.kode_toko)).toEqual(['TK3', 'TK2']); // overdue lebih dulu
    expect(ink.belum[0]).toMatchObject({ statusTerakhir: 'PARTIAL', sisa: 150, terkumpul: 50 });
    expect(ink.belum[1]).toMatchObject({ statusTerakhir: null, sisa: 300 });
  });
});

describe('CAR/PCS, MOQ per item, price list, new material', () => {
  const produk = gabungProduk(
    [
      { kode_sku: '10302153', nama_sku: 'Huki Cotton Bud Bayi 100s', new_material: 'HUKI COTTON BUD BAYI 100S 1X48', divisi: 'Huki', harga: 8_500 },
      { kode_sku: '10102017', nama_sku: 'SGM Eksplor 1+', divisi: 'Danone', harga: 48_500 },
    ],
    [{ kode_sku: '10302153', satuan: 'Pcs', moq: 12, kelipatan: 12, isi_karton: 48 }],
    [
      { kode_sku: '10302153', harga: 9_000, channel: 'MT' },
      { kode_sku: '10102017', harga: 49_000 },
    ],
  );
  const mt = gabungProduk(
    [{ kode_sku: '10302153', nama_sku: 'x', divisi: 'Huki', harga: 8_500 }],
    [{ kode_sku: '10302153', satuan: 'Pcs', moq: 12, isi_karton: 48 }],
    [{ kode_sku: '10302153', harga: 9_000, channel: 'MT' }],
    'MT',
  );
  const huki = produk[0];

  it('nama = new material; harga = price list channel → price list umum → master', () => {
    expect(huki.nama_sku).toBe('HUKI COTTON BUD BAYI 100S 1X48');
    expect(huki.harga).toBe(8_500); // price list MT tidak berlaku untuk GT
    expect(mt[0].harga).toBe(9_000);
    expect(produk[1].harga).toBe(49_000); // price list tanpa channel
    expect(produk[1].isi_karton).toBe(1);
  });

  it('MOQ bukan kelipatan; label "Min. 12 Pcs/item"; MT tanpa MOQ', () => {
    expect(labelMoq(huki)).toBe('Min. 12 Pcs/item');
    expect(catatanMoq(13, huki)).toBeNull();
    expect(catatanMoq(11, huki)).toBe('Di bawah min. order 12 Pcs/item (catatan)');
    expect(catatanMoq(1, huki, { channel: 'MT' })).toBeNull();
    expect(validasiPO({ '10302153': 2 }, mt, undefined, 0, { channel: 'MT' }).bolehSubmit).toBe(true);
  });

  it('qty disimpan dalam Pcs: 2 CAR = 96 Pcs → subtotal 96 × harga; tampil "2 CAR (96 Pcs)"', () => {
    const v = validasiPO({ '10302153': 2 * huki.isi_karton }, produk, undefined, 0);
    expect(v.items[0]).toMatchObject({ qty: 96, subtotal: 96 * 8_500, isi_karton: 48 });
    expect(formatQty(96, huki)).toBe('2 CAR (96 Pcs)');
    expect(formatQty(50, huki)).toBe('50 Pcs');
    expect(formatQty(12, produk[1])).toBe('12 Pcs');
  });
});

describe('Export TXT & Excel', () => {
  const rows = [
    { kode: 'A', nama: 'Satu\tdua', nilai: 1000 },
    { kode: 'B', nama: 'Baris\nbaru', nilai: 2000 },
  ];
  it('TXT tab-delimited, tab/baris baru di nilai jadi spasi', () => {
    expect(toTXT(rows)).toBe('kode\tnama\tnilai\r\nA\tSatu dua\t1000\r\nB\tBaris baru\t2000');
  });
  it('XLSX bisa dibaca ulang dengan isi sama', async () => {
    const buf = await toXLSX(rows);
    const wb = XLSX.read(buf, { type: 'array' });
    expect(XLSX.utils.sheet_to_json(wb.Sheets.Data)).toEqual(rows);
  });
});
