/** v8: sinkron data upload admin (client ↔ API) + upload Store/PJP per channel. */
import { describe, expect, it } from 'vitest';
import { sesiUji } from '../../netlify/lib/auth';
const SA = sesiUji();
import { handle } from '../../netlify/lib/handler';
import { memoryStore } from '../../netlify/lib/store';
import { SEMUA_TIPE } from './parse';
import { ambilData, ambilMeta, bandingVersi, RemoteError, simpanData } from './remote';
import type { Kunjungan, MasterToko } from './types';
import { gabungMaster, gabungPjp, hitungSegmen } from './upload';

const store = memoryStore();
const api: typeof fetch = async (input, init) => handle(new Request(`http://x${String(input)}`, init), store, SA);

describe('client ↔ API (in-memory)', () => {
  it('simpan (gzip) → meta & data bisa dibaca perangkat lain', async () => {
    const rows = Array.from({ length: 5000 }, (_, i) => ({ kode_toko: `T${i}`, kode_sku: '124024', tanggal_po: '2026-10-01', qty: i }));
    const info = await simpanData('histori', rows, api);
    expect(info).toMatchObject({ version: 1, jumlah: 5000 });
    expect((await ambilMeta(api)).histori?.version).toBe(1);
    expect(await ambilData('histori', api)).toEqual(rows);
  });

  it('gzip dikirim sebagai octet-stream; bila proxy merusak body gzip → ulang tanpa gzip & tetap tersimpan', async () => {
    const tipeDikirim: string[] = [];
    // Tiru Netlify lama: body ber-content-type teks dibaca sebagai UTF-8 → byte gzip rusak.
    const proxyRusak: typeof fetch = async (input, init) => {
      const h = new Headers(init?.headers);
      tipeDikirim.push(h.get('content-type') ?? '');
      let body = init?.body as BodyInit | undefined;
      if (h.get('x-body-encoding') === 'gzip') body = new TextDecoder().decode(await new Response(body).arrayBuffer());
      return handle(new Request(`http://x${String(input)}`, { ...init, body }), store, SA);
    };
    const rows = [{ kode_sku: '124024', satuan: 'Pcs', moq: 6 }];
    const info = await simpanData('rules', rows, proxyRusak);
    expect(info.jumlah).toBe(1);
    expect(tipeDikirim).toEqual(['application/octet-stream', 'application/json']);
    expect(await ambilData('rules', api)).toEqual(rows);
  });

  it('server tidak tersedia (respons HTML / network error) → RemoteError status 0', async () => {
    const html: typeof fetch = async () => new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } });
    await expect(ambilMeta(html)).rejects.toBeInstanceOf(RemoteError);
    await expect(ambilMeta(async () => Promise.reject(new TypeError('offline')))).rejects.toMatchObject({ status: 0 });
  });

  it('bandingVersi: unduh bila versi beda / belum dari server; hilang bila dihapus admin', () => {
    const r = bandingVersi(
      { master: 2, rules: 1, msl: 3 },
      { master: 'server', rules: 'server', msl: 'server', pjp: 'lokal' },
      { master: { version: 2, updatedAt: '', jumlah: 1 }, rules: { version: 2, updatedAt: '', jumlah: 1 }, pjp: { version: 1, updatedAt: '', jumlah: 1 } },
      SEMUA_TIPE,
    );
    expect(r.unduh).toEqual(['pjp', 'rules']);
    expect(r.hilang).toEqual(['msl']);
  });
});

