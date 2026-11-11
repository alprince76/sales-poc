import { describe, expect, it } from 'vitest';
import { hitungKunjungan, ringkasTagihan } from './billing';
import { applyPenagihan, buatPenagihan, penagihanTerakhir, ringkasPenagihan, validasiPenagihan } from './collection';
import {
  bulatkanQty,
  cekKredit,
  gabungProduk,
  historiToko,
  suggestedQty,
  validasiPO,
  validasiQty,
} from './order';
import { daftarSkuStok, validasiStok } from './stock';
import type { Faktur, HistoriSales, Penagihan } from './types';
import { cariKunjungan, isSelesai, langkahBerikut, progres, selesaikan, tandaiLangkah } from './visit';

const D = '2026-11-09';
const f = (no: string, jt: string, sisa: number, kode = 'TK1'): Faktur => ({
  kode_toko: kode,
  nama_toko: 'A',
  no_faktur: no,
  tanggal_faktur: '2026-10-01',
  tanggal_jatuh_tempo: jt,
  nilai_faktur: sisa || 1000,
  sisa_tagihan: sisa,
});
let n = 0;
const log = (no: string, status: Penagihan['status'], nominal = 0): Penagihan => ({
  id: String(++n),
  no_faktur: no,
  kode_toko: 'TK1',
  kode_salesman: 'SLS01',
  tanggal: D,
  status,
  nominal,
  createdAt: new Date(Date.UTC(2026, 10, 9) + n * 1000).toISOString(),
});

// ───────────────────────── Collection ─────────────────────────
describe('Collection: validasi update status', () => {
  it('status wajib dipilih', () => {
    expect(validasiPenagihan({ status: null }, 1000, D)).toEqual(['Pilih status penagihan.']);
  });
  it('Paid valid tanpa input tambahan', () => {
    expect(validasiPenagihan({ status: 'PAID' }, 1000, D)).toEqual([]);
  });
  it('Partially Paid wajib nominal 0 < n < sisa', () => {
    expect(validasiPenagihan({ status: 'PARTIAL' }, 1000, D)).toHaveLength(1);
    expect(validasiPenagihan({ status: 'PARTIAL', nominal: 0 }, 1000, D)).toHaveLength(1);
    expect(validasiPenagihan({ status: 'PARTIAL', nominal: 1000 }, 1000, D)[0]).toMatch(/Paid/);
    expect(validasiPenagihan({ status: 'PARTIAL', nominal: 400 }, 1000, D)).toEqual([]);
  });
  it('Janji Bayar wajib tanggal ≥ tanggal kunjungan', () => {
    expect(validasiPenagihan({ status: 'JANJI_BAYAR' }, 1000, D)).toHaveLength(1);
    expect(validasiPenagihan({ status: 'JANJI_BAYAR', tanggal_janji: '2026-11-08' }, 1000, D)).toHaveLength(1);
    expect(validasiPenagihan({ status: 'JANJI_BAYAR', tanggal_janji: '2026-11-12' }, 1000, D)).toEqual([]);
  });
  it('Bad Debt wajib alasan; "Lainnya" wajib isi manual', () => {
    expect(validasiPenagihan({ status: 'BAD_DEBT' }, 1000, D)).toEqual(['Pilih alasan.']);
    expect(validasiPenagihan({ status: 'BAD_DEBT', alasan: 'Toko Tutup' }, 1000, D)).toEqual([]);
    expect(validasiPenagihan({ status: 'BAD_DEBT', alasan: 'Lainnya', alasan_lain: ' ' }, 1000, D)).toEqual(['Tulis alasan lainnya.']);
    const p = buatPenagihan(
      { status: 'BAD_DEBT', alasan: 'Lainnya', alasan_lain: 'Toko pindah' },
      { faktur: f('I1', D, 1000), sisa: 1000, kode_salesman: 'sls01', D, id: 'x', now: 't' },
    );
    expect(p).toMatchObject({ alasan: 'Lainnya: Toko pindah', nominal: 0, kode_salesman: 'SLS01' });
  });
  it('faktur lunas tidak bisa ditagih', () => {
    expect(validasiPenagihan({ status: 'PAID' }, 0, D)).toEqual(['Faktur sudah lunas.']);
  });
});

