import type { ExecutionContext } from '@cloudflare/workers-types';
import { describe, expect, it, vi } from 'vitest';

import { admissionFixture } from './testing/admissionFixture.ts';

const runtime = vi.hoisted(() => ({
  auth: { signInUseCase: {} },
  oauth: {
    registerOAuthApplicationUseCase: {},
    validateAuthorizationRequestUseCase: {},
    issueAuthorizationCodeUseCase: {},
    exchangeTokenUseCase: {},
    revokeTokenUseCase: {},
    verifyAccessTokenUseCase: {},
    oauthApplicationResolver: {},
    sessionResolver: {},
  },
  mastodon: {
    userResolver: {},
    userResolverByUsername: {},
    actorResolverByUserId: {},
    accountStatsResolver: {},
  },
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
  articles: {
    getArticleWithThreadUseCase: {},
    getArticlesUseCase: {},
    createArticleUseCase: {},
    publishArticleUseCase: {},
    unpublishArticleUseCase: {},
    deleteArticleUseCase: {},
    publishedArticlesResolver: {},
    publishOgImage: async () => undefined,
    deleteOgImage: async () => undefined,
  },
  core: {
    signUpUseCase: {},
    sendReplyUseCase: {},
    deletePostUseCase: {},
    subscribePushUseCase: {},
    vapidPublicKey: 'public-key',
  },
  mutesRelays: {
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
vi.mock('./adaptor/fedify/activityPubObjectNotFound.ts', () => ({
  federationWithObjectNotFound: () => async (_context: unknown, next: () => Promise<void>) => next(),
}));

import worker from './worker.ts';

describe('Task 7 Worker route mounting', () => {
  it('mounts notification, article, and relay API groups and no longer mounts the replaced like, mute, and remote-user follow routes', async () => {
    const env = admissionFixture() as never;
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
      worker.fetch(new Request('https://worker.test/api/iori/v1/articles/not-an-id'), env, executionContext),
      worker.fetch(new Request('https://worker.test/api/v1/articles/not-an-id'), env, executionContext),
      worker.fetch(
        new Request('https://worker.test/api/v1/mute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actorId: '573c7c51-0e4b-453c-bb9f-5dbd15a319a7' }),
        }),
        env,
        executionContext,
      ),
      worker.fetch(new Request('https://worker.test/api/iori/v1/relays'), env, executionContext),
      worker.fetch(
        new Request('https://worker.test/remote-users/573c7c51-0e4b-453c-bb9f-5dbd15a319a7/follow', {
          method: 'POST',
        }),
        env,
        executionContext,
      ),
    ]);

    expect(responses.map((response) => response.status)).toEqual([404, 401, 400, 404, 404, 401, 404]);
    expect(await responses[1]!.json()).toEqual({ error: 'The access token is invalid' });
  });
});
