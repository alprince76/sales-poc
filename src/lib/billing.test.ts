import { describe, expect, it } from 'vitest';
import { daftarToko, detailToko, hitungKunjungan, nilaiFaktur, normKode, ringkasTagihan, type DataInti } from './billing';
import type { Faktur, Kunjungan, MasterToko } from './types';

const D = '2026-11-09';

let seq = 0;
function faktur(kode: string, jatuhTempo: string, sisa: number, extra: Partial<Faktur> = {}): Faktur {
  seq++;
  return {
    kode_toko: kode,
    nama_toko: `Toko ${kode}`,
    no_faktur: `INV/${String(seq).padStart(4, '0')}`,
    tanggal_faktur: '2026-10-01',
    tanggal_jatuh_tempo: jatuhTempo,
    nilai_faktur: Math.max(sisa, 1_000_000),
    sisa_tagihan: sisa,
    ...extra,
  };
}
function kunjungan(sales: string, kode: string, urutan: number, tanggal = D): Kunjungan {
  return { kode_salesman: sales, nama_salesman: sales === 'SLS01' ? 'Arli' : 'Budi', tanggal_kunjungan: tanggal, kode_toko: kode, urutan };
}
function master(sales: string, kode: string, nama = `Toko ${kode}`): MasterToko {
  return { kode_salesman: sales, nama_salesman: sales, kode_toko: kode, nama_toko: nama, area: 'Cibinong' };
}
const data = (p: Partial<DataInti>): DataInti => ({ master: [], rovi: [], pjp: [], ...p });
const baris = (h: ReturnType<typeof hitungKunjungan>, kode: string) => h.baris.find((b) => b.kode_toko === kode)!;

// ───────────────────────── Gherkin: US-S2 Kunjungan hari ini ─────────────────────────
describe('US-S2 Kunjungan hari ini (D = 2026-11-09, SLS01)', () => {
  it('Toko dengan faktur jatuh tempo hari ini → badge "Jatuh Tempo Hari Ini" + Perlu Ditagih', () => {
    const h = hitungKunjungan(
      data({ pjp: [kunjungan('SLS01', 'TK00123', 1)], rovi: [faktur('TK00123', '2026-11-09', 1_200_000)] }),
      'SLS01',
      D,
    );
    const b = baris(h, 'TK00123');
    expect(b.statusLabel).toBe('Jatuh Tempo Hari Ini');
    expect(b.status).toBe('JATUH_TEMPO_HARI_INI');
    expect(b.perluDitagih).toBe(true);
  });

  it('Toko dengan faktur overdue → badge "Overdue 8 hari" dan tampil paling atas', () => {
    const h = hitungKunjungan(
      data({
        pjp: [kunjungan('SLS01', 'TK00123', 1), kunjungan('SLS01', 'TK00456', 2), kunjungan('SLS01', 'TK00999', 3)],
        rovi: [faktur('TK00123', '2026-11-09', 1_000_000), faktur('TK00456', '2026-11-01', 500_000)],
      }),
      'SLS01',
      D,
    );
    expect(baris(h, 'TK00456').statusLabel).toBe('Overdue 8 hari');
    expect(baris(h, 'TK00456').maxHariOverdue).toBe(8);
    expect(h.baris[0].kode_toko).toBe('TK00456');
  });

  it('Faktur sudah lunas tidak memicu tagihan → "Tidak ada tagihan"', () => {
    const h = hitungKunjungan(
      data({ pjp: [kunjungan('SLS01', 'TK00789', 1)], rovi: [faktur('TK00789', '2026-11-05', 0)] }),
      'SLS01',
      D,
    );
    const b = baris(h, 'TK00789');
    expect(b.statusLabel).toBe('Tidak ada tagihan');
    expect(b.perluDitagih).toBe(false);
    expect(b.totalHarusDitagih).toBe(0);
    expect(b.jumlahFakturAktif).toBe(0);
  });

  it('Toko belum jatuh tempo → tidak berlabel Perlu Ditagih', () => {
    const h = hitungKunjungan(
      data({ pjp: [kunjungan('SLS01', 'TK00321', 1)], rovi: [faktur('TK00321', '2026-11-20', 2_000_000)] }),
      'SLS01',
      D,
    );
    const b = baris(h, 'TK00321');
    expect(b.perluDitagih).toBe(false);
    expect(b.statusLabel).toBe('Tidak ada tagihan');
    expect(b.totalHarusDitagih).toBe(0);
    expect(b.fakturBelumJt).toBe(1);
  });

  it('Tidak ada jadwal hari ini → daftar kosong', () => {
    const h = hitungKunjungan(data({ pjp: [kunjungan('SLS01', 'TK00123', 1, '2026-11-10')] }), 'SLS01', D);
    expect(h.baris).toEqual([]);
    expect(h.jumlahKunjungan).toBe(0);
    expect(h.totalTagihan).toBe(0);
  });

  it('Filter "Perlu Ditagih": 15 kunjungan, 4 perlu ditagih → 4 toko', () => {
    const pjp = Array.from({ length: 15 }, (_, i) => kunjungan('SLS01', `TK${String(i + 1).padStart(5, '0')}`, i + 1));
    const rovi = [
      faktur('TK00002', '2026-11-09', 100),
      faktur('TK00005', '2026-10-30', 100),
      faktur('TK00007', '2026-11-08', 100),
      faktur('TK00011', '2026-11-09', 100),
      faktur('TK00012', '2026-11-10', 100), // belum JT
      faktur('TK00013', '2026-11-01', 0), // lunas
    ];
    const h = hitungKunjungan(data({ pjp, rovi }), 'SLS01', D);
    expect(h.jumlahKunjungan).toBe(15);
    expect(h.baris.filter((b) => b.perluDitagih)).toHaveLength(4);
    expect(h.jumlahPerluDitagih).toBe(4);
  });
});