describe('Collection: efek ke sisa tagihan', () => {
  const rovi = [f('I1', '2026-11-01', 7_250_000), f('I2', '2026-11-09', 3_000_000), f('I3', '2026-11-05', 500_000)];

  it('Paid → sisa 0; Partial → sisa dikurangi; Janji/Bad Debt tidak mengubah', () => {
    const logs = [log('I1', 'PAID', 7_250_000), log('I2', 'PARTIAL', 1_000_000), log('I3', 'JANJI_BAYAR'), log('I3', 'BAD_DEBT')];
    const ef = applyPenagihan(rovi, logs);
    expect(ef.map((x) => x.sisa_tagihan)).toEqual([0, 2_000_000, 500_000]);
    expect(rovi[0].sisa_tagihan).toBe(7_250_000); // data asli tidak dimutasi
  });

  it('Ringkasan toko ikut turun setelah pembayaran (total harus ditagih)', () => {
    expect(ringkasTagihan(rovi, D).totalHarusDitagih).toBe(10_750_000);
    const ef = applyPenagihan(rovi, [log('I1', 'PAID', 7_250_000)]);
    const r = ringkasTagihan(ef, D);
    expect(r.totalHarusDitagih).toBe(3_500_000);
    expect(r.maxHariOverdue).toBe(4);
  });

  it('Partial bertahap tidak membuat sisa negatif', () => {
    const ef = applyPenagihan([f('I1', D, 1000)], [log('I1', 'PARTIAL', 600), log('I1', 'PARTIAL', 600)]);
    expect(ef[0].sisa_tagihan).toBe(0);
  });

  it('Kunjungan: toko yang sudah dilunasi tidak lagi "Perlu Ditagih"', () => {
    const data = {
      master: [],
      pjp: [{ kode_salesman: 'SLS01', nama_salesman: 'Arli', tanggal_kunjungan: D, kode_toko: 'TK1', urutan: 1 }],
      rovi: applyPenagihan([f('I1', '2026-11-01', 1000)], [log('I1', 'PAID', 1000)]),
    };
    expect(hitungKunjungan(data, 'SLS01', D).jumlahPerluDitagih).toBe(0);
  });

  it('penagihanTerakhir & ringkasPenagihan', () => {
    const logs = [log('I1', 'JANJI_BAYAR'), log('I1', 'PARTIAL', 300), log('I2', 'BAD_DEBT')];
    expect(penagihanTerakhir(logs).get('I1')?.status).toBe('PARTIAL');
    expect(ringkasPenagihan(logs)).toMatchObject({ terkumpul: 300, jumlahPartial: 1, jumlahJanji: 1, jumlahBadDebt: 1, jumlahFaktur: 2 });
  });
});

// ───────────────────────── Purchase Order ─────────────────────────
const produk = gabungProduk(
  [
    { kode_sku: 'YUP-001', nama_sku: 'Yupi Milly Moos w/ Milk Hanging 24x108gr', divisi: 'Yupi', harga: 168_000, channel: 'GT' },
    { kode_sku: 'koe-001', nama_sku: 'Koepoe Pewarna Merah', divisi: 'Koepoe-Koepoe', harga: 6_500, channel: 'GT' },
    { kode_sku: 'DAN-007', nama_sku: 'Nutrilon Royal 3', divisi: 'Danone', harga: 285_000, channel: 'MT' },
  ],
  [
    { kode_sku: 'YUP-001', satuan: 'Pcs', moq: 3, kelipatan: 1 },
    { kode_sku: 'KOE-001', satuan: 'Pcs', moq: 24, kelipatan: 12 },
  ],
);
const yupi = produk[0];
const koepoe = produk[1];

