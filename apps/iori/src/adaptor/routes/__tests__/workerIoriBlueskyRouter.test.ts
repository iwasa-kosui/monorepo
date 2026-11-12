import { RA } from '@iwasa-kosui/result';
import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BlueskyTimelineItemsResolver } from '../../../domain/blueskyTimeline/blueskyTimelineItem.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import type { BlueskyClient, BlueskyClientError } from '../../../ports/blueskyClient.ts';
import { IsDigestOwner } from '../../../useCase/isDigestOwner.ts';
import { LikeBlueskyPostUseCase } from '../../../useCase/likeBlueskyPost.ts';
import { RepostBlueskyPostUseCase } from '../../../useCase/repostBlueskyPost.ts';
import { UndoRepostBlueskyPostUseCase } from '../../../useCase/undoRepostBlueskyPost.ts';
import { UnlikeBlueskyPostUseCase } from '../../../useCase/unlikeBlueskyPost.ts';
import { createMastodonSeed } from '../../d1/__tests__/mastodonSeed.ts';
import { createSqliteD1Fixture } from '../../d1/__tests__/sqliteFixture.ts';
import { createD1BlueskyLoginFailureResolver } from '../../d1/blueskyCrosspost/blueskyLoginFailureStore.ts';
import { createD1BlueskySyncStatusResolver } from '../../d1/blueskySyncStatus/blueskySyncStatusStore.ts';
import { createD1BlueskyLikeDeletedStore } from '../../d1/blueskyTimeline/blueskyLikeDeletedStore.ts';
import { createD1BlueskyLikeSavedStore } from '../../d1/blueskyTimeline/blueskyLikeSavedStore.ts';
import { createD1BlueskyLikeTargetResolver } from '../../d1/blueskyTimeline/blueskyLikeTargetResolver.ts';
import { createD1BlueskyRepostDeletedStore } from '../../d1/blueskyTimeline/blueskyRepostDeletedStore.ts';
import { createD1BlueskyRepostSavedStore } from '../../d1/blueskyTimeline/blueskyRepostSavedStore.ts';
import { createD1BlueskyRepostTargetResolver } from '../../d1/blueskyTimeline/blueskyRepostTargetResolver.ts';
import { createD1UserResolverByUsername } from '../../d1/user/userResolverByUsername.ts';
import { createMastodonAuthn } from '../mastodonAuthn.ts';
import { createWorkerIoriBlueskyRouter } from '../workerIoriBlueskyRouter.ts';
import { setupReadApi } from './helper/mastodonReadHarness.ts';
import { createOAuthHarness, ORIGIN } from './helper/oauthHarness.ts';

const BASE = Date.UTC(2026, 10, 8, 12);

const seedItem = (
  t: ReturnType<typeof setupReadApi>,
  n: number,
  options: { indexedAt?: number; embed?: unknown; repostedBy?: string; feedItemId?: string } = {},
) =>
  t.sqlite.prepare(
    'INSERT INTO bluesky_timeline_items(feedItemId,uri,cid,authorDid,authorHandle,authorDisplayName,authorAvatar,text,facets,embed,replyParentUri,replyParentAuthorHandle,repostedByDid,repostedByHandle,postedAt,indexedAt,fetchedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
  ).run(
    options.feedItemId ?? `at://did:plc:a/app.bsky.feed.post/${n}`,
    `at://did:plc:a/app.bsky.feed.post/${n}`,
    `cid${n}`,
    'did:plc:a',
    'alice.bsky.social',
    'Alice',
    null,
    `post ${n}`,
    JSON.stringify([{ byteStart: 0, byteEnd: 4, feature: { type: 'tag', tag: 'post' } }]),
    options.embed === undefined ? null : JSON.stringify(options.embed),
    null,
    null,
    options.repostedBy ?? null,
    options.repostedBy === undefined ? null : 'bob.bsky.social',
    BASE - 10_000,
    options.indexedAt ?? BASE - n * 1000,
    BASE,
  );

const seedCrosspost = (t: ReturnType<typeof setupReadApi>, n: number) =>
  t.sqlite.prepare(
    'INSERT INTO bluesky_crossposts(postId,status,uri,attempts,createdAt,updatedAt) VALUES (?,?,?,?,?,?)',
  ).run(`post-${n}`, 'sent', `at://did:plc:a/app.bsky.feed.post/${n}`, 1, BASE, BASE);

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

const likeClient = (overrides: Partial<Pick<BlueskyClient, 'createLike' | 'deleteLike'>> = {}) => ({
  createLike: vi.fn<BlueskyClient['createLike']>(async () =>
    RA.ok({ uri: 'at://did:plc:me/app.bsky.feed.like/3kcreated' })
  ),
  deleteLike: vi.fn<BlueskyClient['deleteLike']>(async () => RA.ok(undefined)),
  ...overrides,
});

const repostClient = (overrides: Partial<Pick<BlueskyClient, 'createRepost' | 'deleteRepost'>> = {}) => ({
  createRepost: vi.fn<BlueskyClient['createRepost']>(async () =>
    RA.ok({ uri: 'at://did:plc:me/app.bsky.feed.repost/3kcreated' })
  ),
  deleteRepost: vi.fn<BlueskyClient['deleteRepost']>(async () => RA.ok(undefined)),
  ...overrides,
});

