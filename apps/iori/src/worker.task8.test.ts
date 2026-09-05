import type { ExecutionContext } from '@cloudflare/workers-types';
import { describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  auth: { signInUseCase: {} },
  timeline: { getTimelineUseCase: {} },
  posting: { createPostUseCase: {} },
  socialActions: {
    sendLikeUseCase: {},
    undoLikeUseCase: {},
    sendRepostUseCase: {},
    undoRepostUseCase: {},
    sendEmojiReactUseCase: {},
    undoEmojiReactUseCase: {},
  },
  notifications: {
    getUnreadNotificationCountUseCase: {},
    getNotificationsUseCase: {},
    getLikedPostsUseCase: {},
  },
  articles: {
    getArticleWithThreadUseCase: {},
    getArticlesUseCase: {},
    createArticleUseCase: {},
    publishArticleUseCase: {},
    unpublishArticleUseCase: {},
    deleteArticleUseCase: {},
    publishedArticlesResolver: {},
    publishOgImage: async () => undefined,
  },
  core: {
    signUpUseCase: {},
    sendReplyUseCase: {},
    deletePostUseCase: {},
    sendFollowRequestUseCase: {},
    getFederatedTimelineUseCase: {},
    getUserPostsUseCase: {},
    getRemoteActorPostsUseCase: {},
    getServerTimelineUseCase: {},
    threadResolver: {},
    subscribePushUseCase: {},
    unsubscribePushUseCase: {},
    vapidPublicKey: 'public-key',
  },
  mutesRelays: {
    getMutesUseCase: {},
    createMuteUseCase: {},
    deleteMuteUseCase: {},
    subscribeRelayUseCase: {},
    allRelaysResolver: {},
  },
  uploads: { get: async () => undefined },
  federation: { createContext: () => ({}) },
}));

vi.mock('./runtime/workerRuntime.ts', () => ({
  createWorkerRuntimePorts: async () => runtime,
}));
vi.mock('@fedify/hono', () => ({
  federation: () => async (_context: unknown, next: () => Promise<void>) => next(),
}));

import worker from './worker.ts';

describe('Task 8 Worker OGP route', () => {
  it('serves the R2 object for the public OGP URL', async () => {
    const get = vi.fn(async () => ({
      body: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]).buffer,
      httpMetadata: { contentType: 'image/png', cacheControl: 'public, max-age=60' },
    }));
    const env = { UPLOADS: { get } } as never;

    const response = await worker.fetch(
      new Request('https://worker.test/api/og/articles/573c7c51-0e4b-453c-bb9f-5dbd15a319a7'),
      env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=60');
    expect(get).toHaveBeenCalledWith('og/573c7c51-0e4b-453c-bb9f-5dbd15a319a7.png');
  });

  it('rejects invalid article IDs before reading UPLOADS', async () => {
    const get = vi.fn();
    const env = { UPLOADS: { get } } as never;

    const response = await worker.fetch(
      new Request('https://worker.test/api/og/articles/not-an-article-id'),
      env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(404);
    expect(get).not.toHaveBeenCalled();
  });
});