describe('PO: validasi MOQ & kelipatan', () => {
  it('qty di bawah MOQ → pesan sesuai contoh PDF', () => {
    expect(validasiQty(2, yupi)).toBe('Minimal pemesanan untuk SKU Yupi Milly Moos w/ Milk Hanging 24x108gr adalah 3 Pcs');
    expect(validasiQty(3, yupi)).toBeNull();
    expect(validasiQty(0, yupi)).toBeNull();
  });
  it('qty bukan kelipatan → error; SKU tanpa rule = MOQ 1', () => {
    expect(validasiQty(30, koepoe)).toMatch(/kelipatan 12/);
    expect(validasiQty(36, koepoe)).toBeNull();
    expect(produk[2]).toMatchObject({ moq: 1, kelipatan: 1, satuan: 'Pcs' });
  });
  it('bulatkanQty memenuhi MOQ & kelipatan', () => {
    expect(bulatkanQty(5, koepoe)).toBe(24);
    expect(bulatkanQty(25, koepoe)).toBe(36);
    expect(bulatkanQty(0, koepoe)).toBe(0);
  });
});

describe('PO: histori & suggested order', () => {
  const h = (sku: string, tgl: string, qty: number): HistoriSales => ({ kode_toko: 'TK1', kode_sku: sku, tanggal_po: tgl, qty });
  const histori = [
    h('YUP-001', '2026-10-20', 6),
    h('YUP-001', '2026-09-15', 3),
    h('YUP-001', '2026-08-20', 4),
    h('YUP-001', '2026-04-01', 99), // > 6 bulan, diabaikan
    h('KOE-001', '2026-06-01', 48), // hanya dalam 6 bulan
    h('YUP-001', '2026-11-09', 50), // hari ini/ke depan tidak dihitung
    { ...h('YUP-001', '2026-10-01', 7), kode_toko: 'TK2' },
  ];
  const ht = historiToko(histori, 'tk1', D);

  it('historiToko: hanya 180 hari sebelum D, per toko', () => {
    const y = ht.find((x) => x.kode_sku === 'YUP-001')!;
    expect(y).toMatchObject({ totalQty: 13, jumlahOrder: 3, terakhir: '2026-10-20' });
    expect(y.perBulan.reduce((a, b) => a + b, 0)).toBe(13);
  });

  it('suggested = rata-rata 3 bulan, dibulatkan ke MOQ/kelipatan; fallback 6 bulan', () => {
    expect(suggestedQty(ht.find((x) => x.kode_sku === 'YUP-001'), yupi)).toEqual({ qty: 5, basis: '3 bulan', rataBulanan: 4.3 });
    expect(suggestedQty(ht.find((x) => x.kode_sku === 'KOE-001'), koepoe)).toEqual({ qty: 24, basis: '6 bulan', rataBulanan: 8 });
    expect(suggestedQty(undefined, yupi).qty).toBe(0);
  });
});

describe('PO: limit kredit & blokir', () => {
  it('toko diblokir: PO tetap boleh, dengan peringatan (feedback v4)', () => {
    expect(cekKredit({ status_blokir: true, limit_kredit: 50_000_000 }, 0, 100)).toMatchObject({ boleh: true, peringatan: expect.stringMatching(/berpotensi tidak release/) });
  });
  it('outstanding + total PO > limit → ditolak dengan sisa limit', () => {
    const r = cekKredit({ status_blokir: false, limit_kredit: 10_000_000 }, 9_000_000, 1_500_000);
    expect(r.boleh).toBe(false);
    expect(r.alasan).toBe('Melebihi limit kredit. Sisa limit Rp 1.000.000.');
    expect(cekKredit({ limit_kredit: 10_000_000 }, 9_000_000, 1_000_000).boleh).toBe(true);
    expect(cekKredit(undefined, 1e12, 1e12).boleh).toBe(true);
  });
  it('validasiPO: total, error per item, bolehSubmit', () => {
    const v = validasiPO({ 'YUP-001': 3, 'KOE-001': 24 }, produk, { limit_kredit: 50_000_000 }, 0);
    expect(v.total).toBe(3 * 168_000 + 24 * 6_500);
    expect(v.bolehSubmit).toBe(true);
    const bad = validasiPO({ 'YUP-001': 2 }, produk, { limit_kredit: 50_000_000 }, 0);
    expect(bad.errorItem['YUP-001']).toMatch(/adalah 3 Pcs/);
    expect(bad.bolehSubmit).toBe(false);
    expect(validasiPO({}, produk, undefined, 0).bolehSubmit).toBe(false);
  });
});

