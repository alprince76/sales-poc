/// <reference types="vitest" />
import type { IncomingMessage, ServerResponse } from 'node:http';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { handle } from './netlify/lib/handler';
import { pilihStore } from './netlify/lib/store';

/**
 * API /api/data/* juga jalan di `npm run dev` & `vite preview` (handler yang sama dengan Netlify Function),
 * tersambung ke Neon lewat DATABASE_URL di .env → tidak perlu netlify CLI.
 */
function apiData(env: Record<string, string | undefined>): Plugin {
  const LEWATI = new Set(['host', 'connection', 'content-length', 'transfer-encoding', 'keep-alive', 'upgrade']);
  const mw = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = (req as IncomingMessage & { originalUrl?: string }).originalUrl ?? req.url ?? '';
    if (!url.startsWith('/api/data')) return next();
    try {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string' && !LEWATI.has(k)) headers.set(k, v);
      const r = await handle(
        new Request(`http://localhost${url}`, { method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined }),
        pilihStore(env),
      );
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

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  return {
    plugins: [react(), apiData(env)],
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts', 'netlify/**/*.test.ts'],
    },
  };
});
