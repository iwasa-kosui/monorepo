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

describe('Task 7 Worker route mounting', () => {
  it('mounts social, notification, article, mute, and relay API groups', async () => {
    const env = {} as never;
    const executionContext = {} as ExecutionContext;
    const responses = await Promise.all([
      worker.fetch(
        new Request('https://worker.test/api/v1/like', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ postId: '573c7c51-0e4b-453c-bb9f-5dbd15a319a7' }),
        }),
        env,
        executionContext,
      ),
      worker.fetch(new Request('https://worker.test/api/v1/notifications'), env, executionContext),
      worker.fetch(new Request('https://worker.test/api/v1/articles/not-an-id'), env, executionContext),
      worker.fetch(new Request('https://worker.test/api/v1/mutes'), env, executionContext),
      worker.fetch(new Request('https://worker.test/api/v1/relays'), env, executionContext),
    ]);

    expect(responses.map((response) => response.status)).toEqual([401, 401, 400, 401, 401]);
  });
});
