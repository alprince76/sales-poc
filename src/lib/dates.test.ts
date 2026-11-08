import { describe, expect, it } from 'vitest';
import { addDays, diffDays, formatTanggal, namaHari, normalizeDate, todayJakarta } from './dates';
import { formatRupiah } from './format';

describe('dates', () => {
  it('normalizeDate: serial Excel, Date, string', () => {
    expect(normalizeDate(46335)).toBe('2026-11-09');
    expect(normalizeDate(46335.75)).toBe('2026-11-09');
    expect(normalizeDate(new Date(2026, 10, 9))).toBe('2026-11-09'); // tengah malam lokal
    expect(normalizeDate('2026-11-09')).toBe('2026-11-09');
    expect(normalizeDate('2026-11-09T00:00:00Z')).toBe('2026-11-09');
    expect(normalizeDate('9/11/2026')).toBe('2026-11-09'); // format Indonesia D/M/YYYY
    expect(normalizeDate('46335')).toBe('2026-11-09');
    expect(normalizeDate('2026-02-30')).toBeNull();
    expect(normalizeDate('besok')).toBeNull();
    expect(normalizeDate('')).toBeNull();
  });

  it('diffDays / addDays', () => {
    expect(diffDays('2026-11-09', '2026-10-02')).toBe(38);
    expect(diffDays('2026-11-09', '2026-11-09')).toBe(0);
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-11-09', -1)).toBe('2026-11-08');
  });

  it('todayJakarta memakai Asia/Jakarta (UTC+7)', () => {
    expect(todayJakarta(new Date('2026-11-08T16:59:00Z'))).toBe('2026-11-08');
    expect(todayJakarta(new Date('2026-11-08T17:00:00Z'))).toBe('2026-11-09');
  });

  it('format', () => {
    expect(formatTanggal('2026-11-09')).toBe('9 Nov 2026');
    expect(namaHari('2026-11-09')).toBe('Senin');
    expect(formatRupiah(1_250_000)).toBe('Rp 1.250.000');
    expect(formatRupiah(0)).toBe('Rp 0');
  });
});
