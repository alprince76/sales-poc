import { describe, expect, it } from 'vitest';
import { sesiUji } from './auth';
const SA = sesiUji();
import { SEMUA_TIPE } from '../../src/lib/parse';
import { handle } from './handler';
import { memoryStore, samaIsi, TIPE } from './store';

const req = (method: string, path: string, body?: unknown) =>
  new Request(`http://x${path}`, { method, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });

describe('API /api/data', () => {
  it('daftar tipe server = SEMUA_TIPE client', () => {
    expect([...TIPE]).toEqual(SEMUA_TIPE);
  });

  it('503 bila DB belum diset', async () => {
    expect((await handle(req('GET', '/api/data/meta'), null, SA)).status).toBe(503);
  });

  it('body gzip rusak → pesan jelas; header gzip tapi body JSON polos → diterima', async () => {
    const store = memoryStore();
    const rusak = new Request('http://x/api/data/rules', { method: 'PUT', headers: { 'x-body-encoding': 'gzip' }, body: new Uint8Array([31, 139, 1, 2, 3]) });
    const r = await handle(rusak, store, SA);
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/gzip rusak/);
    const polos = new Request('http://x/api/data/rules', { method: 'PUT', headers: { 'x-body-encoding': 'gzip' }, body: '[{"kode_sku":"1","satuan":"Pcs","moq":1}]' });
    expect((await handle(polos, store, SA)).status).toBe(200);
  });

  it('PUT/GET/DELETE tanpa PIN; version naik', async () => {
    const store = memoryStore();
    const rows = [{ kode_sku: '124024', satuan: 'Pcs', moq: 6 }];
    const put = await handle(req('PUT', '/api/data/rules', rows), store, SA);
    expect((await put.json()).data).toMatchObject({ version: 1, jumlah: 1 });
    const get = await handle(req('GET', '/api/data/rules'), store, SA);
    expect(get.headers.get('x-version')).toBe('1');
    expect(await get.json()).toEqual(rows);
    await handle(req('PUT', '/api/data/rules', []), store, SA);
    expect((await (await handle(req('GET', '/api/data/meta'), store, SA)).json()).data.rules).toMatchObject({ version: 2, jumlah: 0 });
    expect((await handle(req('DELETE', '/api/data/rules'), store, SA)).status).toBe(200);
    expect((await handle(req('GET', '/api/data/rules'), store, SA)).status).toBe(404);
  });

  it('PATCH CRUD satu baris (cari berdasarkan isi, urutan key bebas)', async () => {
    const store = memoryStore();
    const a = { kode_sku: '1', moq: 3 };
    const b = { kode_sku: '2', moq: 6 };
    // tambah ke jenis yang belum ada → dibuat
    expect((await (await handle(req('PATCH', '/api/data/rules', { op: 'tambah', baru: a }), store, SA)).json()).data).toMatchObject({ version: 1, jumlah: 1 });
    await handle(req('PATCH', '/api/data/rules', { op: 'tambah', baru: b }), store, SA);
    const ubah = await handle(req('PATCH', '/api/data/rules', { op: 'ubah', lama: { moq: 3, kode_sku: '1' }, baru: { kode_sku: '1', moq: 9 } }), store, SA);
    expect((await ubah.json()).data).toMatchObject({ version: 3, jumlah: 2 });
    const hapus = await handle(req('PATCH', '/api/data/rules', { op: 'hapus', lama: b }), store, SA);
    expect((await hapus.json()).data).toMatchObject({ version: 4, jumlah: 1 });
    expect(await (await handle(req('GET', '/api/data/rules'), store, SA)).json()).toEqual([{ kode_sku: '1', moq: 9 }]);
    // baris yang sudah berubah/hilang → 404 (bukan menimpa baris lain)
    expect((await handle(req('PATCH', '/api/data/rules', { op: 'hapus', lama: b }), store, SA)).status).toBe(404);
    expect((await handle(req('PATCH', '/api/data/rules', { op: 'xx' }), store, SA)).status).toBe(400);
  });

  it('tolak tipe tak dikenal & body bukan array/JSON', async () => {
    const store = memoryStore();
    expect((await handle(req('GET', '/api/data/xyz'), store, SA)).status).toBe(404);
    expect((await handle(req('PUT', '/api/data/msl', { a: 1 }), store, SA)).status).toBe(400);
    expect((await handle(req('PUT', '/api/data/msl', '{rusak'), store, SA)).status).toBe(400);
  });

  it('samaIsi: seperti kesamaan jsonb', () => {
    expect(samaIsi({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 })).toBe(true);
    expect(samaIsi({ a: 1, x: undefined }, { a: 1 })).toBe(true);
    expect(samaIsi({ a: 1 }, { a: '1' })).toBe(false);
    expect(samaIsi([1, 2], [2, 1])).toBe(false);
  });
});