// ───────────────────────── Stok ─────────────────────────
describe('Cek Stok', () => {
  it('daftar SKU = pernah dibeli (didahulukan) ∪ channel GT', () => {
    const list = daftarSkuStok(produk, [{ kode_sku: 'DAN-007', totalQty: 1, jumlahOrder: 1, terakhir: D, qtyTerakhir: 1, perBulan: [] }]);
    expect(list.map((x) => x.kode_sku)).toEqual(['DAN-007', 'KOE-001', 'YUP-001']);
    expect(list[0].pernahDibeli).toBe(true);
    expect(daftarSkuStok(produk, []).map((x) => x.kode_sku)).not.toContain('DAN-007'); // MT, tidak pernah dibeli
  });
  it('validasi: qty ≥ 0 bulat, kompetitor wajib nama, baris kosong dibuang', () => {
    const r = validasiStok(
      [{ kode_sku: 'A', display: 2, backroom: 0 }, { kode_sku: 'B', display: 0, backroom: 0 }],
      [{ nama_produk: ' Haribo ', qty: 5 }, { nama_produk: '', qty: 0 }],
    );
    expect(r.error).toEqual([]);
    expect(r.internal).toHaveLength(1);
    expect(r.kompetitor).toEqual([{ nama_produk: 'Haribo', qty: 5 }]);
    expect(validasiStok([{ kode_sku: 'A', display: -1, backroom: 0 }], [{ nama_produk: '', qty: 3 }]).error).toHaveLength(2);
  });
});

// ───────────────────────── Kunjungan ─────────────────────────
describe('Stepper kunjungan', () => {
  it('langkah berurutan, selesaikan menandai sisa sebagai DILEWATI', () => {
    let l = tandaiLangkah([], 'sls01', 'tk1', D, 'collection', 'SELESAI');
    expect(langkahBerikut(cariKunjungan(l, 'SLS01', 'TK1', D))).toBe('stok');
    l = tandaiLangkah(l, 'SLS01', 'TK1', D, 'collection', 'DILEWATI'); // tidak menurunkan SELESAI
    expect(cariKunjungan(l, 'SLS01', 'TK1', D)?.langkah.collection).toBe('SELESAI');
    expect(isSelesai(cariKunjungan(l, 'SLS01', 'TK1', D))).toBe(false);
    l = selesaikan(l, 'SLS01', 'TK1', D, 'now');
    const s = cariKunjungan(l, 'SLS01', 'TK1', D)!;
    expect(s.langkah).toEqual({ collection: 'SELESAI', stok: 'DILEWATI', po: 'DILEWATI' });
    expect(isSelesai(s)).toBe(true);
    expect(l).toHaveLength(1);
  });
  it('progres rute', () => {
    const l = selesaikan([], 'SLS01', 'TK1', D, 'now');
    expect(progres(l, 'SLS01', D, ['TK1', 'TK2', 'TK3'])).toEqual({ selesai: 1, total: 3 });
    expect(progres(l, 'SLS01', '2026-11-10', ['TK1'])).toEqual({ selesai: 0, total: 1 });
  });
});

// ───────────────────────── CSV ─────────────────────────
import { toCSV } from './csv';
describe('CSV export', () => {
  it('escape koma, kutip, baris baru', () => {
    expect(toCSV([{ a: 'x,y', b: 'say "hi"', c: 1 }, { a: 'line\nbreak', b: null, c: 2 }])).toBe('a,b,c\r\n"x,y","say ""hi""",1\r\n"line\nbreak",,2');
  });
});
