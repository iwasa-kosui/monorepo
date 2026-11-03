import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { createIoriApp } from '../../../appFactory.tsx';
import { createWorkerCoreApiRouter } from '../workerCoreApiRouter.ts';

const sessionCookie = 'sessionId=4dc530d6-d06c-4b4a-a021-0e1aee0b6d82';

const createDeps = () => ({
  signUpUseCase: { run: vi.fn(async () => RA.ok({ user: { username: 'newuser' } })) },
  subscribePushUseCase: { run: vi.fn() },
  unsubscribePushUseCase: { run: vi.fn() },
  vapidPublicKey: 'public-key',
  createContext: vi.fn(() => ({})),
});

describe('createWorkerCoreApiRouter', () => {
  it('mounts the remaining Worker API contracts and no longer serves the replaced follow and post listings', async () => {
    const deps = createDeps();
    const app = createIoriApp({
      federationMiddleware: undefined,
      registerRoutes: (router) => router.route('/api', createWorkerCoreApiRouter(deps as never)),
      serveAsset: async () => undefined,
      serveUpload: async () => undefined,
      serveOgImage: async () => new Response('not implemented', { status: 501 }),
    });

    const responses = await Promise.all([
      app.request('/api/v1/sign-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'newuser', password: 'a-secure-password-with-16-characters' }),
      }),
      app.request('/api/v1/follow', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
      app.request('/api/v1/remote-users/not-an-id/posts'),
      app.request('/api/v1/users/not valid/posts'),
      app.request('/api/v1/push/vapid-public-key'),
      app.request('/api/v1/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([
      200,
      404,
      404,
      404,
      200,
      400,
    ]);
  });

  it('no longer serves the replaced upload endpoint', async () => {
    const deps = createDeps();
    const app = createIoriApp({
      federationMiddleware: undefined,
      registerRoutes: (router) => router.route('/api', createWorkerCoreApiRouter(deps as never)),
      serveAsset: async () => undefined,
      serveUpload: async () => undefined,
      serveOgImage: async () => new Response('not implemented', { status: 501 }),
    });
    const form = new FormData();
    form.set('file', new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' }));

    const response = await app.request('/api/v1/upload', {
      method: 'POST',
      headers: { Cookie: sessionCookie },
      body: form,
    });

    expect(response.status).toBe(404);
  });
});