// ───────────────────────── Gherkin: US-S1 Login (scope data) ─────────────────────────
describe('US-S1 Login salesman', () => {
  it('Salesman SLS01 hanya melihat toko di PJP miliknya', () => {
    const h = hitungKunjungan(
      data({ pjp: [kunjungan('SLS01', 'TK00001', 1), kunjungan('SLS02', 'TK00002', 1), kunjungan('SLS01', 'TK00003', 2)] }),
      'SLS01',
      D,
    );
    expect(h.baris.map((b) => b.kode_toko)).toEqual(['TK00001', 'TK00003']);
  });
});

// ───────────────────────── Gherkin: US-S3 Detail toko ─────────────────────────
describe('US-S3 Detail toko', () => {
  it('2 overdue + 1 JT hari ini; total Harus Ditagih = jumlah ketiganya; Belum JT terpisah', () => {
    const rovi = [
      faktur('TK00100', '2026-11-20', 9_000_000), // belum JT
      faktur('TK00100', '2026-11-09', 1_000_000), // JT hari ini
      faktur('TK00100', '2026-10-20', 2_000_000), // overdue 20
      faktur('TK00100', '2026-11-02', 3_000_000), // overdue 7
      faktur('TK00100', '2026-10-01', 0), // lunas
    ];
    const d = detailToko(data({ rovi, master: [master('SLS01', 'TK00100', 'Toko Makmur Jaya')] }), 'TK00100', D);
    expect(d.nama_toko).toBe('Toko Makmur Jaya');
    expect(d.overdue).toHaveLength(2);
    expect(d.jtHariIni).toHaveLength(1);
    expect(d.belumJt).toHaveLength(1);
    expect(d.totalHarusDitagih).toBe(6_000_000);
    // Urutan: overdue terlama dulu → JT → belum JT
    expect(d.faktur.map((f) => f.hariTerlambat)).toEqual([20, 7, 0, 0]);
    expect(d.faktur.map((f) => f.status)).toEqual(['OVERDUE', 'OVERDUE', 'JATUH_TEMPO_HARI_INI', 'BELUM_JATUH_TEMPO']);
  });
});