const setupNonOwner = async (
  options: {
    scope?: string;
    blueskyLikeClient?: ReturnType<typeof likeClient>;
    blueskyRepostClient?: ReturnType<typeof repostClient>;
  } = {},
) => {
  const harness = createOAuthHarness();
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  const resolve = vi.fn(() => RA.ok([]));
  const app = new Hono().route(
    '/api',
    createWorkerIoriBlueskyRouter({
      authn: createMastodonAuthn({
        verifyAccessTokenUseCase: harness.memory.useCases.verifyAccessTokenUseCase,
        sessionResolver: harness.memory.sessionResolver as never,
      }),
      blueskyTimelineItemsResolver: { resolve } as BlueskyTimelineItemsResolver,
      blueskyTimelineEnabled: false,
      blueskySyncStatusResolver: createD1BlueskySyncStatusResolver(fixture.db),
      blueskyLoginFailureResolver: createD1BlueskyLoginFailureResolver(fixture.db, 'timeline'),
      likeBlueskyPostUseCase: options.blueskyLikeClient === undefined ? undefined : LikeBlueskyPostUseCase.create({
        client: options.blueskyLikeClient,
        targetResolver: createD1BlueskyLikeTargetResolver(fixture.db),
        savedStore: createD1BlueskyLikeSavedStore(fixture.db),
        now: Instant.now,
      }),
      unlikeBlueskyPostUseCase: options.blueskyLikeClient === undefined
        ? undefined
        : UnlikeBlueskyPostUseCase.create({
          client: options.blueskyLikeClient,
          targetResolver: createD1BlueskyLikeTargetResolver(fixture.db),
          deletedStore: createD1BlueskyLikeDeletedStore(fixture.db),
        }),
      repostBlueskyPostUseCase: options.blueskyRepostClient === undefined
        ? undefined
        : RepostBlueskyPostUseCase.create({
          client: options.blueskyRepostClient,
          targetResolver: createD1BlueskyRepostTargetResolver(fixture.db),
          viewerRepostResolver: { resolve: async () => RA.ok(null) },
          savedStore: createD1BlueskyRepostSavedStore(fixture.db),
          now: Instant.now,
        }),
      undoRepostBlueskyPostUseCase: options.blueskyRepostClient === undefined
        ? undefined
        : UndoRepostBlueskyPostUseCase.create({
          client: options.blueskyRepostClient,
          targetResolver: createD1BlueskyRepostTargetResolver(fixture.db),
          deletedStore: createD1BlueskyRepostDeletedStore(fixture.db),
        }),
      isDigestOwner: IsDigestOwner.create({ userResolverByUsername: createD1UserResolverByUsername(fixture.db) }),
    }),
  );
  const issued = await harness.issueUserToken(options.scope ?? 'read:statuses');
  const seed = createMastodonSeed(fixture);
  seed.addLocalActor('kosui');
  seed.addLocalActor('alice', issued.userId);
  const get = (path: string) =>
    app.request(`${ORIGIN}${path}`, { headers: { Authorization: `Bearer ${issued.token}` } });
  const post = (path: string) =>
    app.request(`${ORIGIN}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${issued.token}` } });
  const send = (method: 'POST' | 'DELETE', path: string, body?: unknown) =>
    app.request(`${ORIGIN}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${issued.token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { get, post, send, resolve, sqlite: fixture.sqlite };
};

describe('/api/iori/v1/bluesky/timeline', () => {
  describe('GET', () => {
    it('認証なしだと 401 にする', async () => {
      const t = setupReadApi();

      expect((await t.request('/api/iori/v1/bluesky/timeline')).status).toBe(401);
    });

    it('read:statuses を満たさない scope のトークンを 403 にする', async () => {
      const t = setupReadApi();
      const me = await t.signIn('write:accounts');

      expect((await t.request('/api/iori/v1/bluesky/timeline', { headers: me.bearer })).status).toBe(403);
    });

    it('無効でも保存済みの行を indexedAt の降順で返し、enabled は false にする', async () => {
      const t = setupReadApi();
      const me = await t.signIn('read:statuses');
      seedItem(t, 2);
      seedItem(t, 1);
      seedItem(t, 3, { indexedAt: BASE + 5000, repostedBy: 'did:plc:b' });

      const response = await t.request('/api/iori/v1/bluesky/timeline', { headers: me.bearer });

      expect(response.status).toBe(200);
      const body = await response.json() as {
        enabled: boolean;
        items: Array<Record<string, unknown>>;
        nextBefore: unknown;
      };
      expect(body.enabled).toBe(false);
      expect(body.nextBefore).toBeNull();
      expect(body.items.map((item) => item.uri)).toEqual([
        'at://did:plc:a/app.bsky.feed.post/3',
        'at://did:plc:a/app.bsky.feed.post/1',
        'at://did:plc:a/app.bsky.feed.post/2',
      ]);
      expect(body.items[0]).toEqual({
        feedItemId: 'at://did:plc:a/app.bsky.feed.post/3',
        uri: 'at://did:plc:a/app.bsky.feed.post/3',
        cid: 'cid3',
        authorDid: 'did:plc:a',
        authorHandle: 'alice.bsky.social',
        authorDisplayName: 'Alice',
        authorAvatar: null,
        text: 'post 3',
        facets: [{ byteStart: 0, byteEnd: 4, feature: { type: 'tag', tag: 'post' } }],
        embed: null,
        replyParentUri: null,
        replyParentAuthorHandle: null,
        repostedByDid: 'did:plc:b',
        repostedByHandle: 'bob.bsky.social',
        postedAt: BASE - 10_000,
        indexedAt: BASE + 5000,
        liked: false,
        reposted: false,
      });
    });

    it('scope なしでは所有者でない利用者を 403 にし、一覧のクエリを実行しない', async () => {
      const { get, resolve } = await setupNonOwner();

      const response = await get('/api/iori/v1/bluesky/timeline');

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: 'Forbidden' });
      expect(resolve).not.toHaveBeenCalled();
    });

    it('取り込みが有効なら enabled を true にする', async () => {
      const t = setupReadApi({ blueskyTimelineEnabled: true });
      const me = await t.signIn('read:statuses');

      const body = await (await t.request('/api/iori/v1/bluesky/timeline', { headers: me.bearer })).json();

      expect(body).toEqual({ enabled: true, items: [], nextBefore: null, nextBeforeId: null });
    });

    it('limit と before でページングし、続きがあるときだけ nextBefore を返す', async () => {
      const t = setupReadApi();
      const me = await t.signIn('read:statuses');
      for (const n of [1, 2, 3, 4, 5]) seedItem(t, n);
      const get = async (query: string) =>
        await (await t.request(`/api/iori/v1/bluesky/timeline${query}`, { headers: me.bearer })).json() as {
          items: Array<{ uri: string }>;
          nextBefore: number | null;
        };
      const numbers = (page: { items: Array<{ uri: string }> }) => page.items.map((item) => item.uri.split('/').pop());

      const first = await get('?limit=2');
      const second = await get(`?limit=2&before=${first.nextBefore}`);
      const third = await get(`?limit=2&before=${second.nextBefore}`);

      expect(numbers(first)).toEqual(['1', '2']);
      expect(first.nextBefore).toBe(BASE - 2000);
      expect(numbers(second)).toEqual(['3', '4']);
      expect(numbers(third)).toEqual(['5']);
      expect(third.nextBefore).toBeNull();
    });

    it('同じ indexedAt の行がページ境界をまたいでも、nextBeforeId で続きを取れる', async () => {
      const t = setupReadApi();
      const me = await t.signIn('read:statuses');
      for (const n of [1, 2, 3, 4, 5]) seedItem(t, n, { indexedAt: BASE });
      const get = async (query: string) =>
        await (await t.request(`/api/iori/v1/bluesky/timeline${query}`, { headers: me.bearer })).json() as {
          items: Array<{ uri: string }>;
          nextBefore: number | null;
          nextBeforeId: string | null;
        };
      const numbers = (page: { items: Array<{ uri: string }> }) => page.items.map((item) => item.uri.split('/').pop());
      const next = (page: { nextBefore: number | null; nextBeforeId: string | null }) =>
        `?limit=2&before=${page.nextBefore}&beforeId=${encodeURIComponent(page.nextBeforeId!)}`;

      const first = await get('?limit=2');
      const second = await get(next(first));
      const third = await get(next(second));

      expect(numbers(first)).toEqual(['5', '4']);
      expect(first.nextBefore).toBe(BASE);
      expect(first.nextBeforeId).toBe('at://did:plc:a/app.bsky.feed.post/4');
      expect(numbers(second)).toEqual(['3', '2']);
      expect(numbers(third)).toEqual(['1']);
      expect(third.nextBeforeId).toBeNull();
    });

    it('limit の既定は 40、上限は 100 にする', async () => {
      const t = setupReadApi();
      const me = await t.signIn('read:statuses');
      for (let n = 1; n <= 105; n += 1) seedItem(t, n);
      const count = async (query: string) =>
        ((await (await t.request(`/api/iori/v1/bluesky/timeline${query}`, { headers: me.bearer })).json()) as {
          items: unknown[];
        }).items.length;

      expect(await count('')).toBe(40);
      expect(await count('?limit=100')).toBe(100);
      expect(await count('?limit=500')).toBe(100);
    });

    it.each([['limit=0'], ['limit=-1'], ['limit=abc'], ['limit=1.5'], ['before=abc'], ['before=-5'], ['before=1e3'], [
      'beforeId=x',
    ], ['before=1&beforeId=']])(
      '不正なクエリ %s を 400 にする',
      async (query) => {
        const t = setupReadApi();
        const me = await t.signIn('read:statuses');

        const response = await t.request(`/api/iori/v1/bluesky/timeline?${query}`, { headers: me.bearer });

        expect(response.status).toBe(400);
      },
    );

    it('Cookie のセッションでも読める', async () => {
      const t = setupReadApi();
      const me = await t.signIn('read:statuses');

      const response = await t.request('/api/iori/v1/bluesky/timeline', {
        headers: { Cookie: `sessionId=${me.sessionId}` },
      });

      expect(response.status).toBe(200);
    });
  });

  describe('GET scope=home', () => {
    const HOME = '/api/iori/v1/bluesky/timeline?scope=home';
    const feedItemIds = async (response: Response) =>
      ((await response.json()) as { items: Array<{ feedItemId: string }> }).items.map((item) => item.feedItemId);

    it('crosspost と同じ uri の通常の行を除き、同じ uri の repost の行を残す', async () => {
      const t = setupReadApi();
      const me = await t.signIn('read:statuses');
      seedItem(t, 1, { indexedAt: BASE });
      seedItem(t, 1, {
        indexedAt: BASE - 1000,
        repostedBy: 'did:plc:b',
        feedItemId: 'at://did:plc:a/app.bsky.feed.post/1#repost:did:plc:b',
      });
      seedItem(t, 2, { indexedAt: BASE - 2000 });
      seedCrosspost(t, 1);

      const response = await t.request(HOME, { headers: me.bearer });

      expect(response.status).toBe(200);
      expect(await feedItemIds(response)).toEqual([
        'at://did:plc:a/app.bsky.feed.post/1#repost:did:plc:b',
        'at://did:plc:a/app.bsky.feed.post/2',
      ]);
    });

    it('scope なしでは crosspost の行も repost の行も返す', async () => {
      const t = setupReadApi();
      const me = await t.signIn('read:statuses');
      seedItem(t, 1, { indexedAt: BASE });
      seedItem(t, 1, {
        indexedAt: BASE - 1000,
        repostedBy: 'did:plc:b',
        feedItemId: 'at://did:plc:a/app.bsky.feed.post/1#repost:did:plc:b',
      });
      seedCrosspost(t, 1);

      const response = await t.request('/api/iori/v1/bluesky/timeline', { headers: me.bearer });

      expect(await feedItemIds(response)).toEqual([
        'at://did:plc:a/app.bsky.feed.post/1',
        'at://did:plc:a/app.bsky.feed.post/1#repost:did:plc:b',
      ]);
    });

    it('所有者でない利用者には空の結果を返し、一覧のクエリを実行しない', async () => {
      const { get, resolve } = await setupNonOwner();

      const response = await get(HOME);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ enabled: false, items: [], nextBefore: null, nextBeforeId: null });
      expect(resolve).not.toHaveBeenCalled();
    });

    it('scope が home 以外なら 400 にする', async () => {
      const t = setupReadApi();
      const me = await t.signIn('read:statuses');

      const response = await t.request('/api/iori/v1/bluesky/timeline?scope=all', { headers: me.bearer });

      expect(response.status).toBe(400);
    });
  });

  describe('いいね', () => {
    const LIKES = '/api/iori/v1/bluesky/likes';
    const ITEM = 'at://did:plc:a/app.bsky.feed.post/1';
    const likeRows = (t: { sqlite: ReturnType<typeof createSqliteD1Fixture>['sqlite'] }) =>
      t.sqlite.prepare('SELECT subjectUri, likeUri FROM bluesky_likes').all();
    const create = (t: ReturnType<typeof setupReadApi>, headers: Record<string, string>, body: unknown = {
      feedItemId: ITEM,
    }) =>
      t.request(LIKES, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      });
    const cancel = (t: ReturnType<typeof setupReadApi>, headers: Record<string, string>, feedItemId = ITEM) =>
      t.request(`${LIKES}?feedItemId=${encodeURIComponent(feedItemId)}`, { method: 'DELETE', headers });

    it('認証なしだと 401、Origin が違う Cookie だと 403 にし、Bluesky を呼ばない', async () => {
      const client = likeClient();
      const t = setupReadApi({ blueskyLikeClient: client });
      const me = await t.signIn('write:favourites');
      seedItem(t, 1);

      expect((await create(t, { Origin: ORIGIN })).status).toBe(401);
      expect((await cancel(t, { Origin: ORIGIN })).status).toBe(401);
      const evil = { Cookie: `sessionId=${me.sessionId}`, Origin: 'https://evil.example' };
      expect((await create(t, evil)).status).toBe(403);
      expect((await cancel(t, evil)).status).toBe(403);
      expect(client.createLike).not.toHaveBeenCalled();
      expect(client.deleteLike).not.toHaveBeenCalled();
    });

    it('write:favourites を満たさない scope のトークンを 403 にする', async () => {
      const client = likeClient();
      const t = setupReadApi({ blueskyLikeClient: client });
      const me = await t.signIn('read:statuses');
      seedItem(t, 1);

      expect((await create(t, me.bearer)).status).toBe(403);
      expect((await cancel(t, me.bearer)).status).toBe(403);
      expect(client.createLike).not.toHaveBeenCalled();
    });

    it('所有者でない利用者の POST を 403 にし、Bluesky を呼ばず D1 にも書かない', async () => {
      const client = likeClient();
      const t = await setupNonOwner({ scope: 'write:favourites', blueskyLikeClient: client });

      const response = await t.send('POST', LIKES, { feedItemId: ITEM });

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: 'Forbidden' });
      expect(client.createLike).not.toHaveBeenCalled();
      expect(likeRows(t)).toEqual([]);
    });

    it('所有者でない利用者の DELETE を 403 にし、Bluesky を呼ばず D1 の行も消さない', async () => {
      const client = likeClient();
      const t = await setupNonOwner({ scope: 'write:favourites', blueskyLikeClient: client });
      t.sqlite.prepare('INSERT INTO bluesky_likes(subjectUri,likeUri,createdAt) VALUES (?,?,?)')
        .run(ITEM, 'at://did:plc:me/app.bsky.feed.like/3k1', BASE);

      const response = await t.send('DELETE', `${LIKES}?feedItemId=${encodeURIComponent(ITEM)}`);

      expect(response.status).toBe(403);
      expect(client.deleteLike).not.toHaveBeenCalled();
      expect(likeRows(t)).toHaveLength(1);
    });

    it('無効のときは 409 を返し、Bluesky を呼ばない', async () => {
      const t = setupReadApi();
      const me = await t.signIn('write:favourites');
      seedItem(t, 1);

      const created = await create(t, me.bearer);
      const canceled = await cancel(t, me.bearer);

      expect(created.status).toBe(409);
      expect(canceled.status).toBe(409);
    });

    it('未知の feedItemId を 404 にし、Bluesky を呼ばない', async () => {
      const client = likeClient();
      const t = setupReadApi({ blueskyLikeClient: client });
      const me = await t.signIn('write:favourites');
      seedItem(t, 1);

      const created = await create(t, me.bearer, { feedItemId: 'at://did:plc:a/app.bsky.feed.post/999' });
      const canceled = await cancel(t, me.bearer, 'at://did:plc:a/app.bsky.feed.post/999');

      expect(created.status).toBe(404);
      expect(canceled.status).toBe(404);
      expect(client.createLike).not.toHaveBeenCalled();
      expect(client.deleteLike).not.toHaveBeenCalled();
    });

    it('feedItemId が無い、または空だと 400 にする', async () => {
      const client = likeClient();
      const t = setupReadApi({ blueskyLikeClient: client });
      const me = await t.signIn('write:favourites');

      expect((await create(t, me.bearer, {})).status).toBe(400);
      expect((await create(t, me.bearer, { feedItemId: '' })).status).toBe(400);
      expect((await create(t, me.bearer, { feedItemId: 1 })).status).toBe(400);
      expect((await t.request(LIKES, { method: 'DELETE', headers: me.bearer })).status).toBe(400);
      expect(client.createLike).not.toHaveBeenCalled();
    });

    it('POST は投稿の uri と cid を D1 の行から取って Bluesky に渡し、保存して liked: true を返す', async () => {
      const client = likeClient();
      const t = setupReadApi({ blueskyLikeClient: client });
      const me = await t.signIn('write:favourites read:statuses');
      seedItem(t, 1);

      const response = await create(t, { Cookie: `sessionId=${me.sessionId}`, Origin: ORIGIN });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ liked: true });
      expect(client.createLike).toHaveBeenCalledExactlyOnceWith({ uri: ITEM, cid: 'cid1' }, expect.any(String));
      expect(likeRows(t)).toEqual([{ subjectUri: ITEM, likeUri: 'at://did:plc:me/app.bsky.feed.like/3kcreated' }]);
      const timeline = await (await t.request('/api/iori/v1/bluesky/timeline', { headers: me.bearer })).json() as {
        items: Array<{ liked: boolean; likeUri?: string }>;
      };
      expect(timeline.items.map((item) => item.liked)).toEqual([true]);
      expect(timeline.items[0]).not.toHaveProperty('likeUri');
    });

    it('DELETE は likeUri の rkey で削除し、行を消して liked: false を返す', async () => {
      const client = likeClient();
      const t = setupReadApi({ blueskyLikeClient: client });
      const me = await t.signIn('write:favourites');
      seedItem(t, 1);
      t.sqlite.prepare('INSERT INTO bluesky_likes(subjectUri,likeUri,createdAt) VALUES (?,?,?)')
        .run(ITEM, 'at://did:plc:me/app.bsky.feed.like/3kabc', BASE);

      const response = await cancel(t, me.bearer);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ liked: false });
      expect(client.deleteLike).toHaveBeenCalledExactlyOnceWith('3kabc');
      expect(likeRows(t)).toEqual([]);
    });

    it('Bluesky への呼び出しが失敗したら 502 にし、詳細を返さず D1 も変えない', async () => {
      const error: BlueskyClientError = {
        type: 'BlueskyClientError',
        kind: 'http',
        message: 'createRecord failed: status 500 InternalServerError',
        status: 500,
      };
      const client = likeClient({
        createLike: vi.fn<BlueskyClient['createLike']>(async () => RA.err(error)),
        deleteLike: vi.fn<BlueskyClient['deleteLike']>(async () => RA.err(error)),
      });
      const t = setupReadApi({ blueskyLikeClient: client });
      const me = await t.signIn('write:favourites');
      seedItem(t, 1);
      seedItem(t, 2);
      t.sqlite.prepare('INSERT INTO bluesky_likes(subjectUri,likeUri,createdAt) VALUES (?,?,?)')
        .run('at://did:plc:a/app.bsky.feed.post/2', 'at://did:plc:me/app.bsky.feed.like/3k2', BASE);

      const created = await create(t, me.bearer);
      const canceled = await cancel(t, me.bearer, 'at://did:plc:a/app.bsky.feed.post/2');

      expect(created.status).toBe(502);
      expect(await created.json()).toEqual({ error: 'Bluesky request failed' });
      expect(canceled.status).toBe(502);
      expect(likeRows(t)).toEqual([
        { subjectUri: 'at://did:plc:a/app.bsky.feed.post/2', likeUri: 'at://did:plc:me/app.bsky.feed.like/3k2' },
      ]);
    });

    it('認証の失敗なら 502 のまま、error を Bluesky login failed にする', async () => {
      const error: BlueskyClientError = {
        type: 'BlueskyClientError',
        kind: 'auth',
        message: 'createSession skipped: waiting after a recent login failure',
      };
      const client = likeClient({
        createLike: vi.fn<BlueskyClient['createLike']>(async () => RA.err(error)),
        deleteLike: vi.fn<BlueskyClient['deleteLike']>(async () => RA.err(error)),
      });
      const t = setupReadApi({ blueskyLikeClient: client });
      const me = await t.signIn('write:favourites');
      seedItem(t, 1);
      seedItem(t, 2);
      t.sqlite.prepare('INSERT INTO bluesky_likes(subjectUri,likeUri,createdAt) VALUES (?,?,?)')
        .run('at://did:plc:a/app.bsky.feed.post/2', 'at://did:plc:me/app.bsky.feed.like/3k2', BASE);

      const created = await create(t, me.bearer);
      const canceled = await cancel(t, me.bearer, 'at://did:plc:a/app.bsky.feed.post/2');

      expect(created.status).toBe(502);
      expect(await created.json()).toEqual({ error: 'Bluesky login failed' });
      expect(canceled.status).toBe(502);
      expect(await canceled.json()).toEqual({ error: 'Bluesky login failed' });
    });
  });

  describe('リポスト', () => {
    const REPOSTS = '/api/iori/v1/bluesky/reposts';
    const ITEM = 'at://did:plc:a/app.bsky.feed.post/1';
    const repostRows = (t: { sqlite: ReturnType<typeof createSqliteD1Fixture>['sqlite'] }) =>
      t.sqlite.prepare('SELECT subjectUri, repostUri FROM bluesky_reposts').all();
    const create = (t: ReturnType<typeof setupReadApi>, headers: Record<string, string>, body: unknown = {
      feedItemId: ITEM,
    }) =>
      t.request(REPOSTS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      });
    const cancel = (t: ReturnType<typeof setupReadApi>, headers: Record<string, string>, feedItemId = ITEM) =>
      t.request(`${REPOSTS}?feedItemId=${encodeURIComponent(feedItemId)}`, { method: 'DELETE', headers });

    it('認証なしだと 401、Origin が違う Cookie だと 403 にし、Bluesky を呼ばない', async () => {
      const client = repostClient();
      const t = setupReadApi({ blueskyRepostClient: client });
      const me = await t.signIn('write:statuses');
      seedItem(t, 1);

      expect((await create(t, { Origin: ORIGIN })).status).toBe(401);
      expect((await cancel(t, { Origin: ORIGIN })).status).toBe(401);
      const evil = { Cookie: `sessionId=${me.sessionId}`, Origin: 'https://evil.example' };
      expect((await create(t, evil)).status).toBe(403);
      expect((await cancel(t, evil)).status).toBe(403);
      expect(client.createRepost).not.toHaveBeenCalled();
      expect(client.deleteRepost).not.toHaveBeenCalled();
    });

    it('write:statuses を満たさない scope のトークンを 403 にする', async () => {
      const client = repostClient();
      const t = setupReadApi({ blueskyRepostClient: client });
      const me = await t.signIn('write:favourites');
      seedItem(t, 1);

      expect((await create(t, me.bearer)).status).toBe(403);
      expect((await cancel(t, me.bearer)).status).toBe(403);
      expect(client.createRepost).not.toHaveBeenCalled();
    });

    it('所有者でない利用者の POST を 403 にし、Bluesky を呼ばず D1 にも書かない', async () => {
      const client = repostClient();
      const t = await setupNonOwner({ scope: 'write:statuses', blueskyRepostClient: client });

      const response = await t.send('POST', REPOSTS, { feedItemId: ITEM });

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: 'Forbidden' });
      expect(client.createRepost).not.toHaveBeenCalled();
      expect(repostRows(t)).toEqual([]);
    });

    it('所有者でない利用者の DELETE を 403 にし、Bluesky を呼ばず D1 の行も消さない', async () => {
      const client = repostClient();
      const t = await setupNonOwner({ scope: 'write:statuses', blueskyRepostClient: client });
      t.sqlite.prepare('INSERT INTO bluesky_reposts(subjectUri,repostUri,createdAt) VALUES (?,?,?)')
        .run(ITEM, 'at://did:plc:me/app.bsky.feed.repost/3k1', BASE);

      const response = await t.send('DELETE', `${REPOSTS}?feedItemId=${encodeURIComponent(ITEM)}`);

      expect(response.status).toBe(403);
      expect(client.deleteRepost).not.toHaveBeenCalled();
      expect(repostRows(t)).toHaveLength(1);
    });

    it('無効のときは 409 を返し、Bluesky を呼ばない', async () => {
      const t = setupReadApi();
      const me = await t.signIn('write:statuses');
      seedItem(t, 1);

      const created = await create(t, me.bearer);
      const canceled = await cancel(t, me.bearer);

      expect(created.status).toBe(409);
      expect(canceled.status).toBe(409);
    });

    it('未知の feedItemId を 404 にし、Bluesky を呼ばない', async () => {
      const client = repostClient();
      const t = setupReadApi({ blueskyRepostClient: client });
      const me = await t.signIn('write:statuses');
      seedItem(t, 1);

      const created = await create(t, me.bearer, { feedItemId: 'at://did:plc:a/app.bsky.feed.post/999' });
      const canceled = await cancel(t, me.bearer, 'at://did:plc:a/app.bsky.feed.post/999');

      expect(created.status).toBe(404);
      expect(canceled.status).toBe(404);
      expect(client.createRepost).not.toHaveBeenCalled();
      expect(client.deleteRepost).not.toHaveBeenCalled();
    });

    it('feedItemId が無い、または空だと 400 にする', async () => {
      const client = repostClient();
      const t = setupReadApi({ blueskyRepostClient: client });
      const me = await t.signIn('write:statuses');

      expect((await create(t, me.bearer, {})).status).toBe(400);
      expect((await create(t, me.bearer, { feedItemId: '' })).status).toBe(400);
      expect((await create(t, me.bearer, { feedItemId: 1 })).status).toBe(400);
      expect((await t.request(REPOSTS, { method: 'DELETE', headers: me.bearer })).status).toBe(400);
      expect(client.createRepost).not.toHaveBeenCalled();
    });

    it('POST は投稿の uri と cid を D1 の行から取って Bluesky に渡し、保存して reposted: true を返す', async () => {
      const client = repostClient();
      const t = setupReadApi({ blueskyRepostClient: client });
      const me = await t.signIn('write:statuses read:statuses');
      seedItem(t, 1);

      const response = await create(t, { Cookie: `sessionId=${me.sessionId}`, Origin: ORIGIN });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ reposted: true });
      expect(client.createRepost).toHaveBeenCalledExactlyOnceWith({ uri: ITEM, cid: 'cid1' }, expect.any(String));
      expect(repostRows(t)).toEqual([
        { subjectUri: ITEM, repostUri: 'at://did:plc:me/app.bsky.feed.repost/3kcreated' },
      ]);
      const timeline = await (await t.request('/api/iori/v1/bluesky/timeline', { headers: me.bearer })).json() as {
        items: Array<{ reposted: boolean; repostUri?: string }>;
      };
      expect(timeline.items.map((item) => item.reposted)).toEqual([true]);
      expect(timeline.items[0]).not.toHaveProperty('repostUri');
    });

    it('DELETE は repostUri の rkey で削除し、行を消して reposted: false を返す', async () => {
      const client = repostClient();
      const t = setupReadApi({ blueskyRepostClient: client });
      const me = await t.signIn('write:statuses');
      seedItem(t, 1);
      t.sqlite.prepare('INSERT INTO bluesky_reposts(subjectUri,repostUri,createdAt) VALUES (?,?,?)')
        .run(ITEM, 'at://did:plc:me/app.bsky.feed.repost/3kabc', BASE);

      const response = await cancel(t, me.bearer);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ reposted: false });
      expect(client.deleteRepost).toHaveBeenCalledExactlyOnceWith('3kabc');
      expect(repostRows(t)).toEqual([]);
    });

    it('Bluesky への呼び出しが失敗したら 502 にし、詳細を返さず D1 も変えない', async () => {
      const error: BlueskyClientError = {
        type: 'BlueskyClientError',
        kind: 'http',
        message: 'putRecord failed: status 500 InternalServerError',
        status: 500,
      };
      const client = repostClient({
        createRepost: vi.fn<BlueskyClient['createRepost']>(async () => RA.err(error)),
        deleteRepost: vi.fn<BlueskyClient['deleteRepost']>(async () => RA.err(error)),
      });
      const t = setupReadApi({ blueskyRepostClient: client });
      const me = await t.signIn('write:statuses');
      seedItem(t, 1);
      seedItem(t, 2);
      t.sqlite.prepare('INSERT INTO bluesky_reposts(subjectUri,repostUri,createdAt) VALUES (?,?,?)')
        .run('at://did:plc:a/app.bsky.feed.post/2', 'at://did:plc:me/app.bsky.feed.repost/3k2', BASE);

      const created = await create(t, me.bearer);
      const canceled = await cancel(t, me.bearer, 'at://did:plc:a/app.bsky.feed.post/2');

      expect(created.status).toBe(502);
      expect(await created.json()).toEqual({ error: 'Bluesky request failed' });
      expect(canceled.status).toBe(502);
      expect(repostRows(t)).toEqual([
        { subjectUri: 'at://did:plc:a/app.bsky.feed.post/2', repostUri: 'at://did:plc:me/app.bsky.feed.repost/3k2' },
      ]);
    });

    it('認証の失敗なら 502 のまま、error を Bluesky login failed にする', async () => {
      const error: BlueskyClientError = {
        type: 'BlueskyClientError',
        kind: 'auth',
        message: 'createSession skipped: waiting after a recent login failure',
      };
      const client = repostClient({
        createRepost: vi.fn<BlueskyClient['createRepost']>(async () => RA.err(error)),
        deleteRepost: vi.fn<BlueskyClient['deleteRepost']>(async () => RA.err(error)),
      });
      const t = setupReadApi({ blueskyRepostClient: client });
      const me = await t.signIn('write:statuses');
      seedItem(t, 1);
      seedItem(t, 2);
      t.sqlite.prepare('INSERT INTO bluesky_reposts(subjectUri,repostUri,createdAt) VALUES (?,?,?)')
        .run('at://did:plc:a/app.bsky.feed.post/2', 'at://did:plc:me/app.bsky.feed.repost/3k2', BASE);

      const created = await create(t, me.bearer);
      const canceled = await cancel(t, me.bearer, 'at://did:plc:a/app.bsky.feed.post/2');

      expect(created.status).toBe(502);
      expect(await created.json()).toEqual({ error: 'Bluesky login failed' });
      expect(canceled.status).toBe(502);
      expect(await canceled.json()).toEqual({ error: 'Bluesky login failed' });
    });
  });
});

describe('/api/iori/v1/bluesky/status', () => {
  const STATUS = '/api/iori/v1/bluesky/status';
  const NOW = Instant.orThrow(BASE + 60 * 60 * 1000);
  const isoAt = (at: number) => new Date(at).toISOString();
  const seedSync = (
    t: ReturnType<typeof setupReadApi>,
    scope: string,
    values: {
      succeededAt?: number;
      failedAt?: number;
      kind?: string;
      code?: string;
    },
  ) =>
    t.sqlite.prepare(
      'INSERT INTO bluesky_sync_status(scope,lastSucceededAt,lastFailedAt,lastFailureKind,lastFailureCode) VALUES (?,?,?,?,?)',
    ).run(scope, values.succeededAt ?? null, values.failedAt ?? null, values.kind ?? null, values.code ?? null);

  it('認証なしだと 401 にする', async () => {
    const t = setupReadApi({ blueskyTimelineEnabled: true });

    expect((await t.request(STATUS)).status).toBe(401);
  });

  it('read:statuses を満たさない scope のトークンを 403 にする', async () => {
    const t = setupReadApi({ blueskyTimelineEnabled: true });
    const me = await t.signIn('write:accounts');

    expect((await t.request(STATUS, { headers: me.bearer })).status).toBe(403);
  });

  it('無効なら enabled: false だけを返し、保存済みの記録を返さない', async () => {
    const t = setupReadApi({ blueskyTimelineEnabled: false });
    const me = await t.signIn('read:statuses');
    seedSync(t, 'timeline', { failedAt: BASE, kind: 'auth' });

    const response = await t.request(STATUS, { headers: me.bearer });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ enabled: false });
  });

  it('所有者でない利用者には enabled: false を返す', async () => {
    const { get } = await setupNonOwner();

    const response = await get(STATUS);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ enabled: false });
  });

  it('有効で記録が無ければ、どの scope も unknown にして login を ok にする', async () => {
    const t = setupReadApi({ blueskyTimelineEnabled: true, blueskyNow: () => NOW });
    const me = await t.signIn('read:statuses');

    const body = await (await t.request(STATUS, { headers: me.bearer })).json();

    const unknown = {
      state: 'unknown',
      lastSucceededAt: null,
      lastFailedAt: null,
      failureKind: null,
      failureCode: null,
    };
    expect(body).toEqual({ enabled: true, timeline: unknown, notifications: unknown, login: { state: 'ok' } });
  });

  it('有効なら scope ごとの状態を、時刻を ISO 文字列にして返す', async () => {
    const t = setupReadApi({ blueskyTimelineEnabled: true, blueskyNow: () => NOW });
    const me = await t.signIn('read:statuses');
    seedSync(t, 'timeline', { succeededAt: BASE + 1000 });
    seedSync(t, 'notifications', { succeededAt: BASE, failedAt: BASE + 5000, kind: 'http', code: 'UpstreamFailure' });

    const body = await (await t.request(STATUS, { headers: me.bearer })).json();

    expect(body).toEqual({
      enabled: true,
      timeline: {
        state: 'ok',
        lastSucceededAt: isoAt(BASE + 1000),
        lastFailedAt: null,
        failureKind: null,
        failureCode: null,
      },
      notifications: {
        state: 'failing',
        lastSucceededAt: isoAt(BASE),
        lastFailedAt: isoAt(BASE + 5000),
        failureKind: 'http',
        failureCode: 'UpstreamFailure',
      },
      login: { state: 'ok' },
    });
  });

  it('ログインの失敗から 30 分以内なら login を waiting にし、再試行の時刻を返す', async () => {
    const failedAt = NOW - 10 * 60 * 1000;
    const t = setupReadApi({ blueskyTimelineEnabled: true, blueskyNow: () => NOW });
    const me = await t.signIn('read:statuses');
    t.sqlite.prepare('INSERT INTO bluesky_login_failures(scope,failedAt) VALUES (?,?)').run('timeline', failedAt);

    const body = await (await t.request(STATUS, { headers: me.bearer })).json() as { login: unknown };

    expect(body.login).toEqual({
      state: 'waiting',
      failedAt: isoAt(failedAt),
      retryAt: isoAt(failedAt + 30 * 60 * 1000),
    });
  });

  it('ログインの失敗から 30 分が過ぎていれば login を ok にする', async () => {
    const t = setupReadApi({ blueskyTimelineEnabled: true, blueskyNow: () => NOW });
    const me = await t.signIn('read:statuses');
    t.sqlite.prepare('INSERT INTO bluesky_login_failures(scope,failedAt) VALUES (?,?)')
      .run('timeline', NOW - 31 * 60 * 1000);

    const body = await (await t.request(STATUS, { headers: me.bearer })).json() as { login: unknown };

    expect(body.login).toEqual({ state: 'ok' });
  });
});
