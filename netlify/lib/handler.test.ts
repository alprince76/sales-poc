import { describe, expect, it } from 'vitest';
import { SEMUA_TIPE } from '../../src/lib/parse';
import { handle } from './handler';
import { memoryStore, TIPE } from './store';

const req = (method: string, path: string, init: RequestInit = {}) => new Request(`http://x${path}`, { method, ...init });

describe('API /api/data', () => {
  it('daftar tipe server = SEMUA_TIPE client', () => {
    expect([...TIPE]).toEqual(SEMUA_TIPE);
  });

  it('503 bila DB / ADMIN_TOKEN belum diset', async () => {
    expect((await handle(req('GET', '/api/data/meta'), null, 'pin')).status).toBe(503);
    const r = await handle(req('PUT', '/api/data/master', { body: '[]' }), memoryStore(), undefined);
    expect(r.status).toBe(503);
  });

  it('PUT butuh PIN; GET publik; version naik; DELETE', async () => {
    const store = memoryStore();
    expect((await handle(req('PUT', '/api/data/rules', { body: '[]' }), store, 'pin')).status).toBe(401);
    expect((await handle(req('PUT', '/api/data/rules', { body: '[]', headers: { 'x-admin-token': 'salah' } }), store, 'pin')).status).toBe(401);

    const rows = [{ kode_sku: '124024', satuan: 'Pcs', moq: 6 }];
    const put = await handle(req('PUT', '/api/data/rules', { body: JSON.stringify(rows), headers: { 'x-admin-token': 'pin' } }), store, 'pin');
    expect(put.status).toBe(200);
    expect((await put.json()).data).toMatchObject({ version: 1, jumlah: 1 });

    const get = await handle(req('GET', '/api/data/rules'), store, 'pin');
    expect(get.headers.get('x-version')).toBe('1');
    expect(await get.json()).toEqual(rows);

    await handle(req('PUT', '/api/data/rules', { body: '[]', headers: { 'x-admin-token': 'pin' } }), store, 'pin');
    const meta = await (await handle(req('GET', '/api/data/meta'), store, 'pin')).json();
    expect(meta.data.rules).toMatchObject({ version: 2, jumlah: 0 });

    expect((await handle(req('DELETE', '/api/data/rules', { headers: { 'x-admin-token': 'pin' } }), store, 'pin')).status).toBe(200);
    expect((await handle(req('GET', '/api/data/rules'), store, 'pin')).status).toBe(404);
  });

  it('tolak tipe tak dikenal & body bukan array', async () => {
    const store = memoryStore();
    expect((await handle(req('GET', '/api/data/xyz'), store, 'pin')).status).toBe(404);
    const r = await handle(req('PUT', '/api/data/msl', { body: '{"a":1}', headers: { 'x-admin-token': 'pin' } }), store, 'pin');
    expect(r.status).toBe(400);
  });
});
