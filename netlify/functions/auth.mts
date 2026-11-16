/**
 * Netlify Function (v2): login, sesi, pengguna, peran & audit.
 * Env: DATABASE_URL / NETLIFY_DATABASE_URL; SUPERADMIN_EMAIL + SUPERADMIN_PASSWORD (akun pertama).
 */
import { handleAuth, pilihAuthStore } from '../lib/auth';

export default async (req: Request): Promise<Response> => {
  try {
    return await handleAuth(req, await pilihAuthStore(process.env));
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
};

export const config = { path: ['/api/auth/*', '/api/pengguna', '/api/pengguna/*', '/api/peran', '/api/peran/*', '/api/audit'] };
