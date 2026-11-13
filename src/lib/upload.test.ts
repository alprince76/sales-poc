import { describe, expect, it } from 'vitest';
import { formatTanggal } from './dates';
import { formatRupiah } from './format';
import type { DataSet } from './types';
import { ringkasUpload } from './upload';

const fmt = { rupiah: formatRupiah, tanggal: formatTanggal };

describe('US-A2 Ringkasan & warning upload', () => {
  const ds: DataSet = {
    master: [{ kode_salesman: 'SLS01', nama_salesman: 'Arli', kode_toko: 'TK00001', nama_toko: 'A' }],
    rovi: [
      { kode_toko: 'TK00001', nama_toko: 'A', no_faktur: 'I1', tanggal_faktur: '2026-10-01', tanggal_jatuh_tempo: '2026-11-01', nilai_faktur: 100, sisa_tagihan: 100 },
    ],
    pjp: [
      { kode_salesman: 'SLS01', nama_salesman: 'Arli', tanggal_kunjungan: '2026-11-09', kode_toko: 'TK00001' },
      { kode_salesman: 'SLS01', nama_salesman: 'Arli', tanggal_kunjungan: '2026-11-14', kode_toko: 'TK99999' },
    ],
    produk: [],
    rules: [],
    histori: [],
    msl: [],
    price: [],
  };

  it('Kode toko di PJP tidak ada di ROVI → upload tetap berhasil + warning "1 toko tidak ditemukan di data ROVI"', () => {
    const r = ringkasUpload('pjp', ds, fmt);
    expect(r.warning[0]).toMatch(/^1 toko tidak ditemukan di data ROVI/);
    expect(r.warning[0]).toContain('TK99999');
    expect(r.baris).toEqual([
      { label: 'Salesman', nilai: '1' },
      { label: 'Rentang tanggal', nilai: '9 Nov 2026 – 14 Nov 2026' },
      { label: 'Kunjungan', nilai: '2' },
    ]);
  });

  it('Ringkasan ROVI: jumlah faktur, toko, total outstanding', () => {
    const r = ringkasUpload('rovi', ds, fmt);
    expect(r.baris.map((b) => b.nilai)).toEqual(['1', '1', 'Rp 100']);
    expect(r.warning).toEqual([]);
  });
});
