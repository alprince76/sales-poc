import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { analisaSheet, bacaWorkbook, buatWorkbook, parseInt0, parseSheet, pilihSheet, SEMUA_TIPE, SKEMA } from './parse';

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
    expect(r.error[0].alasan).toContain('Tanggal jatuh tempo bukan tanggal');
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
    // v12: lebih pemaaf — desimal dibulatkan, format Indonesia/Inggris, kurung = minus, satuan dibuang.
    expect(parseInt0(1250.4)).toBe(1250);
    expect(parseInt0('12,5')).toBe(13);
    expect(parseInt0('1.250.000,00')).toBe(1_250_000);
    expect(parseInt0('1,250,000.50')).toBe(1_250_001);
    expect(parseInt0('(1.200)')).toBe(-1200);
    expect(parseInt0('-79,510')).toBe(-79510);
    expect(parseInt0('12 pcs')).toBe(12);
    expect(parseInt0('abc')).toBeNull();
    expect(parseInt0('1.2.3')).toBeNull();
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

describe('v11: file mentah & template', () => {
  const aoa = (rows: unknown[][]) => XLSX.utils.aoa_to_sheet(rows);

  it('Customer Master mentah: baris parameter dilewati, header alias dikenali, kolom wajib lain diisi nilai tetap', () => {
    const ws = aoa([
      ['CUSTOMER MASTER'],
      ['Entity', '01 s/d', 'Kode Pasar', ''],
      ['Branch', '22 s/d', 'Klasifikasi', ''],
      [],
      ['cust code1', 'cust name', 'bill adrress1', 'bill adrress2', 'ship credit limit', 'top', 'rpp13'],
      ['C046860', 'THE 101 BANDUNG', 'Jl. Ir. H. Juanda No.3', 'Kota Bandung', 0, 0, '79,510'],
      ['C046861', 'TOKO B', 'Jl. A', '', '1.500.000', 14, '-1,200'],
    ]);
    const a = analisaSheet('master', ws);
    expect(a.barisHeader).toBe(5);
    expect(a.otomatis).toMatchObject({ kode_toko: 'cust code1', nama_toko: 'cust name', alamat_1: 'bill adrress1', limit_kredit: 'ship credit limit', top_hari: 'top' });
    expect(parseSheet('master', ws).kolomHilang).toEqual(['kode_salesman', 'nama_salesman']);
    const r = parseSheet('master', ws, { kode_salesman: { tetap: '000033' }, nama_salesman: { tetap: 'YUDHA' } });
    expect(r.error).toEqual([]);
    expect(r.valid[1]).toMatchObject({ kode_toko: 'C046861', kode_salesman: '000033', limit_kredit: 1500000, top_hari: 14, rpp13: -1200 });
  });

  it('Daily Monitoring Tagihan mentah → ROVI tanpa pemetaan; nomor baris error = baris Excel', () => {
    const ws = aoa([
      ['TGL DI', 'NO DI', 'SALESMAN', 'NO', 'OUTLET', 'NAMA OUTLET', 'Tgl. INVOICE', 'DUE DATE', 'NO. INVOICE', 'NILAI INVOICE', 'BELUM BAYAR', 'Keterangan'],
      ['09-11-2026', 'DI1', 'YUDHA', 1, 'A01400', 'SRC YETI', '14-10-2026', '09-11-2026', 'F220758001', '105.750', '105.750', 'BAYAR'],
      ['09-11-2026', 'DI1', 'YUDHA', 2, 'A01401', 'TOKO B', 'kemarin', '09-11-2026', 'F220758002', '5.000', '5.000', ''],
      ['TOTAL', '', '', '', '', '', '', '', '', '110.750', '110.750', ''],
    ]);
    const r = parseSheet('rovi', ws);
    expect(r.kolomHilang).toEqual([]);
    expect(r.valid).toEqual([
      expect.objectContaining({ kode_toko: 'A01400', no_faktur: 'F220758001', tanggal_faktur: '2026-10-14', tanggal_jatuh_tempo: '2026-11-09', nilai_faktur: 105750, sisa_tagihan: 105750 }),
    ]);
    expect(r.error.map((e) => e.baris)).toEqual([3]);
    expect(r.error[0].alasan).toBe('Tanggal faktur bukan tanggal "kemarin". Tulis seperti 09-11-2026 atau 2026-11-09');
    // Baris TOTAL = baris ringkasan laporan → dilewati, tidak dihitung error.
    expect(r).toMatchObject({ dilewati: 1, totalBaris: 2 });
  });

  it('peta header manual menimpa alias (Min SKU: kode ada di kolom Nama_SKU) + satuan tetap', () => {
    const ws = aoa([
      ['Barcode', 'Kode_PCP', 'Principle', 'SKU', 'Nama_SKU', 'Status_Active', 'Min_SKU_Items'],
      ['0', '05', 'SARI HUSADA', '000', '210347', 'Y', 3],
    ]);
    const r = parseSheet('rules', ws, { kode_sku: { header: 'Nama_SKU' }, satuan: { tetap: 'Pcs' } });
    expect(r.error).toEqual([]);
    expect(r.valid).toEqual([{ kode_sku: '210347', satuan: 'Pcs', moq: 3 }]);
  });

  it('template/ekspor bisa di-upload balik tanpa error untuk semua jenis', () => {
    const contoh: Record<string, unknown[]> = {
      master: [{ kode_salesman: '000033', nama_salesman: 'YUDHA', kode_toko: '112260', nama_toko: 'TOKO NADIRA', status_blokir: false, channel: 'GT', tipe_bayar: 'KREDIT', top_hari: 14 }],
      rovi: [{ kode_toko: '112260', nama_toko: 'X', no_faktur: 'F1', tanggal_faktur: '2026-10-01', tanggal_jatuh_tempo: '2026-11-01', nilai_faktur: 1000, sisa_tagihan: 500, divisi: 'DNE' }],
      pjp: [{ kode_salesman: '000033', nama_salesman: 'YUDHA', tanggal_kunjungan: '2026-11-09', kode_toko: '112260', urutan: 1 }],
      produk: [{ kode_sku: '124024', nama_sku: 'A', divisi: 'X', harga: 1000, status_aktif: true }],
      rules: [{ kode_sku: '124024', satuan: 'Pcs', moq: 6, isi_karton: 24 }],
      histori: [{ kode_toko: '112260', kode_sku: '124024', tanggal_po: '2026-10-01', qty: 3 }],
      msl: [{ kode_toko: 'M1', kode_sku: '124024', status_listed: true }],
      price: [{ kode_sku: '124024', harga: 1200, channel: 'MT' }],
      avgorder: [{ kode_toko: 'M1', kode_sku: '124024', avg_order: 12 }],
    };
    for (const t of SEMUA_TIPE) {
      const wb = bacaWorkbook(XLSX.write(buatWorkbook(t, contoh[t]), { type: 'array', bookType: 'xlsx' }));
      expect(wb.SheetNames).toEqual([SKEMA[t].sheet, 'Petunjuk']);
      const r = parseSheet(t, pilihSheet(wb, t)!);
      expect(r.error, t).toEqual([]);
      expect(r.valid, t).toEqual([expect.objectContaining(contoh[t][0] as object)]);
    }
  });
});

