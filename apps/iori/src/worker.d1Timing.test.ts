import type { ExecutionContext } from '@cloudflare/workers-types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { admissionFixture } from './testing/admissionFixture.ts';

const captured = vi.hoisted(() => ({
  env: undefined as { DB: { prepare: (sql: string) => { first: () => Promise<unknown> } } } | undefined,
}));

const runtime = vi.hoisted(() => ({
  auth: { signInUseCase: {} },
  oauth: {
    registerOAuthApplicationUseCase: {},
    validateAuthorizationRequestUseCase: {},
    issueAuthorizationCodeUseCase: {},
    exchangeTokenUseCase: {},
    revokeTokenUseCase: {},
    verifyAccessTokenUseCase: {
      run: async () => {
        await captured.env!.DB.prepare('select 1').first();
        return { ok: false };
      },
    },
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
  createWorkerRuntimePorts: async (env: typeof captured.env) => {
    captured.env = env;
    return runtime;
  },
}));
vi.mock('./adaptor/fedify/activityPubObjectNotFound.ts', () => ({
  federationWithObjectNotFound: () => async (_context: unknown, next: () => Promise<void>) => next(),
}));

import worker from './worker.ts';

const fakeDb = {
  prepare: () => ({ first: async () => ({ ok: 1 }) }),
};

const bearer = { Authorization: 'Bearer secret-token-value' };

const timingLines = (log: { mock: { calls: ReadonlyArray<ReadonlyArray<unknown>> } }) =>
  log.mock.calls.flatMap(([line]) => typeof line === 'string' && line.includes('"d1_timing"') ? [line] : []);

describe('Worker の D1 計測ログ', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['POST', '/api/v1/statuses', 'statuses_create'],
    ['POST', '/api/v1/statuses/573c7c51-0e4b-453c-bb9f-5dbd15a319a7/favourite', 'favourite'],
  ])('%s %s の応答で 1 行だけ出す', async (method, path, route) => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const env = { ...admissionFixture(), DB: fakeDb } as never;

    const response = await worker.fetch(
      new Request(`https://worker.test${path}`, { method, headers: bearer }),
      env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(401);
    const lines = timingLines(log);
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(parsed).toMatchObject({ event: 'd1_timing', route, status: 401, calls: 1, statements: 1, sqlKnownCalls: 0 });
    expect(lines[0]).not.toMatch(/573c7c51|secret-token-value|worker\.test|select 1/);
  });

  it.each([
    ['/api/v1/timelines/home?limit=40&max_id=573c7c51', 'timelines_home'],
  ])('%s のようにクエリ文字列が付いても route を変えず、URL を出さない', async (path, route) => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const env = { ...admissionFixture(), DB: fakeDb } as never;

    await worker.fetch(new Request(`https://worker.test${path}`, { headers: bearer }), env, {} as ExecutionContext);

    const lines = timingLines(log);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({ route });
    expect(lines[0]).not.toMatch(/limit|max_id|573c7c51|\?|worker\.test|\/api\//);
  });

  it('対象外のルートでは出さない', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const env = { ...admissionFixture(), DB: fakeDb } as never;

    await worker.fetch(
      new Request('https://worker.test/api/v1/markers', { headers: bearer }),
      env,
      {} as ExecutionContext,
    );

    expect(timingLines(log)).toEqual([]);
  });

  it('D1 の結果は包まれていても元のまま呼び出し側に届く', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const env = { ...admissionFixture(), DB: fakeDb } as never;

    await worker.fetch(
      new Request('https://worker.test/api/v1/notifications', { headers: bearer }),
      env,
      {} as ExecutionContext,
    );

    expect(await captured.env!.DB.prepare('select 1').first()).toEqual({ ok: 1 });
  });
});