// ───────────────────────── Gherkin: US-A3 Monitoring toko & faktur ─────────────────────────
describe('US-A3 Monitoring toko dan faktur', () => {
  const ds = data({
    master: [master('SLS01', 'TK00001'), master('SLS01', 'TK00002'), master('SLS02', 'TK00003'), master('SLS02', 'TK00004')],
    rovi: [
      faktur('TK00001', '2026-11-05', 100), // overdue 4
      faktur('TK00002', '2026-10-10', 100), // overdue 30
      faktur('TK00003', '2026-11-09', 100), // JT
      faktur('TK00004', '2026-10-01', 0), // lunas
    ],
  });

  it('Filter status Overdue → hanya toko dengan ≥1 faktur aktif overdue, urut overdue paling lama', () => {
    const rows = daftarToko(ds, D, { status: 'OVERDUE' });
    expect(rows.map((r) => r.kode_toko)).toEqual(['TK00002', 'TK00001']);
  });

  it('Filter salesman + search kode/nama', () => {
    expect(daftarToko(ds, D, { kodeSalesman: 'sls02' }).map((r) => r.kode_toko).sort()).toEqual(['TK00003', 'TK00004']);
    expect(daftarToko(ds, D, { cari: 'tk00003' }).map((r) => r.kode_toko)).toEqual(['TK00003']);
  });

  it('Melihat detail faktur toko → semua faktur aktif beserta status & hari terlambat', () => {
    const d = detailToko(ds, 'TK00002', D);
    expect(d.faktur).toHaveLength(1);
    expect(d.faktur[0]).toMatchObject({ status: 'OVERDUE', hariTerlambat: 30 });
    expect(detailToko(ds, 'TK00004', D).faktur).toHaveLength(0); // lunas tidak tampil
  });
});

// ───────────────────────── Gherkin: US-A4 Monitoring rute salesman ─────────────────────────
describe('US-A4 Monitoring rute salesman', () => {
  it('Budi 2026-11-09: 15 toko, 4 Perlu Ditagih, total Rp 18.750.000', () => {
    const pjp = Array.from({ length: 15 }, (_, i) => kunjungan('SLS09', `TK${String(i + 1).padStart(5, '0')}`, i + 1));
    const rovi = [
      faktur('TK00001', '2026-11-09', 5_000_000),
      faktur('TK00004', '2026-10-15', 6_000_000),
      faktur('TK00008', '2026-11-01', 4_500_000),
      faktur('TK00012', '2026-11-09', 3_250_000),
      faktur('TK00013', '2026-11-30', 7_000_000), // belum JT, tidak dihitung
    ];
    const h = hitungKunjungan(data({ pjp, rovi }), 'SLS09', D);
    expect(h.nama_salesman).toBe('Budi');
    expect(h.jumlahKunjungan).toBe(15);
    expect(h.jumlahPerluDitagih).toBe(4);
    expect(h.totalTagihan).toBe(18_750_000);
  });
});

