/// <reference types="vitest" />
import { existsSync, readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { handle } from './netlify/lib/handler';
import { pilihStore } from './netlify/lib/store';
import { handleAktivitas, pilihAktStore } from './netlify/lib/aktivitas';
import { handleAuth, pilihAuthStore, sesiDari } from './netlify/lib/auth';

/**
 * API /api/data/* juga jalan di `npm run dev` & `vite preview` (handler yang sama dengan Netlify Function),
 * tersambung ke Neon lewat DATABASE_URL di .env → tidak perlu netlify CLI.
 */
function apiData(env: Record<string, string | undefined>): Plugin {
  const LEWATI = new Set(['host', 'connection', 'content-length', 'transfer-encoding', 'keep-alive', 'upgrade']);
  const mw = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = (req as IncomingMessage & { originalUrl?: string }).originalUrl ?? req.url ?? '';
    const akt = url.startsWith('/api/aktivitas');
    const auth = /^\/api\/(auth|pengguna|peran|audit)(\/|\?|$)/.test(url);
    if (!url.startsWith('/api/data') && !akt && !auth) return next();
    try {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string' && !LEWATI.has(k)) headers.set(k, v);
      const request = new Request(`http://localhost${url}`, { method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined });
      const authStore = await pilihAuthStore(env);
      const r = auth
        ? await handleAuth(request, authStore)
        : akt
          ? await handleAktivitas(request, pilihAktStore(env), await sesiDari(request, authStore))
          : await handle(request, pilihStore(env), await sesiDari(request, authStore));
      res.statusCode = r.status;
      r.headers.forEach((v, k) => res.setHeader(k, v));
      res.end(Buffer.from(await r.arrayBuffer()));
    } catch (e) {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
    }
  };
  return {
    name: 'api-data',
    configureServer: (s) => void s.middlewares.use(mw),
    configurePreviewServer: (s) => void s.middlewares.use(mw),
  };
}

/**
 * Baca nilai env APA ADANYA dari file .env (tanpa komentar "#" / variabel "$" ala dotenv),
 * supaya password seperti admin#123 tidak terpotong jadi "admin". Kutip pembungkus dibuang.
 */
function envMentah(mode: string, kunci: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`]) {
    if (!existsSync(f)) continue;
    for (const baris of readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(baris);
      if (!m || !kunci.includes(m[1])) continue;
      const v = m[2];
      out[m[1]] = /^(['"]).*\1$/.test(v) ? v.slice(1, -1) : v;
    }
  }
  return out;
}

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...envMentah(mode, ['SUPERADMIN_EMAIL', 'SUPERADMIN_PASSWORD']), ...process.env };
  return {
    plugins: [react(), apiData(env)],
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts', 'netlify/**/*.test.ts'],
    },
  };
});
