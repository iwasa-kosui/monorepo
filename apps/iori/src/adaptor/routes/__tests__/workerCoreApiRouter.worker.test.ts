import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { createIoriApp } from '../../../appFactory.tsx';
import { createWorkerCoreApiRouter } from '../workerCoreApiRouter.ts';

const sessionCookie = 'sessionId=4dc530d6-d06c-4b4a-a021-0e1aee0b6d82';
const postId = '573c7c51-0e4b-453c-bb9f-5dbd15a319a7';

const createDeps = () => ({
  signUpUseCase: { run: vi.fn(async () => RA.ok({ user: { username: 'newuser' } })) },
  sendReplyUseCase: { run: vi.fn() },
  deletePostUseCase: { run: vi.fn() },
  sendFollowRequestUseCase: { run: vi.fn() },
  getFederatedTimelineUseCase: { run: vi.fn() },
  getUserPostsUseCase: { run: vi.fn(async () => RA.err({ message: 'not found' })) },
  getRemoteActorPostsUseCase: { run: vi.fn() },
  getServerTimelineUseCase: { run: vi.fn(async () => RA.ok({ posts: [] })) },
  threadResolver: { resolve: vi.fn() },
  subscribePushUseCase: { run: vi.fn() },
  unsubscribePushUseCase: { run: vi.fn() },
  uploads: {
    put: vi.fn(async (input) => ({
      key: `post-images/${input.imageId}/original`,
      url: `/uploads/${input.imageId}.png`,
    })),
    get: vi.fn(),
  },
  vapidPublicKey: 'public-key',
  createContext: vi.fn(() => ({})),
});

describe('createWorkerCoreApiRouter', () => {
  it('mounts the remaining Worker API contracts', async () => {
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
      app.request('/api/v1/reply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
      app.request(`/api/v1/posts/${postId}`, { method: 'DELETE' }),
      app.request('/api/v1/follow', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
      app.request('/api/v1/federated'),
      app.request('/api/v1/remote-users/not-an-id/posts'),
      app.request('/api/v1/users/not valid/posts'),
      app.request('/api/v1/thread?postId=not-an-id'),
      app.request('/api/v1/push/vapid-public-key'),
      app.request('/api/v1/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }),
      app.request('/api/v1/server-timeline'),
    ]);

    expect(responses.map((response) => response.status)).toEqual([
      200,
      400,
      401,
      400,
      401,
      400,
      400,
      400,
      200,
      400,
      200,
    ]);
  });

  it('stores uploads in R2 with their actual content type', async () => {
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

    expect(response.status).toBe(200);
    expect(deps.uploads.put).toHaveBeenCalledWith(expect.objectContaining({
      contentType: 'image/png',
      contentLength: 3,
    }));
    await expect(response.json()).resolves.toMatchObject({
      url: expect.stringMatching(/^\/uploads\/[0-9a-f-]+\.png$/),
    });
  });
});