describe('v12: lebih banyak baris lolos + pesan ramah', () => {
  it('tanggal: nama bulan, tahun 2 digit, yyyy/mm/dd, dengan jam', async () => {
    const { normalizeDate } = await import('./dates');
    expect(normalizeDate('9 Nov 2026')).toBe('2026-11-09');
    expect(normalizeDate('09-Agu-26')).toBe('2026-08-09');
    expect(normalizeDate('1 Desember 2026')).toBe('2026-12-01');
    expect(normalizeDate('09/11/26')).toBe('2026-11-09');
    expect(normalizeDate('2026/11/09')).toBe('2026-11-09');
    expect(normalizeDate('09-11-2026 08:30')).toBe('2026-11-09');
    expect(normalizeDate('31 Feb 2026')).toBeNull();
  });

  it('pilihan bebas: channel, tipe bayar, YA/TIDAK; "-" di kolom angka = kosong; pesan error pakai nama kolom yang dibaca manusia', () => {
    const r = parseSheet('master', XLSX.utils.aoa_to_sheet([
      ['kode_salesman', 'nama_salesman', 'kode_toko', 'nama_toko', 'channel', 'tipe_bayar', 'status_blokir', 'limit_kredit'],
      ['1', 'A', 'T1', 'X', 'General Trade', 'cash', 'Aktif', '-'],
      ['1', 'A', 'T2', 'X', 'modern trade', 'Credit', 'tidak', 'abc'],
    ]));
    expect(r.valid).toEqual([expect.objectContaining({ kode_toko: 'T1', channel: 'GT', tipe_bayar: 'TUNAI', status_blokir: true })]);
    expect(r.valid[0]).not.toHaveProperty('limit_kredit');
    expect(r.error[0].alasan).toBe('Limit kredit harus angka, bukan "abc"');
    const p = parseSheet('price', XLSX.utils.aoa_to_sheet([['kode_sku', 'harga', 'channel'], ['1', '1000', 'Semua'], ['2', '1000', 'MT']]));
    expect(p.valid).toEqual([{ kode_sku: '1', harga: 1000 }, { kode_sku: '2', harga: 1000, channel: 'MT' }]);
  });
});
