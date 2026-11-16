/** v13: aktivitas lapangan (PO, penagihan, stok, kunjungan) tersinkron ke database & semua perangkat. */
import { describe, expect, it } from 'vitest';
import { sesiUji } from '../../netlify/lib/auth';
const SA = sesiUji();
import { handleAktivitas, memoryAktStore } from '../../netlify/lib/aktivitas';
import {
  bedaAkt,
  buangTerkirim,
  gabungServer,
  kirimAkt,
  nomorPO,
  resetAktServer,
  saringSetelah,
  semuaItem,
  tambahOutbox,
  tarikAkt,
} from './sinkronAktivitas';
import type { Aktivitas, Penagihan, PurchaseOrder, StatusKunjungan } from './types';

const KOSONG: Aktivitas = { penagihan: [], stok: [], po: [], kunjungan: [], retur: [] };
const po = (id: string, no: string, sales = '000033', createdAt = '2026-11-16T03:00:00Z'): PurchaseOrder => ({
  id,
  no_po: no,
  kode_toko: '112260',
  kode_salesman: sales,
  tanggal: '2026-11-16',
  items: [],
  total: 1000,
  status: 'TERKIRIM',
  createdAt,
});
const tagih = (id: string): Penagihan => ({
  id,
  no_faktur: 'F1',
  kode_toko: '112260',
  kode_salesman: '000033',
  tanggal: '2026-11-16',
  status: 'PAID',
  nominal: 500,
  createdAt: '2026-11-16T02:00:00Z',
});
const kunj = (langkah: StatusKunjungan['langkah']): StatusKunjungan => ({ kode_toko: '112260', kode_salesman: '000033', tanggal: '2026-11-16', langkah });

/** Satu "perangkat": aktivitas + outbox, memakai fungsi murni yang sama dengan state.tsx. */
function perangkat(api: typeof fetch) {
  let akt = KOSONG;
  let outbox: ReturnType<typeof bedaAkt> = [];
  let seq = 0;
  return {
    get akt() {
      return akt;
    },
    ubah(f: (a: Aktivitas) => Aktivitas) {
      const next = f(akt);
      outbox = tambahOutbox(outbox, bedaAkt(akt, next));
      akt = next;
    },
    async sinkron() {
      const h = await tarikAkt(seq, api);
      akt = gabungServer(akt, h.items, outbox);
      seq = h.seq;
      if (outbox.length) {
        const kirim = outbox;
        await kirimAkt(kirim, api);
        outbox = buangTerkirim(outbox, kirim);
      }
    },
  };
}

