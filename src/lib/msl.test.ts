import { describe, expect, it } from 'vitest';
import { addDays } from './dates';
import {
  compliance,
  daftarSkuMSL,
  indexMsl,
  indexTransaksi,
  ringkasPrincipal,
  teksTerakhirOrder,
  type KonteksMSL,
} from './msl';
import { gabungProduk } from './order';
import type { HistoriSales, MslListing, PurchaseOrder } from './types';

const D = '2026-11-09';
const produk = gabungProduk(
  [
    { kode_sku: 'DAN-1', nama_sku: 'SGM Eksplor', divisi: 'Danone', kategori: 'Susu', harga: 48_500 },
    { kode_sku: 'DAN-2', nama_sku: 'Bebelac', divisi: 'Danone', kategori: 'Susu', harga: 142_000 },
    { kode_sku: 'DAN-3', nama_sku: 'Nutrilon (non-aktif)', divisi: 'Danone', harga: 285_000, status_aktif: false },
    { kode_sku: 'YUP-1', nama_sku: 'Yupi Gummy', divisi: 'Yupi', kategori: 'Permen', harga: 52_000 },
    { kode_sku: 'YUP-2', nama_sku: 'Yupi Burger', divisi: 'Yupi', harga: 46_000 },
    { kode_sku: 'HUK-1', nama_sku: 'Huki Botol', divisi: 'Huki', harga: 19_500 },
    { kode_sku: 'KOE-1', nama_sku: 'Koepoe Pewarna', divisi: 'Koepoe-Koepoe', harga: 6_500 },
  ],
  [{ kode_sku: 'YUP-1', satuan: 'Box', moq: 4, kelipatan: 2 }],
);
const msl: MslListing[] = [
  { kode_toko: 'MT001', kode_sku: 'DAN-1', status_listed: true }, // order 45 hari lalu → warning
  { kode_toko: 'MT001', kode_sku: 'DAN-2', status_listed: true }, // 30 hari → aman
  { kode_toko: 'MT001', kode_sku: 'DAN-3', status_listed: true }, // non-aktif → tidak tampil
  { kode_toko: 'MT001', kode_sku: 'YUP-1', status_listed: true }, // 31 hari → warning
  { kode_toko: 'mt001 ', kode_sku: 'huk-1', status_listed: true }, // belum pernah → warning
  { kode_toko: 'MT001', kode_sku: 'KOE-1', status_listed: false }, // tidak listed, tidak pernah beli → tidak tampil
  { kode_toko: 'MT002', kode_sku: 'YUP-2', status_listed: true }, // toko lain
];
const h = (toko: string, sku: string, hariLalu: number): HistoriSales => ({ kode_toko: toko, kode_sku: sku, tanggal_po: addDays(D, -hariLalu), qty: 1 });
const histori: HistoriSales[] = [
  h('MT001', 'DAN-1', 45),
  h('MT001', 'DAN-1', 80),
  h('MT001', 'DAN-2', 30),
  h('MT001', 'YUP-1', 31),
  h('MT001', 'YUP-2', 5), // tidak listed tapi pernah dibeli → tampil tanpa warning
  h('MT001', 'DAN-1', -3), // setelah D: diabaikan
];
const ctx = (po: PurchaseOrder[] = []): KonteksMSL => ({ produk, mslIdx: indexMsl(msl), trxIdx: indexTransaksi(histori, po) });
const kode = (list: { kode_sku: string }[]) => list.map((s) => s.kode_sku);