describe('upload Store / PJP per channel', () => {
  const m = (kode: string, channel?: string): MasterToko => ({ kode_salesman: 'S', nama_salesman: 'S', kode_toko: kode, nama_toko: kode, channel });
  const k = (toko: string): Kunjungan => ({ kode_salesman: 'S', nama_salesman: 'S', tanggal_kunjungan: '2026-11-09', kode_toko: toko });
  const master = [m('G1', 'GT'), m('G2'), m('M1', 'MT'), m('M2', 'MT')];

  it('Store MT hanya mengganti toko MT; GT utuh; baris baru dipaksa MT', () => {
    const g = gabungMaster(master, [m('M9', 'GT'), m('M3')], 'MT');
    expect(g.rows.map((x) => x.kode_toko)).toEqual(['G1', 'G2', 'M9', 'M3']);
    expect(g.rows.filter((x) => x.channel === 'MT').map((x) => x.kode_toko)).toEqual(['M9', 'M3']);
    expect(g.dipaksa).toBe(1);
  });

  it('Store GT mempertahankan MT', () => {
    const g = gabungMaster(master, [m('G5')], 'GT');
    expect(g.rows.map((x) => `${x.kode_toko}:${x.channel ?? ''}`)).toEqual(['M1:MT', 'M2:MT', 'G5:GT']);
  });

  it('PJP MT hanya mengganti kunjungan ke toko MT', () => {
    const lama = [k('G1'), k('M1'), k('X0'), k('M2')];
    const g = gabungPjp(lama, [k('M2'), k('G1')], 'MT', master);
    expect(g.rows.map((x) => x.kode_toko)).toEqual(['G1', 'X0', 'M2', 'G1']);
    expect(g.diLuar).toBe(1);
    expect(hitungSegmen({ master, pjp: lama } as never, 'pjp', 'GT')).toBe(2);
    expect(hitungSegmen({ master, pjp: lama } as never, 'master', 'MT')).toBe(2);
  });
});

describe('v15: upload tambah & perbarui (upsert)', () => {
  it('MOQ: kunci sama diganti, kunci baru ditambah, sisanya tetap; isi sama dihitung "sama"', async () => {
    const { gabungUpsert } = await import('./upload');
    const lama = [
      { kode_sku: '1', satuan: 'Pcs', moq: 1 },
      { kode_sku: '2', satuan: 'Pcs', moq: 3 },
      { kode_sku: '3', satuan: 'Pcs', moq: 6 },
    ];
    const g = gabungUpsert('rules', lama, [{ kode_sku: '2', satuan: 'Pcs', moq: 12 }, { kode_sku: '3', satuan: 'Pcs', moq: 6 }, { kode_sku: '9', satuan: 'Pcs', moq: 2 }]);
    expect(g.rows.map((r) => `${r.kode_sku}:${r.moq}`)).toEqual(['1:1', '2:12', '3:6', '9:2']);
    expect(g).toMatchObject({ baru: 1, diperbarui: 1, sama: 1, tetap: 1 });
  });
  it('Store GT: toko MT tetap; kode yang sama dari MT dipindah ke GT dan dihitung', async () => {
    const { gabungUpsert } = await import('./upload');
    const lama = [
      { kode_toko: 'A', nama_toko: 'A', channel: 'GT' },
      { kode_toko: 'B', nama_toko: 'B', channel: 'MT' },
    ] as never[];
    const g = gabungUpsert('master', lama, [{ kode_toko: 'b', nama_toko: 'B baru' }, { kode_toko: 'C', nama_toko: 'C' }] as never[], 'GT');
    expect(g.rows.map((r: { kode_toko: string; channel: string }) => `${r.kode_toko}:${r.channel}`)).toEqual(['A:GT', 'b:GT', 'C:GT']);
    expect(g).toMatchObject({ baru: 1, diperbarui: 1, tetap: 1, pindahChannel: 1 });
  });
  it('Histori: kunci toko+SKU+tanggal (qty diperbarui, tanggal lain ditambah)', async () => {
    const { gabungUpsert } = await import('./upload');
    const lama = [{ kode_toko: 'T', kode_sku: '1', tanggal_po: '2026-10-01', qty: 2 }];
    const g = gabungUpsert('histori', lama, [{ kode_toko: 'T', kode_sku: '1', tanggal_po: '2026-10-01', qty: 5 }, { kode_toko: 'T', kode_sku: '1', tanggal_po: '2026-10-08', qty: 1 }]);
    expect(g.rows.map((r) => r.qty)).toEqual([5, 1]);
    expect(g).toMatchObject({ baru: 1, diperbarui: 1, tetap: 0 });
  });
  it('label MOQ: tanpa baris MOQ → tidak ada label "Min. 1" palsu', async () => {
    const { gabungProduk, labelMoq } = await import('./order');
    const [a, b] = gabungProduk(
      [
        { kode_sku: '128678', nama_sku: 'Yupi Bears', divisi: 'CP YUPI', harga: 8800 },
        { kode_sku: '123472', nama_sku: 'Bolicious', divisi: 'CP YUPI', harga: 4692 },
      ],
      [{ kode_sku: ' 128678 ', satuan: 'Pcs', moq: 3 }],
    );
    expect(labelMoq(a)).toBe('Min. 3 Pcs/item');
    expect(labelMoq(b)).toBeNull();
  });
});
