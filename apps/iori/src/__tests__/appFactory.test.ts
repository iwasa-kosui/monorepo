import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

  describe('root error handler', () => {
    const baseAdapters = {
      federationMiddleware: undefined,
      serveAsset: async () => undefined,
      serveUpload: async () => undefined,
      serveOgImage: async () => new Response('not implemented', { status: 501 }),
    } as const;

    const throwingApp = (path: string) =>
      createIoriApp({
        ...baseAdapters,
        registerRoutes: (router) => {
          router.get(path, () => {
            throw new Error('boom');
          });
        },
      });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('returns a JSON 500 for an uncaught error under /api/', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const response = await throwingApp('/api/x').request('/api/x');

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'Internal server error' });
    });

    it('returns a JSON 500 for an uncaught error under /oauth/', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const response = await throwingApp('/oauth/x').request('/oauth/x');

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'Internal server error' });
    });

    it('returns a plain text 500 for an ActivityPub Accept header', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const response = await throwingApp('/users/x').request('/users/x', {
        headers: { Accept: 'application/activity+json' },
      });

      expect(response.status).toBe(500);
      expect(response.headers.get('Content-Type')).toContain('text/plain');
      expect(await response.text()).toBe('Internal Server Error');
    });

    it('returns an HTML error page without touching the database for a browser Accept header', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const app = createIoriApp({
        ...baseAdapters,
        servePage: async () => {
          throw new Error('D1 is down');
        },
      });

      const response = await app.request('https://worker.test/users/x', {
        headers: { Accept: 'text/html,application/xhtml+xml' },
      });
      const html = await response.text();

      expect(response.status).toBe(500);
      expect(response.headers.get('Content-Type')).toContain('text/html');
      expect(html).toContain('ページを表示できませんでした');
      expect(html).toContain('href="/users/x"');
      expect(html).toContain('href="/"');
    });

    it('returns a plain text 500 when no Accept header is sent', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const response = await throwingApp('/users/x').request('/users/x');

      expect(response.status).toBe(500);
      expect(response.headers.get('Content-Type')).toContain('text/plain');
      expect(await response.text()).toBe('Internal Server Error');
    });

    it('does not treat application/json alone as ActivityPub', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const response = await throwingApp('/users/x').request('/users/x', {
        headers: { Accept: 'application/json, text/html' },
      });

      expect(response.status).toBe(500);
      expect(response.headers.get('Content-Type')).toContain('text/html');
    });

    it('returns the response of an HTTPException as is', async () => {
      const app = createIoriApp({
        ...baseAdapters,
        registerRoutes: (router) => {
          router.get('/teapot', () => {
            throw new HTTPException(418, { message: 'teapot' });
          });
        },
      });

      const response = await app.request('/teapot');

      expect(response.status).toBe(418);
      expect(await response.text()).toBe('teapot');
    });

    it('lets a sub-router onError take precedence', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const sub = new Hono();
      sub.onError((_error, c) => c.json({ error: 'sub-router' }, 503));
      sub.get('/fail', () => {
        throw new Error('boom');
      });
      const app = createIoriApp({
        ...baseAdapters,
        registerRoutes: (router) => {
          router.route('/sub', sub);
        },
      });

      const response = await app.request('/sub/fail');

      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: 'sub-router' });
    });

    it('does not log the query string', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await throwingApp('/oauth/callback').request('/oauth/callback?code=secret&state=abc');

      expect(spy).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(spy.mock.calls)).not.toContain('secret');
      expect(spy.mock.calls[0]?.[1]).toMatchObject({ method: 'GET', path: '/oauth/callback' });
    });

    it('returns a plain text 500 when the federation middleware throws for an ActivityPub request', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const app = createIoriApp({
        ...baseAdapters,
        federationMiddleware: async () => {
          throw new Error('federation failed');
        },
      });

      const response = await app.request('/users/x', {
        headers: { Accept: 'application/activity+json' },
      });

      expect(response.status).toBe(500);
      expect(response.headers.get('Content-Type')).toContain('text/plain');
      expect(await response.text()).toBe('Internal Server Error');
    });
  });
});
