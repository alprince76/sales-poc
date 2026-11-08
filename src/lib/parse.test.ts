import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { bacaWorkbook, parseInt0, parseSheet } from './parse';

const sheet = (aoa: unknown[][]) => XLSX.utils.aoa_to_sheet(aoa);
const HEADER_ROVI = ['kode_toko', 'nama_toko', 'no_faktur', 'tanggal_faktur', 'tanggal_jatuh_tempo', 'nilai_faktur', 'sisa_tagihan'];

describe('US-A1 Upload data ROVI (validasi)', () => {
  it('File valid: header case-insensitive, serial date & string date dinormalisasi, kode di-normalisasi', () => {
    const r = parseSheet(
      'rovi',
      sheet([
        HEADER_ROVI.map((h) => h.toUpperCase()),
        [' tk00123 ', 'Toko Makmur Jaya', 'INV/1', 46320, '2026-11-09', 2_500_000, '1.200.000'],
      ]),
    );
    expect(r.kolomHilang).toEqual([]);
    expect(r.error).toEqual([]);
    expect(r.valid[0]).toEqual({
      kode_toko: 'TK00123',
      nama_toko: 'Toko Makmur Jaya',
      no_faktur: 'INV/1',
      tanggal_faktur: '2026-10-25',
      tanggal_jatuh_tempo: '2026-11-09',
      nilai_faktur: 2_500_000,
      sisa_tagihan: 1_200_000,
    });
  });

  it('Kolom wajib hilang → file ditolak', () => {
    const r = parseSheet('rovi', sheet([HEADER_ROVI.filter((h) => h !== 'tanggal_jatuh_tempo'), ['TK1', 'A', 'INV/1', 46320, 1, 1]]));
    expect(r.kolomHilang).toEqual(['tanggal_jatuh_tempo']);
    expect(r.valid).toEqual([]);
  });

  it('3 baris tanggal salah → 3 error dengan nomor baris Excel, baris valid tetap tersedia', () => {
    const r = parseSheet(
      'rovi',
      sheet([
        HEADER_ROVI,
        ['TK1', 'A', 'INV/1', 46320, 46335, 100, 100],
        ['TK2', 'B', 'INV/2', 46320, 'besok', 100, 100],
        ['TK3', 'C', 'INV/3', '31/02/2026', 46335, 100, 100],
        ['TK4', 'D', 'INV/4', 46320, 46335, 100, 100],
        ['TK5', 'E', 'INV/5', 46320, '2026-13-01', 100, 100],
      ]),
    );
    expect(r.valid).toHaveLength(2);
    expect(r.error.map((e) => e.baris)).toEqual([3, 4, 6]);
    expect(r.error[0].alasan).toContain('tanggal_jatuh_tempo');
  });

  it('Angka tidak valid, nilai kosong, dan no_faktur duplikat jadi error', () => {
    const r = parseSheet(
      'rovi',
      sheet([
        HEADER_ROVI,
        ['TK1', 'A', 'INV/1', 46320, 46335, 'abc', 100],
        ['', 'B', 'INV/2', 46320, 46335, 100, 100],
        ['TK3', 'C', 'INV/3', 46320, 46335, 100, 100],
        ['TK4', 'D', 'inv/3', 46320, 46335, 100, 100],
      ]),
    );
    expect(r.valid).toHaveLength(1);
    expect(r.error.map((e) => e.baris)).toEqual([2, 3, 5]);
  });

  it('CSV dibaca sebagai teks (tanggal D/M/YYYY tidak ditebak format US)', () => {
    const csv = `${HEADER_ROVI.join(',')}\nTK1,A,INV/1,1/11/2026,9/11/2026,100,100\n`;
    const wb = bacaWorkbook(new TextEncoder().encode(csv));
    const r = parseSheet('rovi', wb.Sheets[wb.SheetNames[0]]);
    expect(r.error).toEqual([]);
    expect(r.valid[0]).toMatchObject({ tanggal_faktur: '2026-11-01', tanggal_jatuh_tempo: '2026-11-09', sisa_tagihan: 100 });
  });

  it('parseInt0', () => {
    expect(parseInt0('Rp 1.250.000')).toBe(1_250_000);
    expect(parseInt0('1,250,000')).toBe(1_250_000);
    expect(parseInt0(1250.5)).toBeNull();
    expect(parseInt0('12,5')).toBeNull();
  });
});

describe('US-A2 Upload PJP (validasi)', () => {
  it('PJP valid; urutan opsional', () => {
    const r = parseSheet(
      'pjp',
      sheet([
        ['Kode_Salesman', 'Nama_Salesman', 'Tanggal_Kunjungan', 'Kode_Toko'],
        ['sls01', 'Arli', 46335, 'TK00001'],
      ]),
    );
    expect(r.error).toEqual([]);
    expect(r.valid[0]).toEqual({ kode_salesman: 'SLS01', nama_salesman: 'Arli', tanggal_kunjungan: '2026-11-09', kode_toko: 'TK00001' });
  });
});
