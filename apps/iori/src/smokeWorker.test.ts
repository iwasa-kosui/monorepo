import { build } from 'esbuild';
import { describe, expect, it, vi } from 'vitest';

// @ts-expect-error The smoke helper is executed directly by Node as ESM.
import { runSmokeChecks } from '../scripts/smoke-worker-lib.mjs';

const json = (value: unknown, status = 200, contentType = 'application/json') =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': contentType } });

const healthyFetch = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.pathname === '/health') return new Response('OK');
  if (url.pathname === '/healthz') return json({ ok: true, service: 'iori' });
  if (url.pathname === '/readyz') {
    return json({
      ok: true,
      bindings: { database: true, r2: true, kv: true, queue: true, assets: true, auth: true },
    });
  }
  if (url.pathname === '/') {
    return new Response('<script type="module" src="/static/home.js"></script>', {
      headers: { 'Content-Type': 'text/html' },
    });
  }
  if (url.pathname === '/manifest.json') return json({ name: 'iori' });
  if (url.pathname === '/api/v1/home') return json({ error: 'Unauthorized' }, 401);
  if (url.pathname === '/api/v1/sign-in' && init?.method === 'POST') return json({ error: 'Bad Request' }, 400);
  if (url.pathname === '/api/v1/push/vapid-public-key') return json({ publicKey: 'public-key' });
  if (url.pathname.startsWith('/api/og/articles/')) return new Response('Not Found', { status: 404 });
  if (url.pathname === '/.well-known/webfinger') return json({ error: 'Not Found' }, 404, 'application/jrd+json');
  return new Response('Not Found', { status: 404 });
});

describe('runSmokeChecks', () => {
  it('keeps forbidden Node and native dependencies out of the Worker module graph', async () => {
    const result = await build({
      entryPoints: [new URL('./worker.ts', import.meta.url).pathname],
      bundle: true,
      format: 'esm',
      metafile: true,
      platform: 'node',
      target: 'es2022',
      write: false,
    });
    const packageName = (input: string): string => {
      const segments = input.split('/node_modules/').at(-1)?.split('/') ?? [];
      return segments[0]?.startsWith('@') ? segments.slice(0, 2).join('/') : (segments[0] ?? input);
    };
    const workerModuleGraph = [
      ...Object.keys(result.metafile.inputs).map(packageName),
      ...Object.values(result.metafile.outputs).flatMap((output) => output.imports.map((entry) => entry.path)),
    ]
      .join('\n');

    expect(workerModuleGraph).not.toMatch(/(?:node:fs|node:path|@hono\/node-server|\bpg\b|\bpostgres\b|\bsharp\b)/);
  });

  it('covers Worker pages, bindings, auth, API, ActivityPub, push, and OGP without writes', async () => {
    await runSmokeChecks('https://worker.test', healthyFetch);

    const mutatingCalls = healthyFetch.mock.calls.filter(([input, init]) => {
      const path = new URL(input instanceof Request ? input.url : String(input)).pathname;
      return init?.method !== undefined && init.method !== 'GET' && path !== '/api/v1/sign-in';
    });
    expect(mutatingCalls).toEqual([]);
  });

  it('rejects a 200 migration shell', async () => {
    const fetchWithShell = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname === '/') {
        return new Response('<meta name="robots" content="noindex"><p>Cloudflare Workers への移行中です。</p>', {
          headers: { 'Content-Type': 'text/html' },
        });
      }
      return healthyFetch(input, init);
    });

    await expect(runSmokeChecks('https://worker.test', fetchWithShell)).rejects.toThrow('migration shell');
  });

  it('rejects a deployment with an unavailable binding', async () => {
    const fetchWithBrokenD1 = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname === '/readyz') {
        return json({ ok: false, bindings: { database: false } }, 503);
      }
      return healthyFetch(input, init);
    });

    await expect(runSmokeChecks('https://worker.test', fetchWithBrokenD1)).rejects.toThrow('/readyz');
  });
});
