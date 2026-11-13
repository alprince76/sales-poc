/**
 * Test regresi terhadap docs/Dummy_ROVI_PJP.xlsx.
 * Hasil HARUS sama persis dengan sheet Contoh_Output_Sales & Contoh_Detail_Toko.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { detailToko, hitungKunjungan, LABEL_STATUS_FAKTUR } from './billing';
import { formatTanggal, normalizeDate } from './dates';
import { formatRupiah } from './format';
import { bacaDataSet, bacaWorkbook } from './parse';
import type { DataSet } from './types';

const FILE = fileURLToPath(new URL('../../docs/Dummy_ROVI_PJP.xlsx', import.meta.url));
const D = '2026-11-09';

let wb: XLSX.WorkBook;
let ds: DataSet;
let parsed: ReturnType<typeof bacaDataSet>;

const aoa = (name: string) =>
  XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: null });

beforeAll(() => {
  wb = bacaWorkbook(readFileSync(FILE));
  parsed = bacaDataSet(wb);
  ds = {
    master: parsed.master.valid,
    rovi: parsed.rovi.valid,
    pjp: parsed.pjp.valid,
    produk: parsed.produk.valid,
    rules: parsed.rules.valid,
    histori: parsed.histori.valid,
    msl: parsed.msl.valid,
    price: parsed.price.valid,
  };
});

describe('Regresi Dummy_ROVI_PJP.xlsx', () => {
  it('semua baris dummy valid', () => {
    for (const k of ['master', 'rovi', 'pjp', 'produk', 'rules', 'histori', 'msl', 'price'] as const) {
      expect(parsed[k].kolomHilang).toEqual([]);
      expect(parsed[k].error).toEqual([]);
    }
    // GT asli: 1399 toko/kunjungan; MT dummy: +60 outlet & +60 kunjungan.
    expect(ds.master.filter((m) => m.channel === 'GT')).toHaveLength(1399);
    expect(ds.master.filter((m) => m.channel === 'MT')).toHaveLength(60);
    expect(ds.rovi).toHaveLength(1105);
    expect(ds.pjp.filter((p) => !p.kode_toko.startsWith('MT'))).toHaveLength(1399);
    expect(ds.pjp.filter((p) => p.kode_toko.startsWith('MT'))).toHaveLength(60);
    expect(ds.msl.length).toBeGreaterThan(900);
    expect(ds.produk.filter((p) => p.status_aktif === false).map((p) => p.kode_sku)).toEqual(['10202153', '10302136', '10402153']);
    expect(ds.rovi.every((f) => ['DNE', 'CBN', 'MRS'].includes(f.divisi ?? ''))).toBe(true);
    expect(ds.master.find((m) => m.kode_toko === 'TK00236')).toMatchObject({ tipe_bayar: 'KREDIT', top_hari: 30 });
    expect(ds.produk).toHaveLength(40);
    expect(ds.rules).toHaveLength(40);
    expect(ds.histori.length).toBeGreaterThan(10_000);
    expect(ds.master.find((m) => m.kode_toko === 'TK00054')?.status_blokir).toBe(true);
    // v5: customer master, isi karton, price list GT + MT.
    expect(ds.master.every((m) => m.alamat_1 && m.rpp13 !== undefined)).toBe(true);
    expect(ds.master.filter((m) => m.channel === 'MT').every((m) => m.cust_group)).toBe(true);
    expect(ds.rules.every((r) => (r.isi_karton ?? 0) >= r.moq)).toBe(true);
    expect(ds.price).toHaveLength(80);
    expect(ds.produk.every((p) => p.new_material && p.sub_brand)).toBe(true);
  });

  it('Kunjungan Hari Ini SLS01 @ 2026-11-09 sama persis dengan Contoh_Output_Sales', () => {
    const rows = aoa('Contoh_Output_Sales');
    const headerIdx = rows.findIndex((r) => r[0] === 'urutan_rute');
    const header = rows[headerIdx] as string[];
    expect(header).toEqual([
      'urutan_rute', 'kode_toko', 'nama_toko', 'status', 'faktur_overdue',
      'faktur_jt_hari_ini', 'total_harus_ditagih', 'perlu_ditagih', 'max_hari_overdue',
    ]);
    const expected = rows.slice(headerIdx + 1).filter((r) => r.some((v) => v !== null && v !== ''));

    const h = hitungKunjungan(ds, 'SLS01', D);
    const actual = h.baris.map((b) => [
      b.urutan, b.kode_toko, b.nama_toko, b.statusLabel, b.fakturOverdue,
      b.fakturJtHariIni, b.totalHarusDitagih, b.perluDitagih ? 'YA' : '-', b.maxHariOverdue,
    ]);

    expect(actual).toEqual(expected);
    expect(h.jumlahKunjungan).toBe(77);
    expect(h.jumlahPerluDitagih).toBe(25);

    // Baris judul & ringkasan
    expect(rows[0][0]).toBe(`Kunjungan Hari Ini — ${h.nama_salesman} (${h.kode_salesman}) — Senin, ${formatTanggal(D)}`);
    expect(rows[1][0]).toBe(
      `${h.jumlahKunjungan} kunjungan · ${h.jumlahPerluDitagih} perlu ditagih · total ${formatRupiah(h.totalTagihan)}`,
    );
    expect(h.totalTagihan).toBe(121_160_000);
  });

  it('Detail toko TK00236 sama persis dengan Contoh_Detail_Toko', () => {
    const rows = aoa('Contoh_Detail_Toko');
    const headerIdx = rows.findIndex((r) => r[0] === 'no_faktur');
    const expected = rows
      .slice(headerIdx + 1)
      .filter((r) => r.some((v) => v !== null && v !== ''))
      .map((r) => [r[0], normalizeDate(r[1]), normalizeDate(r[2]), r[3], r[4], r[5], r[6] === '' || r[6] === undefined ? null : r[6]]);

    const d = detailToko(ds, 'TK00236', D);
    const actual = d.faktur.map((f) => [
      f.no_faktur, f.tanggal_faktur, f.tanggal_jatuh_tempo, f.nilai_faktur, f.sisa_tagihan,
      LABEL_STATUS_FAKTUR[f.status], f.status === 'OVERDUE' ? f.hariTerlambat : null,
    ]);

    expect(actual).toEqual(expected);
    expect(rows[0][0]).toBe(`Detail Toko — ${d.kode_toko} ${d.nama_toko} (kunjungan ${formatTanggal(D)})`);
    expect(rows[1][0]).toBe(`Harus ditagih: ${formatRupiah(d.totalHarusDitagih)}`);
    expect(d.totalHarusDitagih).toBe(14_550_000);
  });
});
