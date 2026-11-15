/**
 * Netlify Function (v2): API sinkronisasi data master upload admin.
 * Env: NETLIFY_DATABASE_URL atau DATABASE_URL (Neon Postgres), ADMIN_TOKEN (PIN admin).
 */
import { handle } from '../lib/handler';
import { pilihStore } from '../lib/store';

export default async (req: Request): Promise<Response> => {
  try {
    return await handle(req, pilihStore(process.env), process.env.ADMIN_TOKEN);
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
};

export const config = { path: ['/api/data', '/api/data/*'] };