describe('MSL: SKU Listing & Warning', () => {
  const list = daftarSkuMSL(ctx(), 'MT001', D);
  const sku = (k: string) => list.find((s) => s.kode_sku === k)!;

  it('hanya SKU listed atau pernah dibeli, dan aktif', () => {
    expect(kode(list).sort()).toEqual(['DAN-1', 'DAN-2', 'HUK-1', 'YUP-1', 'YUP-2']);
  });

  it('order terakhir 45 hari lalu → warning + teks informatif', () => {
    expect(sku('DAN-1')).toMatchObject({ warning: 'NO_ORDER_30', hariSejak: 45, lastOrder: '2026-09-25' });
    expect(teksTerakhirOrder(sku('DAN-1'))).toBe('Terakhir order: 25 Sep 2026 (45 hari lalu)');
  });

  it('batas: tepat 30 hari aman, 31 hari warning', () => {
    expect(sku('DAN-2').warning).toBeNull();
    expect(sku('YUP-1').warning).toBe('NO_ORDER_30');
  });

  it('listed tapi belum pernah dibeli → warning "Belum pernah order"', () => {
    expect(sku('HUK-1')).toMatchObject({ warning: 'BELUM_PERNAH', lastOrder: null, hariSejak: null });
    expect(teksTerakhirOrder(sku('HUK-1'))).toBe('Belum pernah order');
  });

  it('SKU tidak listed yang pernah dibeli tampil tanpa warning', () => {
    expect(sku('YUP-2')).toMatchObject({ listed: false, warning: null, hariSejak: 5 });
  });

  it('warning dipin di atas: belum pernah → terlama → ... lalu non-warning', () => {
    expect(kode(list)).toEqual(['HUK-1', 'DAN-1', 'YUP-1', 'DAN-2', 'YUP-2']);
  });

  it('counter per divisi & compliance toko', () => {
    expect(ringkasPrincipal(list)).toEqual([
      { principal: 'Danone', total: 2, listed: 2, warning: 1 },
      { principal: 'Huki', total: 1, listed: 1, warning: 1 },
      { principal: 'Yupi', total: 2, listed: 1, warning: 1 },
    ]);
    expect(compliance(list)).toEqual({ listed: 4, warning: 3, belumPernah: 1, aktif: 1, persen: 25 });
  });

  it('toko tanpa MSL & histori → daftar kosong, compliance 100%', () => {
    expect(daftarSkuMSL(ctx(), 'MT999', D)).toEqual([]);
    expect(compliance([]).persen).toBe(100);
  });
});

describe('MSL: warning dinamis setelah PO', () => {
  const po = (tanggal: string, skus: string[]): PurchaseOrder => ({
    id: 'x',
    no_po: 'PO/1',
    kode_toko: 'MT001',
    kode_salesman: 'SLSM01',
    tanggal,
    items: skus.map((s) => ({ kode_sku: s, nama_sku: s, divisi: '', satuan: 'Pcs', qty: 1, harga: 1, subtotal: 1 })),
    total: 1,
    status: 'TERKIRIM',
    createdAt: '',
  });

  it('PO hari ini mereset warning SKU yang dipesan (dan hanya itu)', () => {
    const list = daftarSkuMSL(ctx([po(D, ['DAN-1', 'HUK-1'])]), 'MT001', D);
    const s = (k: string) => list.find((x) => x.kode_sku === k)!;
    expect(s('DAN-1')).toMatchObject({ warning: null, hariSejak: 0, lastOrder: D });
    expect(teksTerakhirOrder(s('DAN-1'))).toBe('Terakhir order: 9 Nov 2026 (hari ini)');
    expect(s('HUK-1').warning).toBeNull();
    expect(s('YUP-1').warning).toBe('NO_ORDER_30');
    expect(compliance(list).warning).toBe(1);
  });

  it('PO bertanggal setelah D tidak dihitung', () => {
    const list = daftarSkuMSL(ctx([po('2026-11-12', ['DAN-1'])]), 'MT001', D);
    expect(list.find((x) => x.kode_sku === 'DAN-1')!.warning).toBe('NO_ORDER_30');
  });
});

describe('MSL: warning saat input PO (keranjang)', () => {
  it('SKU di keranjang: warning hilang (warningAwal tetap tercatat); compliance sebelum vs sesudah', () => {
    const list = daftarSkuMSL(ctx(), 'MT001', D, { 'DAN-1': 6, 'HUK-1': 0 });
    const s = (k: string) => list.find((x) => x.kode_sku === k)!;
    expect(s('DAN-1')).toMatchObject({ diPO: true, warning: null, warningAwal: 'NO_ORDER_30' });
    expect(s('HUK-1')).toMatchObject({ diPO: false, warning: 'BELUM_PERNAH' }); // qty 0 = tidak dihitung
    expect(compliance(list, 'sebelum')).toMatchObject({ warning: 3, aktif: 1, persen: 25 });
    expect(compliance(list)).toMatchObject({ warning: 2, aktif: 2, persen: 50 });
    // Urutan: warning tersisa tetap di atas, lalu SKU yang masuk PO.
    expect(kode(list).slice(0, 3)).toEqual(['HUK-1', 'YUP-1', 'DAN-1']);
  });
});
