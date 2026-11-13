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
    // v6 — GT dari data ASLI MD: 1.374 toko coverage Arli/Jajang/Yudha, PJP 4 minggu; MT dummy: 60 outlet.
    const gt = ds.master.filter((m) => m.channel === 'GT');
    expect(gt).toHaveLength(1374);
    expect(new Set(gt.map((m) => m.kode_salesman))).toEqual(new Set(['000024', '000032', '000033']));
    expect(ds.master.filter((m) => m.channel === 'MT')).toHaveLength(60);
    expect(ds.pjp.filter((p) => !p.kode_toko.startsWith('MT'))).toHaveLength(2183);
    expect(ds.pjp.filter((p) => p.kode_toko.startsWith('MT'))).toHaveLength(60);
    // 89 faktur asli DI AWAL (F22…) + faktur dummy untuk sisa outstanding Customer Master.
    expect(ds.rovi.filter((f) => f.no_faktur.startsWith('F22'))).toHaveLength(89);
    expect(ds.rovi.find((f) => f.no_faktur === 'F220758052')).toMatchObject({ kode_toko: '040022', nilai_faktur: 82_000, sisa_tagihan: 5_048 });
    // Kode toko berawalan 0 tetap string; "112.167" di DI dinormalisasi jadi 112167.
    expect(ds.master.find((m) => m.kode_toko === '032736')?.nama_toko).toBe('TOKO MAMAD');
    expect(ds.rovi.some((f) => f.kode_toko === '112167')).toBe(true);
    // Customer master asli: alamat, limit, TOP, RPP13.
    expect(ds.master.find((m) => m.kode_toko === '112260')).toMatchObject({
      alamat_1: 'DESA CURUK RENDENG NO.# RT 7 RW 2 JALANCAGAK', limit_kredit: 3_000_000, top_hari: 14, rpp13: 37_234, tipe_bayar: 'KREDIT',
    });
    // 9 Nov = PJP Minggu 2 Senin (TK SRC FAIDAN ada di rute Arli).
    expect(ds.pjp.some((p) => p.kode_salesman === '000024' && p.tanggal_kunjungan === D && p.kode_toko === 'A01139')).toBe(true);
    expect(ds.msl.length).toBeGreaterThan(900);
    expect(ds.produk.filter((p) => p.status_aktif === false).map((p) => p.kode_sku)).toEqual(['123906', '112403', '124021', '119741']);
    expect(ds.rovi.every((f) => ['DNE', 'CBN', 'MRS'].includes(f.divisi ?? ''))).toBe(true);
    expect(ds.produk).toHaveLength(62);
    expect(ds.rules).toHaveLength(62);
    expect(ds.histori.length).toBeGreaterThan(10_000);
    expect(ds.master.filter((m) => m.status_blokir).map((m) => m.kode_toko)).toEqual(['018568', '040032']);
    // v5: customer master, isi karton, price list GT + MT.
    expect(ds.master.every((m) => m.rpp13 !== undefined)).toBe(true);
    expect(ds.master.filter((m) => m.channel === 'MT').every((m) => m.cust_group)).toBe(true);
    expect(ds.rules.every((r) => (r.isi_karton ?? 0) >= r.moq)).toBe(true);
    expect(ds.price).toHaveLength(124);
    expect(ds.produk.every((p) => p.new_material && p.sub_brand)).toBe(true);
  });

  it('v7: kode, principal & MOQ produk = Min SKU Items NEFOKAM 09-11-2026', () => {
    const src = new Map<string, { principal: string; min: number }>();
    for (const l of readFileSync(fileURLToPath(new URL('../../docs/source/Min_SKU_Items_NEFOKAM_09_Nov_2026.md', import.meta.url)), 'utf8').split('\n')) {
      const c = l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((x) => x.trim());
      if (c.length === 7 && /^\w+$/.test(c[3]) && c[0] !== 'Barcode') src.set(c[3], { principal: c[2], min: Number(c[6]) || 0 });
    }
    const moq = new Map(ds.rules.map((r) => [r.kode_sku, r.moq]));
    for (const p of ds.produk) {
      expect(src.has(p.kode_sku), p.kode_sku).toBe(true);
      expect(p.divisi).toBe(src.get(p.kode_sku)!.principal);
      expect(moq.get(p.kode_sku)).toBe(Math.max(1, src.get(p.kode_sku)!.min));
    }
    expect(moq.get('124024')).toBe(6); // Huki CB Zak
    expect(moq.get('113785')).toBe(24); // Yupi Gummi Pizza
    expect(moq.get('112405')).toBe(3); // Yupi Milly Moos
    expect(ds.produk.find((p) => p.kode_sku === '124024')?.divisi).toBe('PT DISTRIVERSA BUANAMAS');
  });

  it('Kunjungan Hari Ini Yudha (000033) @ 2026-11-09 sama persis dengan Contoh_Output_Sales', () => {
    const rows = aoa('Contoh_Output_Sales');
    const headerIdx = rows.findIndex((r) => r[0] === 'urutan_rute');
    const header = rows[headerIdx] as string[];
    expect(header).toEqual([
      'urutan_rute', 'kode_toko', 'nama_toko', 'status', 'faktur_overdue',
      'faktur_jt_hari_ini', 'total_harus_ditagih', 'perlu_ditagih', 'max_hari_overdue',
    ]);
    const expected = rows.slice(headerIdx + 1).filter((r) => r.some((v) => v !== null && v !== ''));

    const h = hitungKunjungan(ds, '000033', D);
    const actual = h.baris.map((b) => [
      b.urutan, b.kode_toko, b.nama_toko, b.statusLabel, b.fakturOverdue,
      b.fakturJtHariIni, b.totalHarusDitagih, b.perluDitagih ? 'YA' : '-', b.maxHariOverdue,
    ]);

    expect(actual).toEqual(expected);
    expect(h.jumlahKunjungan).toBe(32);
    expect(h.jumlahPerluDitagih).toBe(10);

    // Baris judul & ringkasan
    expect(rows[0][0]).toBe(`Kunjungan Hari Ini — ${h.nama_salesman} (${h.kode_salesman}) — Senin, ${formatTanggal(D)}`);
    expect(rows[1][0]).toBe(
      `${h.jumlahKunjungan} kunjungan · ${h.jumlahPerluDitagih} perlu ditagih · total ${formatRupiah(h.totalTagihan)}`,
    );
    expect(h.totalTagihan).toBe(6_886_986);
  });

  it('Detail toko 112260 TOKO NADIRA sama persis dengan Contoh_Detail_Toko', () => {
    const rows = aoa('Contoh_Detail_Toko');
    const headerIdx = rows.findIndex((r) => r[0] === 'no_faktur');
    const expected = rows
      .slice(headerIdx + 1)
      .filter((r) => r.some((v) => v !== null && v !== ''))
      .map((r) => [r[0], normalizeDate(r[1]), normalizeDate(r[2]), r[3], r[4], r[5], r[6] === '' || r[6] === undefined ? null : r[6]]);

    const d = detailToko(ds, '112260', D);
    const actual = d.faktur.map((f) => [
      f.no_faktur, f.tanggal_faktur, f.tanggal_jatuh_tempo, f.nilai_faktur, f.sisa_tagihan,
      LABEL_STATUS_FAKTUR[f.status], f.status === 'OVERDUE' ? f.hariTerlambat : null,
    ]);

    expect(actual).toEqual(expected);
    expect(rows[0][0]).toBe(`Detail Toko — ${d.kode_toko} ${d.nama_toko} (kunjungan ${formatTanggal(D)})`);
    expect(rows[1][0]).toBe(`Harus ditagih: ${formatRupiah(d.totalHarusDitagih)}`);
    expect(d.totalHarusDitagih).toBe(860_846);
  });
});