describe('sinkron aktivitas antar perangkat', () => {
  it('PO & penagihan dari HP sales muncul di dashboard admin (perangkat lain)', async () => {
    const store = memoryAktStore();
    const api: typeof fetch = async (i, o) => handleAktivitas(new Request(`http://x${String(i)}`, o), store, SA);
    const hp = perangkat(api);
    const admin = perangkat(api);
    hp.ubah((a) => ({ ...a, po: [po('p1', nomorPO([], '000033', '2026-11-16'))], penagihan: [tagih('t1')] }));
    await hp.sinkron();
    await admin.sinkron();
    expect(admin.akt.po.map((p) => p.no_po)).toEqual(['PO/2026/11/000033-0001']);
    expect(admin.akt.penagihan).toHaveLength(1);
  });

  it('kunjungan (1 per SR/toko/hari) ditimpa, bukan dobel; versi lokal yang belum terkirim tidak tertimpa server', async () => {
    const store = memoryAktStore();
    const api: typeof fetch = async (i, o) => handleAktivitas(new Request(`http://x${String(i)}`, o), store, SA);
    const hp = perangkat(api);
    hp.ubah((a) => ({ ...a, kunjungan: [kunj({ collection: 'SELESAI' })] }));
    await hp.sinkron();
    hp.ubah((a) => ({ ...a, kunjungan: [kunj({ collection: 'SELESAI', stok: 'SELESAI' })] }));
    await hp.sinkron();
    const lain = perangkat(api);
    await lain.sinkron();
    expect(lain.akt.kunjungan).toEqual([kunj({ collection: 'SELESAI', stok: 'SELESAI' })]);
    // Server punya versi lama, HP punya versi baru di outbox → tetap versi HP.
    const lokal = { ...KOSONG, kunjungan: [kunj({ po: 'SELESAI' })] };
    const tertunda = bedaAkt(KOSONG, lokal);
    expect(gabungServer(lokal, [{ jenis: 'kunjungan', id: tertunda[0].id, data: kunj({}) }], tertunda)).toBe(lokal);
  });

  it('gabungServer: tidak berubah → objek sama (tanpa render ulang); urut createdAt', () => {
    const a = { ...KOSONG, po: [po('p2', 'X2', '000033', '2026-11-16T05:00:00Z')] };
    const b = gabungServer(a, [{ jenis: 'po', id: 'p1', data: po('p1', 'X1', '000033', '2026-11-16T01:00:00Z') }], []);
    expect(b.po.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(gabungServer(b, [{ jenis: 'po', id: 'p1', data: po('p1', 'X1', '000033', '2026-11-16T01:00:00Z') }], [])).toBe(b);
  });

  it('outbox: revisi baru menggantikan yang lama; entri yang masuk saat sedang dikirim tidak ikut terbuang', () => {
    const o1 = tambahOutbox([], [{ jenis: 'po', id: 'p1', data: 1, t: 1 }]);
    const o2 = tambahOutbox(o1, [{ jenis: 'po', id: 'p1', data: 2, t: 2 }]);
    expect(o2).toEqual([{ jenis: 'po', id: 'p1', data: 2, t: 2 }]);
    expect(buangTerkirim(o2, o1)).toEqual(o2);
    expect(buangTerkirim(o2, o2)).toEqual([]);
  });

  it('nomor PO unik per SR: PO/YYYY/MM/<SR>-NNNN, lanjut dari nomor terbesar', () => {
    const ada = [po('a', 'PO/2026/11/000033-0001'), po('b', 'PO/2026/11/000033-0007'), po('c', 'PO/2026/11/000024-0009'), po('d', 'PO/2026/11/0003')];
    expect(nomorPO(ada, '000033', '2026-11-20')).toBe('PO/2026/11/000033-0008');
    expect(nomorPO(ada, '000033', '2026-12-01')).toBe('PO/2026/12/000033-0001');
  });

  it('reset admin: semua perangkat membuang aktivitas sebelum reset', async () => {
    const store = memoryAktStore();
    const api: typeof fetch = async (i, o) => handleAktivitas(new Request(`http://x${String(i)}`, o), store, SA);
    await kirimAkt(semuaItem({ ...KOSONG, po: [po('p1', 'X')] }), api);
    const { reset } = await resetAktServer(api);
    const h = await tarikAkt(0, api);
    expect(h).toMatchObject({ items: [], reset });
    const lama = { ...KOSONG, po: [po('p1', 'X', '000033', new Date(reset - 60_000).toISOString()), po('p2', 'Y', '000033', new Date(reset + 60_000).toISOString())] };
    expect(saringSetelah(lama, reset).po.map((p) => p.id)).toEqual(['p2']);
  });

  it('API: tarik per halaman (delta seq), item tidak valid ditolak', async () => {
    const store = memoryAktStore();
    const api: typeof fetch = async (i, o) => handleAktivitas(new Request(`http://x${String(i)}`, o), store, SA);
    await kirimAkt(semuaItem({ ...KOSONG, penagihan: [tagih('a'), tagih('b'), tagih('c')] }), api);
    const h = await tarikAkt(0, api);
    expect(h.items.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect((await tarikAkt(h.items[1].seq, api)).items.map((x) => x.id)).toEqual(['c']);
    const salah = await api('/api/aktivitas', { method: 'POST', body: JSON.stringify({ items: [{ jenis: 'lain', id: 'x', data: {} }] }) });
    expect(salah.status).toBe(400);
  });
});

describe('v15: retur', () => {
  it('retur memotong sisa tagihan faktur yang dipilih (bersama pembayaran)', async () => {
    const { applyPenagihan } = await import('./collection');
    const rovi = [
      { kode_toko: 'T1', nama_toko: 'A', no_faktur: 'F220762069', tanggal_faktur: '2026-10-01', tanggal_jatuh_tempo: '2026-11-01', nilai_faktur: 100_000, sisa_tagihan: 100_000 },
      { kode_toko: 'T1', nama_toko: 'A', no_faktur: 'F2', tanggal_faktur: '2026-10-01', tanggal_jatuh_tempo: '2026-11-01', nilai_faktur: 50_000, sisa_tagihan: 50_000 },
    ];
    const retur = [{ id: 'r1', kode_toko: 'T1', kode_salesman: '000033', tanggal: '2026-11-16', no_faktur: 'f220762069', items: [{ kode_sku: '123472', nama_sku: 'Yupi Bolicious Strawberry 12x6x40 gr', qty: 5, harga: 4_692, subtotal: 23_460 }], nominal: 23_460, createdAt: '' }];
    const pen = [{ id: 'p1', no_faktur: 'F220762069', kode_toko: 'T1', kode_salesman: '000033', tanggal: '2026-11-16', status: 'PARTIAL' as const, nominal: 10_000, createdAt: '' }];
    const out = applyPenagihan(rovi, pen, retur);
    expect(out[0].sisa_tagihan).toBe(100_000 - 23_460 - 10_000);
    expect(out[1].sisa_tagihan).toBe(50_000);
  });
  it('retur ikut tersinkron antar perangkat', async () => {
    const store = memoryAktStore();
    const api: typeof fetch = async (i, o) => handleAktivitas(new Request(`http://x${String(i)}`, o), store, SA);
    const hp = perangkat(api);
    const admin = perangkat(api);
    const r = { id: 'r1', kode_toko: 'T1', kode_salesman: '000033', tanggal: '2026-11-16', no_faktur: 'F1', items: [], nominal: 1000, createdAt: '2026-11-16T03:00:00Z' };
    hp.ubah((a) => ({ ...a, retur: [r] }));
    await hp.sinkron();
    await admin.sinkron();
    expect(admin.akt.retur).toEqual([r]);
  });
});

describe('hapus tersinkron', () => {
  it('retur dihapus di HP → tidak muncul lagi setelah sinkron, dan ikut hilang di perangkat lain', async () => {
    const store = memoryAktStore();
    const api: typeof fetch = async (i, o) => handleAktivitas(new Request(`http://x${String(i)}`, o), store, SA);
    const hp = perangkat(api);
    const admin = perangkat(api);
    const r = { id: 'r1', kode_toko: 'T1', kode_salesman: '000033', tanggal: '2026-11-16', no_faktur: 'F1', items: [], nominal: 2825, createdAt: '2026-11-16T03:00:00Z' };
    hp.ubah((a) => ({ ...a, retur: [r] }));
    await hp.sinkron();
    await admin.sinkron();
    expect(admin.akt.retur).toHaveLength(1);
    hp.ubah((a) => ({ ...a, retur: [] }));
    await hp.sinkron();
    await hp.sinkron(); // tarik ulang: tidak boleh muncul lagi
    expect(hp.akt.retur).toEqual([]);
    await admin.sinkron();
    expect(admin.akt.retur).toEqual([]);
    // Perangkat baru yang menarik dari awal juga tidak melihatnya.
    const baru = perangkat(api);
    await baru.sinkron();
    expect(baru.akt.retur).toEqual([]);
  });
  it('tanda hapus atas nama SR lain ditolak server (lingkup)', async () => {
    const { sesiUji } = await import('../../netlify/lib/auth');
    const store = memoryAktStore();
    const yudha = sesiUji({ peran: 'sales_gt', izin: { 'app.gt': { lihat: true, tambah: true } }, kode_salesman: '000033' });
    const res = await handleAktivitas(
      new Request('http://x/api/aktivitas', { method: 'POST', body: JSON.stringify({ items: [{ jenis: 'retur', id: 'rX', data: { _hapus: true, kode_salesman: '000024' } }] }) }),
      store,
      yudha,
    );
    expect(res.status).toBe(403);
  });
});

describe('retur tanpa faktur', () => {
  it('dicatat tapi tidak memotong tagihan', async () => {
    const { applyPenagihan } = await import('./collection');
    const rovi = [{ kode_toko: 'T1', nama_toko: 'A', no_faktur: 'F1', tanggal_faktur: '2026-10-01', tanggal_jatuh_tempo: '2026-11-01', nilai_faktur: 1000, sisa_tagihan: 1000 }];
    const out = applyPenagihan(rovi, [], [{ id: 'r', kode_toko: 'T1', kode_salesman: '1', tanggal: '2026-11-16', no_faktur: '', items: [], nominal: 420, createdAt: '' }]);
    expect(out[0].sisa_tagihan).toBe(1000);
  });
});
