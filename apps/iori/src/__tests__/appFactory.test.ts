import { describe, expect, it } from 'vitest';

import { createIoriApp } from '../appFactory.tsx';

describe('createIoriApp', () => {
  it('serves health without Node runtime dependencies', async () => {
    const app = createIoriApp({
      federationMiddleware: undefined,
      serveAsset: async () => undefined,
      serveUpload: async () => undefined,
      serveOgImage: async () => new Response('not implemented', { status: 501 }),
    });

    const response = await app.request('/health');

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('OK');
  });

  it('runs registered routes before the asset fallback', async () => {
    const app = createIoriApp({
      federationMiddleware: undefined,
      registerRoutes: (router) => {
        router.get('/posts/example', (c) => c.text('post'));
      },
      serveAsset: async () => new Response('asset'),
      serveUpload: async () => undefined,
      serveOgImage: async () => new Response('not implemented', { status: 501 }),
    });

    const response = await app.request('/posts/example');

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('post');
  });

  it('serves the Worker page fallback instead of a migration shell', async () => {
    const app = createIoriApp({
      federationMiddleware: undefined,
      serveAsset: async () => undefined,
      servePage: async (request) =>
        new URL(request.url).pathname === '/'
          ? new Response('<script type="module" src="/static/home.js"></script>', {
            headers: { 'Content-Type': 'text/html; charset=UTF-8' },
          })
          : undefined,
      serveUpload: async () => undefined,
      serveOgImage: async () => new Response('not implemented', { status: 501 }),
    });

    const response = await app.request('https://worker.test/');
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('/static/home.js');
    expect(html).not.toContain('noindex');
    expect(html).not.toContain('移行中');
  });
});