// ───────────────────────── Kasus tambahan ─────────────────────────
describe('Aturan tambahan', () => {
  it('BR-01/BR-07 faktur parsial: yang ditagih = sisa_tagihan, bukan nilai_faktur', () => {
    const r = ringkasTagihan([faktur('TK1', '2026-11-01', 1_200_000, { nilai_faktur: 2_500_000 })], D);
    expect(r.totalHarusDitagih).toBe(1_200_000);
    expect(r.totalOutstanding).toBe(1_200_000);
  });

  it('Campuran status: overdue + JT + belum JT + lunas', () => {
    const r = ringkasTagihan(
      [
        faktur('TK1', '2026-11-20', 400),
        faktur('TK1', '2026-11-09', 300),
        faktur('TK1', '2026-10-30', 200),
        faktur('TK1', '2026-10-01', 0),
        faktur('TK1', '2026-11-08', 100),
      ],
      D,
    );
    expect(r).toMatchObject({
      jumlahFakturAktif: 4,
      fakturOverdue: 2,
      fakturJtHariIni: 1,
      fakturBelumJt: 1,
      totalOverdue: 300,
      totalJtHariIni: 300,
      totalBelumJt: 400,
      totalHarusDitagih: 600,
      totalOutstanding: 1000,
      maxHariOverdue: 10,
      status: 'OVERDUE',
      statusLabel: 'Overdue 10 hari',
      perluDitagih: true,
    });
  });

  it('Batas hari: jatuh tempo D−1 = Overdue 1 hari, D = JT hari ini, D+1 = Belum JT', () => {
    expect(nilaiFaktur(faktur('X', '2026-11-08', 1), D)).toMatchObject({ status: 'OVERDUE', hariTerlambat: 1 });
    expect(nilaiFaktur(faktur('X', '2026-11-09', 1), D)).toMatchObject({ status: 'JATUH_TEMPO_HARI_INI', hariTerlambat: 0 });
    expect(nilaiFaktur(faktur('X', '2026-11-10', 1), D)).toMatchObject({ status: 'BELUM_JATUH_TEMPO', hariTerlambat: 0 });
    expect(nilaiFaktur(faktur('X', '2026-11-08', 0), D)).toBeNull();
  });

  it('Hari terlambat dihitung lintas bulan dengan benar', () => {
    expect(nilaiFaktur(faktur('X', '2026-10-02', 1), D)!.hariTerlambat).toBe(38);
  });

  it('BR-08 join kode_toko: trim + case-insensitive (PJP " tk00123 " ↔ ROVI "TK00123 ")', () => {
    const h = hitungKunjungan(
      data({
        pjp: [{ ...kunjungan(' sls01 ', ' tk00123 ', 1) }],
        rovi: [faktur('TK00123 ', '2026-11-01', 750_000), faktur('Tk00123', '2026-11-09', 250_000)],
        master: [master('SLS01', 'tk00123', 'TOKO A')],
      }),
      'SLS01',
      D,
    );
    expect(h.jumlahKunjungan).toBe(1);
    expect(h.baris[0]).toMatchObject({ kode_toko: 'TK00123', nama_toko: 'TOKO A', totalHarusDitagih: 1_000_000 });
    expect(normKode('  ab12 ')).toBe('AB12');
  });

  it('BR-12 join tidak pakai nama: dua toko bernama sama tetap terpisah', () => {
    const h = hitungKunjungan(
      data({
        master: [master('SLS01', 'TK00042', 'AZZAHRA'), master('SLS01', 'TK00043', 'AZZAHRA')],
        pjp: [kunjungan('SLS01', 'TK00042', 1), kunjungan('SLS01', 'TK00043', 2)],
        rovi: [faktur('TK00043', '2026-11-01', 5_850_000, { nama_toko: 'AZZAHRA' })],
      }),
      'SLS01',
      D,
    );
    expect(baris(h, 'TK00042').perluDitagih).toBe(false);
    expect(baris(h, 'TK00043').totalHarusDitagih).toBe(5_850_000);
  });

  it('BR-09 toko di PJP tanpa data ROVI/master → "Tidak ada tagihan", bukan error', () => {
    const h = hitungKunjungan(data({ pjp: [kunjungan('SLS01', 'TK99999', 1)] }), 'SLS01', D);
    expect(h.baris[0]).toMatchObject({ kode_toko: 'TK99999', statusLabel: 'Tidak ada tagihan', perluDitagih: false });
  });

  it('BR-06 urutan prioritas vs toggle urutan rute', () => {
    const ds = data({
      pjp: [
        kunjungan('SLS01', 'A', 1), // tanpa tagihan
        kunjungan('SLS01', 'B', 2), // overdue 5 + JT
        kunjungan('SLS01', 'C', 3), // JT
        kunjungan('SLS01', 'D', 4), // overdue 5
        kunjungan('SLS01', 'E', 5), // overdue 20
        kunjungan('SLS01', 'F', 6), // overdue 5 (urutan setelah D)
      ],
      rovi: [
        faktur('B', '2026-11-04', 1),
        faktur('B', '2026-11-09', 1),
        faktur('C', '2026-11-09', 1),
        faktur('D', '2026-11-04', 1),
        faktur('E', '2026-10-20', 1),
        faktur('F', '2026-11-04', 1),
      ],
    });
    expect(hitungKunjungan(ds, 'SLS01', D).baris.map((b) => b.kode_toko)).toEqual(['E', 'B', 'D', 'F', 'C', 'A']);
    expect(hitungKunjungan(ds, 'SLS01', D, { urutan: 'rute' }).baris.map((b) => b.kode_toko)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });

  it('US-S4 status relatif terhadap tanggal yang dipilih', () => {
    const rovi = [faktur('TK1', '2026-11-10', 100)];
    expect(ringkasTagihan(rovi, '2026-11-09').status).toBe('TIDAK_ADA_TAGIHAN');
    expect(ringkasTagihan(rovi, '2026-11-10').status).toBe('JATUH_TEMPO_HARI_INI');
    expect(ringkasTagihan(rovi, '2026-11-12').statusLabel).toBe('Overdue 2 hari');
  });
});
