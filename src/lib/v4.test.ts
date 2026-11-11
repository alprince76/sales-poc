import { describe, expect, it } from 'vitest';
import { namaDivisi, tanggalDMY } from './divisi';
import { cekKredit, gabungProduk, historiToko, PERINGATAN_BLOKIR, suggestedQty, teksBiasaOrder, validasiPO } from './order';
import { cariSku } from './sku-search';

describe('Divisi faktur', () => {
  it('kode → nama; kode tak dikenal tetap tampil', () => {
    expect(namaDivisi('dne')).toBe('Danone');
    expect(namaDivisi('CBN')).toBe('Combine');
    expect(namaDivisi('MRS')).toBe('Mars');
    expect(namaDivisi('XYZ')).toBe('XYZ');
    expect(tanggalDMY('2026-11-09')).toBe('09/11/2026');
  });
});

const produk = gabungProduk(
  [
    { kode_sku: '10102017', nama_sku: 'SGM Eksplor 1+ Vanila 400gr', divisi: 'Danone', harga: 48_500 },
    { kode_sku: '10102051', nama_sku: 'SGM Eksplor 3+ Vanila 400gr', divisi: 'Danone', harga: 47_000 },
    { kode_sku: '10202017', nama_sku: 'Yupi Milly Moos w/ Milk Hanging 24x108gr', divisi: 'Yupi', harga: 168_000 },
    { kode_sku: '10402017', nama_sku: 'Koepoe Pewarna Merah', divisi: 'Koepoe-Koepoe', harga: 6_500 },
  ],
  [{ kode_sku: '10202017', satuan: 'Pcs', moq: 3, kelipatan: 1 }],
);

describe('Cari SKU (kode SAP / nama)', () => {
  const k = (q: string) => cariSku(produk, q).map((p) => p.kode_sku);
  it('kode persis & awalan kode', () => {
    expect(k('10202017')).toEqual(['10202017']);
    expect(k('101020')).toEqual(['10102017', '10102051']);
  });
  it('nama: awal, kata, substring, multi-kata; case-insensitive', () => {
    expect(k('yupi')).toEqual(['10202017']);
    expect(k('milly')).toEqual(['10202017']);
    expect(k('sgm 3+')).toEqual(['10102051']);
    expect(k('vanila')).toEqual(['10102017', '10102051']);
    expect(k('')).toEqual([]);
    expect(k('zzz')).toEqual([]);
  });
});

describe('Kredit: TUNAI / KREDIT / blokir / MT', () => {
  it('TUNAI: tanpa limit walau outstanding besar', () => {
    expect(cekKredit({ tipe_bayar: 'TUNAI', limit_kredit: 1_000 }, 1e9, 1e9)).toMatchObject({ boleh: true, sisaLimit: null });
  });
  it('KREDIT: limit berlaku', () => {
    expect(cekKredit({ tipe_bayar: 'KREDIT', limit_kredit: 10_000_000 }, 9_500_000, 1_000_000).boleh).toBe(false);
  });
  it('Toko diblokir: boleh submit + peringatan "PO berpotensi tidak release"', () => {
    const r = cekKredit({ status_blokir: true, tipe_bayar: 'KREDIT', limit_kredit: 50_000_000 }, 0, 100);
    expect(r).toMatchObject({ boleh: true, peringatan: PERINGATAN_BLOKIR });
    expect(PERINGATAN_BLOKIR).toBe('PO berpotensi tidak release. Selesaikan tagihan atau hubungi admin.');
  });
  it('MT: tanpa limit & tanpa peringatan blokir', () => {
    expect(cekKredit({ status_blokir: true, limit_kredit: 1 }, 1e9, 1e9, { channel: 'MT' })).toEqual({ boleh: true, alasan: null, sisaLimit: null, peringatan: null });
    expect(validasiPO({ '10202017': 3 }, produk, { limit_kredit: 1 }, 1e9, { channel: 'MT' }).bolehSubmit).toBe(true);
  });
  it('validasiPO toko blokir: bolehSubmit true, peringatan diteruskan', () => {
    const v = validasiPO({ '10202017': 3 }, produk, { status_blokir: true }, 0);
    expect(v.bolehSubmit).toBe(true);
    expect(v.kredit.peringatan).toBe(PERINGATAN_BLOKIR);
  });
});

describe('Teks histori yang mudah dipahami', () => {
  it('"Biasa order ±N Pcs/bulan" dibulatkan ke atas; qty terakhir', () => {
    const h = historiToko(
      [
        { kode_toko: 'T', kode_sku: '10202017', tanggal_po: '2026-10-20', qty: 6 },
        { kode_toko: 'T', kode_sku: '10202017', tanggal_po: '2026-09-15', qty: 3 },
      ],
      'T',
      '2026-11-09',
    )[0];
    expect(h.qtyTerakhir).toBe(6);
    const s = suggestedQty(h, produk[2]);
    expect(s.rataBulanan).toBe(3);
    expect(teksBiasaOrder(s, 'Pcs')).toBe('Biasa order ±3 Pcs/bulan');
    expect(teksBiasaOrder({ rataBulanan: 0.3 }, 'Pcs')).toBe('Biasa order ±1 Pcs/bulan');
    expect(teksBiasaOrder({ rataBulanan: 0 }, 'Pcs')).toBeNull();
  });
});
