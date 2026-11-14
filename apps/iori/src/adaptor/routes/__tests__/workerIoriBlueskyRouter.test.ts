import { RA } from '@iwasa-kosui/result';
import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BlueskyChatConvo } from '../../../domain/blueskyChat/blueskyChat.ts';
import type {
  BlueskyFetchedTimelineItem,
  BlueskyTimelineItemsResolver,
} from '../../../domain/blueskyTimeline/blueskyTimelineItem.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import type { BlueskyChat } from '../../../ports/blueskyChat.ts';
import type {
  BlueskyChatClient,
  BlueskyClient,
  BlueskyClientError,
  BlueskyQueryClient,
} from '../../../ports/blueskyClient.ts';
import type { BlueskyPostThread, BlueskyPostThreadFetcher } from '../../../ports/blueskyPostThreadFetcher.ts';
import type { BlueskySearch } from '../../../ports/blueskySearch.ts';
import { BlueskyChatUseCases } from '../../../useCase/blueskyChat.ts';
import { DeleteOwnBlueskyPostUseCase } from '../../../useCase/deleteOwnBlueskyPost.ts';
import { IsDigestOwner } from '../../../useCase/isDigestOwner.ts';
import { LikeBlueskyPostUseCase } from '../../../useCase/likeBlueskyPost.ts';
import { PostToBlueskyUseCase } from '../../../useCase/postToBluesky.ts';
import { QuoteBlueskyPostUseCase } from '../../../useCase/quoteBlueskyPost.ts';
import { ReplyToBlueskyPostUseCase } from '../../../useCase/replyToBlueskyPost.ts';
import { RepostBlueskyPostUseCase } from '../../../useCase/repostBlueskyPost.ts';
import { UndoRepostBlueskyPostUseCase } from '../../../useCase/undoRepostBlueskyPost.ts';
import { UnlikeBlueskyPostUseCase } from '../../../useCase/unlikeBlueskyPost.ts';
import { createMastodonSeed } from '../../d1/__tests__/mastodonSeed.ts';
import { createSqliteD1Fixture } from '../../d1/__tests__/sqliteFixture.ts';
import { createD1BlueskyLoginFailureResolver } from '../../d1/blueskyCrosspost/blueskyLoginFailureStore.ts';
import { createD1PostIdsResolverByBlueskyUris } from '../../d1/blueskyNotification/postIdsResolverByBlueskyUris.ts';
import { createD1BlueskySyncStatusResolver } from '../../d1/blueskySyncStatus/blueskySyncStatusStore.ts';
import { createD1BlueskyLikeDeletedStore } from '../../d1/blueskyTimeline/blueskyLikeDeletedStore.ts';
import { createD1BlueskyLikeSavedStore } from '../../d1/blueskyTimeline/blueskyLikeSavedStore.ts';
import { createD1BlueskyLikeTargetResolver } from '../../d1/blueskyTimeline/blueskyLikeTargetResolver.ts';
import { createD1BlueskyLikeUriResolver } from '../../d1/blueskyTimeline/blueskyLikeUriResolver.ts';
import { createD1BlueskyRepostDeletedStore } from '../../d1/blueskyTimeline/blueskyRepostDeletedStore.ts';
import { createD1BlueskyRepostSavedStore } from '../../d1/blueskyTimeline/blueskyRepostSavedStore.ts';
import { createD1BlueskyRepostTargetResolver } from '../../d1/blueskyTimeline/blueskyRepostTargetResolver.ts';
import { createD1BlueskyRepostUriResolver } from '../../d1/blueskyTimeline/blueskyRepostUriResolver.ts';
import { createD1BlueskyTimelineItemsDeletedStore } from '../../d1/blueskyTimeline/blueskyTimelineItemsDeletedStore.ts';
import { createD1MediaUploadResolver } from '../../d1/mediaUpload/mediaUploadResolver.ts';
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

const deleteClient = (viewer = 'did:plc:me') => ({
  deleteRecord: vi.fn<BlueskyClient['deleteRecord']>(async () => RA.ok(undefined)),
  viewerDid: vi.fn<BlueskyChatClient['viewerDid']>(async () => RA.ok(viewer)),
});

const POSTED_URI = 'at://did:plc:me/app.bsky.feed.post/3kreply';
const replyClient = (posts: unknown[] = [{ uri: 'at://did:plc:a/app.bsky.feed.post/1', cid: 'cid1' }]) => ({
  createRecord: vi.fn<BlueskyClient['createRecord']>(async () =>
    RA.ok({ uri: POSTED_URI, cid: 'bafyreply', rkey: '3kreply' })
  ),
  createPostWithGates: vi.fn<BlueskyClient['createPostWithGates']>(async () =>
    RA.ok({ uri: POSTED_URI, cid: 'bafyreply', rkey: '3kreply' })
  ),
  uploadBlob: vi.fn<BlueskyClient['uploadBlob']>(),
  query: vi.fn<BlueskyQueryClient['query']>(async () => RA.ok({ posts })),
});

const uploadsOf = (bytes: Uint8Array | undefined) => ({
  get: vi.fn(async () =>
    bytes === undefined ? undefined : {
      key: 'post-images/x/original',
      body: new Response(bytes as BodyInit).body as never,
      contentType: 'image/png',
    }
  ),
});

const setupNonOwner = async (
  options: {
    scope?: string;
    blueskyLikeClient?: ReturnType<typeof likeClient>;
    blueskyRepostClient?: ReturnType<typeof repostClient>;
    blueskyPostThreadFetcher?: BlueskyPostThreadFetcher;
    blueskyReplyClient?: ReturnType<typeof replyClient>;
    blueskyPostClient?: ReturnType<typeof replyClient>;
    blueskyQuoteClient?: ReturnType<typeof replyClient>;
    blueskyDeleteClient?: ReturnType<typeof deleteClient>;
    blueskySearch?: BlueskySearch;
    blueskyChat?: BlueskyChat;
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
        likeUriResolver: createD1BlueskyLikeUriResolver(fixture.db),
        cidResolver: { resolve: async () => RA.ok(undefined) },
        savedStore: createD1BlueskyLikeSavedStore(fixture.db),
        now: Instant.now,
      }),
      unlikeBlueskyPostUseCase: options.blueskyLikeClient === undefined
        ? undefined
        : UnlikeBlueskyPostUseCase.create({
          client: options.blueskyLikeClient,
          targetResolver: createD1BlueskyLikeTargetResolver(fixture.db),
          likeUriResolver: createD1BlueskyLikeUriResolver(fixture.db),
          cidResolver: { resolve: async () => RA.ok(undefined) },
          deletedStore: createD1BlueskyLikeDeletedStore(fixture.db),
        }),
      repostBlueskyPostUseCase: options.blueskyRepostClient === undefined
        ? undefined
        : RepostBlueskyPostUseCase.create({
          client: options.blueskyRepostClient,
          targetResolver: createD1BlueskyRepostTargetResolver(fixture.db),
          repostUriResolver: createD1BlueskyRepostUriResolver(fixture.db),
          cidResolver: { resolve: async () => RA.ok(undefined) },
          viewerRepostResolver: { resolve: async () => RA.ok(null) },
          savedStore: createD1BlueskyRepostSavedStore(fixture.db),
          now: Instant.now,
        }),
      undoRepostBlueskyPostUseCase: options.blueskyRepostClient === undefined
        ? undefined
        : UndoRepostBlueskyPostUseCase.create({
          client: options.blueskyRepostClient,
          targetResolver: createD1BlueskyRepostTargetResolver(fixture.db),
          repostUriResolver: createD1BlueskyRepostUriResolver(fixture.db),
          cidResolver: { resolve: async () => RA.ok(undefined) },
          deletedStore: createD1BlueskyRepostDeletedStore(fixture.db),
        }),
      blueskyPostThreadFetcher: options.blueskyPostThreadFetcher,
      replyToBlueskyPostUseCase: options.blueskyReplyClient === undefined
        ? undefined
        : ReplyToBlueskyPostUseCase.create({
          client: options.blueskyReplyClient,
          query: options.blueskyReplyClient.query,
          targetResolver: createD1BlueskyLikeTargetResolver(fixture.db),
          now: Instant.now,
        }),
      postToBlueskyUseCase: options.blueskyPostClient === undefined
        ? undefined
        : PostToBlueskyUseCase.create({
          client: options.blueskyPostClient,
          query: options.blueskyPostClient.query,
          now: Instant.now,
        }),
      deleteOwnBlueskyPostUseCase: options.blueskyDeleteClient === undefined
        ? undefined
        : DeleteOwnBlueskyPostUseCase.create({
          client: options.blueskyDeleteClient,
          postIdsResolver: createD1PostIdsResolverByBlueskyUris(fixture.db),
          deletePost: { run: async () => RA.ok({ success: true }) },
          timelineItemsDeletedStore: createD1BlueskyTimelineItemsDeletedStore(fixture.db),
        }),
      mediaUploadResolver: createD1MediaUploadResolver(fixture.db),
      uploads: { get: async () => undefined },
      quoteBlueskyPostUseCase: options.blueskyQuoteClient === undefined
        ? undefined
        : QuoteBlueskyPostUseCase.create({
          client: options.blueskyQuoteClient,
          query: options.blueskyQuoteClient.query,
          now: Instant.now,
        }),
      markBlueskyNotificationsSeenUseCase: undefined,
      blueskySearch: options.blueskySearch,
      blueskyChat: options.blueskyChat === undefined
        ? undefined
        : BlueskyChatUseCases.create({ chat: options.blueskyChat, query: async () => RA.ok({}) }),
      viewerDid: undefined,
      isDigestOwner: IsDigestOwner.create({ userResolverByUsername: createD1UserResolverByUsername(fixture.db) }),
      createContext: () => undefined as never,
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
        bridgyOriginalUrl: null,
        bridgedFromPostId: null,
        postedAt: BASE - 10_000,
        indexedAt: BASE + 5000,
        liked: false,
        reposted: false,
        bookmarked: false,
        threadMuted: null,
        replyRootUri: null,
        isOwn: false,
      });
    });

    it('viewer の DID が投稿の作者と同じ行だけ isOwn を true にする', async () => {
      const t = setupReadApi({ blueskyViewerDid: () => RA.ok('did:plc:a') });
      const me = await t.signIn('read:statuses');
      seedItem(t, 1);
      t.sqlite.prepare('UPDATE bluesky_timeline_items SET authorDid = ? WHERE uri = ?').run(
        'did:plc:b',
        'at://did:plc:a/app.bsky.feed.post/1',
      );
      seedItem(t, 2);

      const response = await t.request('/api/iori/v1/bluesky/timeline', { headers: me.bearer });

      const body = await response.json() as { items: Array<{ uri: string; isOwn: boolean }> };
      expect(body.items.map((item) => [item.uri, item.isOwn])).toEqual([
        ['at://did:plc:a/app.bsky.feed.post/1', false],
        ['at://did:plc:a/app.bsky.feed.post/2', true],
      ]);
    });

    it('viewer の DID の取得に失敗しても、200 で返して isOwn を false にする', async () => {
      const t = setupReadApi({
        blueskyViewerDid: () => RA.err({ type: 'BlueskyClientError', kind: 'http', message: 'failed' }),
      });
      const me = await t.signIn('read:statuses');
      seedItem(t, 1);

      const response = await t.request('/api/iori/v1/bluesky/timeline', { headers: me.bearer });

      expect(response.status).toBe(200);
      const body = await response.json() as { items: Array<{ isOwn: boolean }> };
      expect(body.items.map((item) => item.isOwn)).toEqual([false]);
    });

    it('scope なしでは所有者でない利用者を 403 にし、一覧のクエリを実行しない', async () => {
      const { get, resolve } = await setupNonOwner();

      const response = await get('/api/iori/v1/bluesky/timeline');

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: 'Forbidden' });
      expect(resolve).not.toHaveBeenCalled();
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

  describe('スレッド', () => {
    const THREAD = '/api/iori/v1/bluesky/thread';
    const POST_URI = 'at://did:plc:a/app.bsky.feed.post/3kpost';
    const threadItem = (rkey: string): BlueskyPostThread['post'] => ({
      feedItemId: `at://did:plc:a/app.bsky.feed.post/${rkey}`,
      uri: `at://did:plc:a/app.bsky.feed.post/${rkey}`,
      cid: `cid-${rkey}`,
      authorDid: 'did:plc:a',
      authorHandle: 'alice.bsky.social',
      authorDisplayName: 'Alice',
      authorAvatar: null,
      text: `post ${rkey}`,
      facets: [],
      embed: null,
      replyParentUri: null,
      replyParentAuthorHandle: null,
      repostedByDid: null,
      repostedByHandle: null,
      bridgyOriginalUrl: null,
      bridgedFromPostId: null,
      postedAt: Instant.orThrow(BASE - 10_000),
      indexedAt: Instant.orThrow(BASE),
      fetchedAt: Instant.orThrow(BASE),
      liked: true,
      viewerLikeUri: 'at://did:plc:me/app.bsky.feed.like/3klike',
      reposted: false,
      threadMuted: false,
      replyRootUri: null,
      viewerRepostUri: null,
      bookmarked: false,
    });
    const fetcherReturning = (result: ReturnType<BlueskyPostThreadFetcher['fetch']>) => ({
      fetch: vi.fn<BlueskyPostThreadFetcher['fetch']>(() => result),
    });
    const getThread = (t: ReturnType<typeof setupReadApi>, headers: Record<string, string>, uri = POST_URI) =>
      t.request(`${THREAD}?uri=${encodeURIComponent(uri)}`, { headers });

    it('認証なしだと 401、read:statuses を満たさない scope だと 403 にする', async () => {
      const fetcher = fetcherReturning(RA.ok({ ancestors: [], post: threadItem('3kpost'), replies: [] }));
      const t = setupReadApi({ blueskyPostThreadFetcher: fetcher });
      const me = await t.signIn('write:accounts');

      expect((await getThread(t, {})).status).toBe(401);
      expect((await getThread(t, me.bearer)).status).toBe(403);
      expect(fetcher.fetch).not.toHaveBeenCalled();
    });

    it('所有者には祖先・本人の投稿・返信を画面用の形で返す', async () => {
      const fetcher = fetcherReturning(RA.ok({
        ancestors: [{ kind: 'post', item: threadItem('3kroot') }, {
          kind: 'notFound',
          uri: 'at://did:plc:a/app.bsky.feed.post/3kgone',
        }],
        post: threadItem('3kpost'),
        replies: [
          { depth: 0, node: { kind: 'post', item: threadItem('3kreply') } },
          { depth: 1, node: { kind: 'blocked', uri: 'at://did:plc:b/app.bsky.feed.post/3kblocked' } },
        ],
      }));
      const t = setupReadApi({ blueskyPostThreadFetcher: fetcher });
      const me = await t.signIn('read:statuses');

      const response = await getThread(t, me.bearer);

      expect(response.status).toBe(200);
      const body = await response.json() as {
        ancestors: Array<Record<string, unknown>>;
        post: Record<string, unknown>;
        replies: Array<{ depth: number; node: Record<string, unknown> }>;
      };
      expect(body.ancestors.map((node) => node.kind)).toEqual(['post', 'notFound']);
      expect(body.ancestors[1]).toEqual({ kind: 'notFound', uri: 'at://did:plc:a/app.bsky.feed.post/3kgone' });
      expect(body.post).toMatchObject({ uri: 'at://did:plc:a/app.bsky.feed.post/3kpost', liked: true });
      expect(body.replies.map(({ depth, node }) => [depth, node.kind])).toEqual([[0, 'post'], [1, 'blocked']]);
    });

    it('所有者でない利用者を 403 にし、Bluesky を呼ばない', async () => {
      const fetcher = fetcherReturning(RA.ok({ ancestors: [], post: threadItem('3kpost'), replies: [] }));
      const { get } = await setupNonOwner({ blueskyPostThreadFetcher: fetcher });

      const response = await get(`${THREAD}?uri=${encodeURIComponent(POST_URI)}`);

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: 'Forbidden' });
      expect(fetcher.fetch).not.toHaveBeenCalled();
    });

    it('uri が無い、または投稿の at-uri でないと 400 にし、Bluesky を呼ばない', async () => {
      const fetcher = fetcherReturning(RA.ok({ ancestors: [], post: threadItem('3kpost'), replies: [] }));
      const t = setupReadApi({ blueskyPostThreadFetcher: fetcher });
      const me = await t.signIn('read:statuses');

      const missing = await t.request(THREAD, { headers: me.bearer });
      const responses = await Promise.all([
        'https://bsky.app/profile/alice.bsky.social/post/3kpost',
        'at://did:plc:a/app.bsky.feed.like/3kpost',
        'at://alice.bsky.social/app.bsky.feed.post/3kpost',
        'at://did:plc:a/app.bsky.feed.post/3kpost/extra',
        'at://did:plc:a/app.bsky.feed.post/',
      ].map((uri) => getThread(t, me.bearer, uri)));

      expect(missing.status).toBe(400);
      expect(responses.map((response) => response.status)).toEqual([400, 400, 400, 400, 400]);
      expect(await missing.json()).toEqual({ error: 'Validation failed: uri' });
      expect(fetcher.fetch).not.toHaveBeenCalled();
    });

    it('投稿が見つからない、またはブロックされているときは 404 にし、区別できる code を返す', async () => {
      const notFound = fetcherReturning(RA.err({ type: 'BlueskyPostThreadUnavailable', reason: 'notFound' }));
      const blocked = fetcherReturning(RA.err({ type: 'BlueskyPostThreadUnavailable', reason: 'blocked' }));
      const gone = fetcherReturning(
        RA.err({
          type: 'BlueskyClientError',
          kind: 'http',
          message: 'getPostThread failed: status 400 NotFound',
          status: 400,
          code: 'NotFound',
        }),
      );
      const results = [];
      for (const fetcher of [notFound, blocked, gone]) {
        const t = setupReadApi({ blueskyPostThreadFetcher: fetcher });
        const me = await t.signIn('read:statuses');
        const response = await getThread(t, me.bearer);
        results.push([response.status, await response.json()]);
      }

      expect(results).toEqual([
        [404, { error: 'Record not found', code: 'not_found' }],
        [404, { error: 'Record not found', code: 'blocked' }],
        [404, { error: 'Record not found', code: 'not_found' }],
      ]);
    });

    it('Bluesky への呼び出しが失敗したら 502 にし、詳細を返さない', async () => {
      const fetcher = fetcherReturning(
        RA.err({
          type: 'BlueskyClientError',
          kind: 'http',
          message: 'getPostThread failed: status 500 InternalServerError',
          status: 500,
        }),
      );
      const t = setupReadApi({ blueskyPostThreadFetcher: fetcher });
      const me = await t.signIn('read:statuses');

      const response = await getThread(t, me.bearer);

      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: 'Bluesky request failed' });
    });

    it('Bluesky がレート制限を返したら 429 にする', async () => {
      const fetcher = fetcherReturning(
        RA.err({
          type: 'BlueskyClientError',
          kind: 'http',
          message: 'getPostThread failed: status 429 RateLimitExceeded',
          status: 429,
        }),
      );
      const t = setupReadApi({ blueskyPostThreadFetcher: fetcher });
      const me = await t.signIn('read:statuses');

      const response = await getThread(t, me.bearer);

      expect(response.status).toBe(429);
      expect(await response.json()).toEqual({ error: 'Bluesky rate limited' });
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
      expect(likeRows(t)).toEqual([{ subjectUri: ITEM, likeUri: 'at://did:plc:me/app.bsky.feed.like/3kcreated' }]);
      const timeline = await (await t.request('/api/iori/v1/bluesky/timeline', { headers: me.bearer })).json() as {
        items: Array<{ liked: boolean; likeUri?: string }>;
      };
      expect(timeline.items.map((item) => item.liked)).toEqual([true]);
      expect(timeline.items[0]).not.toHaveProperty('likeUri');
    });

    it('Bluesky への呼び出しが失敗したら 502 にし、詳細を返さない', async () => {
      const error: BlueskyClientError = {
        type: 'BlueskyClientError',
        kind: 'http',
        message: 'createRecord failed: status 500 InternalServerError',
        status: 500,
      };
      const client = likeClient({ createLike: vi.fn<BlueskyClient['createLike']>(async () => RA.err(error)) });
      const t = setupReadApi({ blueskyLikeClient: client });
      const me = await t.signIn('write:favourites');
      seedItem(t, 1);

      const created = await create(t, me.bearer);

      expect(created.status).toBe(502);
      expect(await created.json()).toEqual({ error: 'Bluesky request failed' });
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
      expect(repostRows(t)).toEqual([
        { subjectUri: ITEM, repostUri: 'at://did:plc:me/app.bsky.feed.repost/3kcreated' },
      ]);
      const timeline = await (await t.request('/api/iori/v1/bluesky/timeline', { headers: me.bearer })).json() as {
        items: Array<{ reposted: boolean; repostUri?: string }>;
      };
      expect(timeline.items.map((item) => item.reposted)).toEqual([true]);
      expect(timeline.items[0]).not.toHaveProperty('repostUri');
    });

    it('Bluesky への呼び出しが失敗したら 502 にし、詳細を返さない', async () => {
      const error: BlueskyClientError = {
        type: 'BlueskyClientError',
        kind: 'http',
        message: 'putRecord failed: status 500 InternalServerError',
        status: 500,
      };
      const client = repostClient({ createRepost: vi.fn<BlueskyClient['createRepost']>(async () => RA.err(error)) });
      const t = setupReadApi({ blueskyRepostClient: client });
      const me = await t.signIn('write:statuses');
      seedItem(t, 1);

      const created = await create(t, me.bearer);

      expect(created.status).toBe(502);
      expect(await created.json()).toEqual({ error: 'Bluesky request failed' });
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

  describe('返信', () => {
    const REPLIES = '/api/iori/v1/bluesky/replies';
    const ITEM = 'at://did:plc:a/app.bsky.feed.post/1';
    const reply = (t: ReturnType<typeof setupReadApi>, headers: Record<string, string>, body: unknown = {
      feedItemId: ITEM,
      text: 'こんにちは',
    }) =>
      t.request(REPLIES, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      });

    it('認証なしだと 401、Origin が違う Cookie だと 403 にし、Bluesky を呼ばない', async () => {
      const client = replyClient();
      const t = setupReadApi({ blueskyReplyClient: client });
      const me = await t.signIn('write:statuses');
      seedItem(t, 1);

      expect((await reply(t, { Origin: ORIGIN })).status).toBe(401);
      const evil = { Cookie: `sessionId=${me.sessionId}`, Origin: 'https://evil.example' };
      expect((await reply(t, evil)).status).toBe(403);
      expect(client.createRecord).not.toHaveBeenCalled();
    });

    it('write:statuses を満たさない scope のトークンを 403 にする', async () => {
      const client = replyClient();
      const t = setupReadApi({ blueskyReplyClient: client });
      const me = await t.signIn('read:statuses');
      seedItem(t, 1);

      expect((await reply(t, me.bearer)).status).toBe(403);
      expect(client.createRecord).not.toHaveBeenCalled();
    });

    it('所有者でない利用者を 403 にし、Bluesky を呼ばない', async () => {
      const client = replyClient();
      const t = await setupNonOwner({ scope: 'write:statuses', blueskyReplyClient: client });

      const response = await t.send('POST', REPLIES, { feedItemId: ITEM, text: 'hi' });

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: 'Forbidden' });
      expect(client.query).not.toHaveBeenCalled();
      expect(client.createRecord).not.toHaveBeenCalled();
    });

    it('feedItemId が無い、空、または text が文字列でないときは 400 にし、Bluesky を呼ばない', async () => {
      const client = replyClient();
      const t = setupReadApi({ blueskyReplyClient: client });
      const me = await t.signIn('write:statuses');
      seedItem(t, 1);

      expect((await reply(t, me.bearer, { text: 'hi' })).status).toBe(400);
      expect((await reply(t, me.bearer, { feedItemId: '', text: 'hi' })).status).toBe(400);
      expect((await reply(t, me.bearer, { feedItemId: ITEM })).status).toBe(400);
      expect((await reply(t, me.bearer, { feedItemId: ITEM, text: 1 })).status).toBe(400);
      expect(client.query).not.toHaveBeenCalled();
      expect(client.createRecord).not.toHaveBeenCalled();
    });

    it('入力不正のときは 400 に reason を付けて返す', async () => {
      const t = setupReadApi({ blueskyReplyClient: replyClient() });
      const me = await t.signIn('write:statuses');
      seedItem(t, 1);

      const response = await reply(t, me.bearer, { feedItemId: ITEM, text: 'a'.repeat(301) });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'Validation failed: text', reason: 'too_many_graphemes' });
    });

    it('返信できない投稿は 422 にし、投稿しない', async () => {
      const client = replyClient([{ uri: ITEM, cid: 'cid1', viewer: { replyDisabled: true } }]);
      const t = setupReadApi({ blueskyReplyClient: client });
      const me = await t.signIn('write:statuses');
      seedItem(t, 1);

      const response = await reply(t, me.bearer);

      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({ error: 'Reply not allowed' });
      expect(client.createRecord).not.toHaveBeenCalled();
    });

    it('未知の feedItemId と、Bluesky 側で削除済みの投稿を 404 にし、投稿しない', async () => {
      const client = replyClient([]);
      const t = setupReadApi({ blueskyReplyClient: client });
      const me = await t.signIn('write:statuses');
      seedItem(t, 1);

      const unknown = await reply(t, me.bearer, { feedItemId: 'at://did:plc:a/app.bsky.feed.post/999', text: 'hi' });
      const deleted = await reply(t, me.bearer);

      expect(unknown.status).toBe(404);
      expect(deleted.status).toBe(404);
      expect(client.createRecord).not.toHaveBeenCalled();
    });

    it('成功したら 201 で uri と cid を返す', async () => {
      const client = replyClient();
      const t = setupReadApi({ blueskyReplyClient: client });
      const me = await t.signIn('write:statuses read:statuses');
      seedItem(t, 1);

      const response = await reply(t, { Cookie: `sessionId=${me.sessionId}`, Origin: ORIGIN });

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({ uri: POSTED_URI, cid: 'bafyreply' });
    });

    it('Bluesky への呼び出しが失敗したら 502 にし、詳細を返さない', async () => {
      const error: BlueskyClientError = {
        type: 'BlueskyClientError',
        kind: 'http',
        message: 'createRecord failed: status 500 InternalServerError',
        status: 500,
      };
      const client = replyClient();
      client.createRecord.mockReturnValueOnce(RA.err(error));
      const t = setupReadApi({ blueskyReplyClient: client });
      const me = await t.signIn('write:statuses');
      seedItem(t, 1);

      const response = await reply(t, me.bearer);

      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: 'Bluesky request failed' });
    });

    it('media_ids の自分の画像を alt 付きで上げて images embed にし、本文が空でも返信する', async () => {
      const client = replyClient();
      client.uploadBlob.mockReturnValueOnce(
        RA.ok({ $type: 'blob', ref: { $link: 'bafyblob' }, mimeType: 'image/png', size: 3 } as const),
      );
      const uploads = uploadsOf(new Uint8Array([1, 2, 3]));
      const t = setupReadApi({ blueskyReplyClient: client, uploads });
      const me = await t.signIn('write:statuses');
      seedItem(t, 1);
      const media = await t.addMedia(me.userId, '猫の写真');

      const response = await reply(t, me.bearer, { feedItemId: ITEM, text: '', media_ids: [media.mediaId] });

      expect(response.status).toBe(201);
      expect(client.createRecord.mock.calls[0]![0]).toMatchObject({
        text: '',
        reply: { parent: { uri: ITEM, cid: 'cid1' } },
        embed: { $type: 'app.bsky.embed.images', images: [{ alt: '猫の写真' }] },
      });
    });

    it('画像が 1 枚 1 MB を超えると、画像の理由を付けて 422 にする', async () => {
      const client = replyClient();
      const t = setupReadApi({ blueskyReplyClient: client, uploads: uploadsOf(new Uint8Array(1_000_001)) });
      const me = await t.signIn('write:statuses');
      seedItem(t, 1);
      const media = await t.addMedia(me.userId);

      const response = await reply(t, me.bearer, { feedItemId: ITEM, text: 'hi', media_ids: [media.mediaId] });

      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({
        error: 'Bluesky に送れる画像は 1 枚 1 MB までです',
        reason: 'image_too_large',
        code: 'media_invalid',
      });
      expect(client.createRecord).not.toHaveBeenCalled();
    });
  });

  describe('引用', () => {
    const QUOTES = '/api/iori/v1/bluesky/quotes';
    const TARGET = 'at://did:plc:a/app.bsky.feed.post/1';
    const quote = (t: ReturnType<typeof setupReadApi>, headers: Record<string, string>, body: unknown = {
      uri: TARGET,
      text: '引用です',
    }) =>
      t.request(QUOTES, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      });

    it('認証なしだと 401、Origin が違う Cookie だと 403 にし、Bluesky を呼ばない', async () => {
      const client = replyClient();
      const t = setupReadApi({ blueskyQuoteClient: client });
      const me = await t.signIn('write:statuses');

      expect((await quote(t, { Origin: ORIGIN })).status).toBe(401);
      const evil = { Cookie: `sessionId=${me.sessionId}`, Origin: 'https://evil.example' };
      expect((await quote(t, evil)).status).toBe(403);
      expect(client.createRecord).not.toHaveBeenCalled();
    });

    it('write:statuses を満たさない scope のトークンを 403 にする', async () => {
      const client = replyClient();
      const t = setupReadApi({ blueskyQuoteClient: client });
      const me = await t.signIn('read:statuses');

      expect((await quote(t, me.bearer)).status).toBe(403);
      expect(client.createRecord).not.toHaveBeenCalled();
    });

    it('所有者でない利用者を 403 にし、Bluesky を呼ばない', async () => {
      const client = replyClient();
      const t = await setupNonOwner({ scope: 'write:statuses', blueskyQuoteClient: client });

      const response = await t.send('POST', QUOTES, { uri: TARGET, text: 'hi' });

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: 'Forbidden' });
      expect(client.query).not.toHaveBeenCalled();
      expect(client.createRecord).not.toHaveBeenCalled();
    });

    it('uri が無い、at:// の投稿の形でない、または text が文字列でないときは 400 にし、Bluesky を呼ばない', async () => {
      const client = replyClient();
      const t = setupReadApi({ blueskyQuoteClient: client });
      const me = await t.signIn('write:statuses');

      expect((await quote(t, me.bearer, { text: 'hi' })).status).toBe(400);
      expect((await quote(t, me.bearer, { uri: '', text: 'hi' })).status).toBe(400);
      expect((await quote(t, me.bearer, { uri: 'https://bsky.app/profile/a/post/1', text: 'hi' })).status).toBe(400);
      expect((await quote(t, me.bearer, { uri: 'at://did:plc:a/app.bsky.feed.like/1', text: 'hi' })).status).toBe(400);
      expect((await quote(t, me.bearer, { uri: 1, text: 'hi' })).status).toBe(400);
      expect((await quote(t, me.bearer, { uri: TARGET })).status).toBe(400);
      expect((await quote(t, me.bearer, { uri: TARGET, text: 1 })).status).toBe(400);
      expect(client.query).not.toHaveBeenCalled();
      expect(client.createRecord).not.toHaveBeenCalled();
    });

    it('引用できない投稿は 422 にし、投稿しない', async () => {
      const client = replyClient([{ uri: TARGET, cid: 'cid1', viewer: { embeddingDisabled: true } }]);
      const t = setupReadApi({ blueskyQuoteClient: client });
      const me = await t.signIn('write:statuses');

      const response = await quote(t, me.bearer);

      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({ error: 'Quote not allowed' });
      expect(client.createRecord).not.toHaveBeenCalled();
    });

    it('Bluesky 側に無い（削除済みの）投稿を 404 にし、投稿しない', async () => {
      const client = replyClient([]);
      const t = setupReadApi({ blueskyQuoteClient: client });
      const me = await t.signIn('write:statuses');

      const response = await quote(t, me.bearer);

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'Record not found' });
      expect(client.createRecord).not.toHaveBeenCalled();
    });

    it('成功したら 201 で uri と cid を返す', async () => {
      const client = replyClient([{ uri: TARGET, cid: 'cid1' }]);
      const t = setupReadApi({ blueskyQuoteClient: client });
      const me = await t.signIn('write:statuses read:statuses');

      const response = await quote(t, { Cookie: `sessionId=${me.sessionId}`, Origin: ORIGIN });

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({ uri: POSTED_URI, cid: 'bafyreply' });
    });

    it('Bluesky への呼び出しが失敗したら 502 にし、詳細を返さない', async () => {
      const error: BlueskyClientError = {
        type: 'BlueskyClientError',
        kind: 'http',
        message: 'createRecord failed: status 500 InternalServerError',
        status: 500,
      };
      const client = replyClient([{ uri: TARGET, cid: 'cid1' }]);
      client.createRecord.mockReturnValueOnce(RA.err(error));
      const t = setupReadApi({ blueskyQuoteClient: client });
      const me = await t.signIn('write:statuses');

      const response = await quote(t, me.bearer);

      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: 'Bluesky request failed' });
    });

    it('media_ids の自分の画像を alt 付きで上げて recordWithMedia にし、本文が空でも引用する', async () => {
      const client = replyClient();
      client.uploadBlob.mockReturnValueOnce(
        RA.ok({ $type: 'blob', ref: { $link: 'bafyblob' }, mimeType: 'image/png', size: 3 } as const),
      );
      const uploads = uploadsOf(new Uint8Array([1, 2, 3]));
      const t = setupReadApi({ blueskyQuoteClient: client, uploads });
      const me = await t.signIn('write:statuses');
      const media = await t.addMedia(me.userId, '猫の写真');

      const response = await quote(t, me.bearer, { uri: TARGET, text: '', media_ids: [media.mediaId] });

      expect(response.status).toBe(201);
      expect(client.createRecord.mock.calls[0]![0]).toMatchObject({
        text: '',
        embed: {
          $type: 'app.bsky.embed.recordWithMedia',
          record: { record: { uri: TARGET, cid: 'cid1' } },
          media: { $type: 'app.bsky.embed.images', images: [{ alt: '猫の写真' }] },
        },
      });
    });

    describe('返信の制限と引用の禁止', () => {
      it('reply_allow と quote_disabled を interaction として createPostWithGates に渡す', async () => {
        const client = replyClient([{ uri: TARGET, cid: 'cid1' }]);
        const t = setupReadApi({ blueskyQuoteClient: client });
        const me = await t.signIn('write:statuses');

        const response = await quote(t, me.bearer, {
          uri: TARGET,
          text: '引用です',
          reply_allow: ['following'],
          quote_disabled: true,
        });

        expect(response.status).toBe(201);
        expect(client.createPostWithGates.mock.calls[0]![0].interaction).toEqual({
          replyRestriction: ['following'],
          quoteDisabled: true,
        });
      });
    });
  });

  describe('検索', () => {
    const POSTS = '/api/iori/v1/bluesky/search/posts';
    const ACTORS = '/api/iori/v1/bluesky/search/actors';
    const POST_ITEM: BlueskyFetchedTimelineItem = {
      feedItemId: 'at://did:plc:a/app.bsky.feed.post/1',
      uri: 'at://did:plc:a/app.bsky.feed.post/1',
      cid: 'cid1',
      authorDid: 'did:plc:a',
      authorHandle: 'alice.bsky.social',
      authorDisplayName: 'Alice',
      authorAvatar: null,
      text: 'hello',
      facets: [],
      embed: null,
      replyParentUri: null,
      replyParentAuthorHandle: null,
      repostedByDid: null,
      repostedByHandle: null,
      bridgyOriginalUrl: null,
      bridgedFromPostId: null,
      postedAt: Instant.orThrow(BASE),
      indexedAt: Instant.orThrow(BASE),
      fetchedAt: Instant.orThrow(BASE),
      liked: true,
      reposted: false,
      threadMuted: false,
      replyRootUri: null,
      viewerLikeUri: 'at://did:plc:me/app.bsky.feed.like/3k1',
      viewerRepostUri: null,
      bookmarked: false,
    };
    const ACTOR = {
      did: 'did:plc:a',
      handle: 'alice.bsky.social',
      displayName: 'Alice',
      avatar: null,
      description: null,
      followedByMe: true,
    };
    const searchMock = (
      overrides: Readonly<{
        searchPosts?: ReturnType<typeof vi.fn<BlueskySearch['searchPosts']>>;
        searchActors?: ReturnType<typeof vi.fn<BlueskySearch['searchActors']>>;
      }> = {},
    ) => ({
      searchPosts: overrides.searchPosts
        ?? vi.fn<BlueskySearch['searchPosts']>(async () => RA.ok({ items: [POST_ITEM], cursor: 'next' })),
      searchActors: overrides.searchActors
        ?? vi.fn<BlueskySearch['searchActors']>(async () => RA.ok({ actors: [ACTOR], cursor: undefined })),
    });

    it('投稿検索は q を trim し、limit 25 と cursor を渡して、表示用の項目と cursor を返す', async () => {
      const blueskySearch = searchMock();
      const t = setupReadApi({ blueskyTimelineEnabled: true, blueskySearch });
      const me = await t.signIn('read:search');

      const response = await t.request(`${POSTS}?q=${encodeURIComponent('  hello world ')}&cursor=abc`, {
        headers: me.bearer,
      });

      expect(response.status).toBe(200);
      const { viewerLikeUri: _like, viewerRepostUri: _repost, fetchedAt: _fetchedAt, ...item } = POST_ITEM;
      expect(await response.json()).toEqual({ items: [{ ...item, isOwn: false }], cursor: 'next' });
      expect(blueskySearch.searchPosts).toHaveBeenCalledWith({ q: 'hello world', cursor: 'abc', limit: 25 });
    });

    it('人の検索は actors を返し、cursor が無ければ null にする', async () => {
      const blueskySearch = searchMock();
      const t = setupReadApi({ blueskyTimelineEnabled: true, blueskySearch });
      const me = await t.signIn('read:search');

      const response = await t.request(`${ACTORS}?q=alice`, { headers: me.bearer });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ actors: [ACTOR], cursor: null });
      expect(blueskySearch.searchActors).toHaveBeenCalledWith({ q: 'alice', cursor: undefined, limit: 25 });
    });

    it.each([[POSTS], [ACTORS]])('%s は認証なしを 401、read:search を満たさない scope を 403 にする', async (path) => {
      const blueskySearch = searchMock();
      const t = setupReadApi({ blueskyTimelineEnabled: true, blueskySearch });
      const me = await t.signIn('read:statuses');

      expect((await t.request(`${path}?q=a`)).status).toBe(401);
      expect((await t.request(`${path}?q=a`, { headers: me.bearer })).status).toBe(403);
      expect(blueskySearch.searchPosts).not.toHaveBeenCalled();
      expect(blueskySearch.searchActors).not.toHaveBeenCalled();
    });

    it.each([[POSTS], [ACTORS]])('%s は所有者でない利用者を 403 にし、Bluesky を呼ばない', async (path) => {
      const blueskySearch = searchMock();
      const { get } = await setupNonOwner({ scope: 'read:search', blueskySearch });

      const response = await get(`${path}?q=a`);

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: 'Forbidden' });
      expect(blueskySearch.searchPosts).not.toHaveBeenCalled();
      expect(blueskySearch.searchActors).not.toHaveBeenCalled();
    });

    it.each([[POSTS], [ACTORS]])('%s は q が空、空白のみ、301 文字以上のとき 400 にする', async (path) => {
      const blueskySearch = searchMock();
      const t = setupReadApi({ blueskyTimelineEnabled: true, blueskySearch });
      const me = await t.signIn('read:search');

      for (const query of ['', '?q=', '?q=%20%20', `?q=${'a'.repeat(301)}`]) {
        const response = await t.request(`${path}${query}`, { headers: me.bearer });
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'Validation failed: q' });
      }
      expect((await t.request(`${path}?q=${'a'.repeat(300)}`, { headers: me.bearer })).status).toBe(200);
      expect(blueskySearch.searchPosts.mock.calls.length + blueskySearch.searchActors.mock.calls.length).toBe(1);
    });

    it.each(
      [
        [
          'HTTP 429',
          { type: 'BlueskyClientError', kind: 'http', message: 'searchPosts failed: status 429', status: 429 },
          429,
          { error: 'Bluesky rate limited' },
        ],
        [
          '認証の失敗',
          { type: 'BlueskyClientError', kind: 'auth', message: 'searchPosts failed: status 401', status: 401 },
          502,
          { error: 'Bluesky authentication failed', code: 'auth' },
        ],
        [
          'それ以外の失敗',
          {
            type: 'BlueskyClientError',
            kind: 'http',
            message: 'searchPosts failed: status 500 InternalServerError',
            status: 500,
          },
          502,
          { error: 'Bluesky request failed', code: 'unavailable' },
        ],
      ] satisfies [string, BlueskyClientError, number, unknown][],
    )(
      'Bluesky への呼び出しが %s なら理由を区別して返し、詳細を返さない',
      async (_name, error, expectedStatus, expectedBody) => {
        const t = setupReadApi({
          blueskyTimelineEnabled: true,
          blueskySearch: searchMock({
            searchPosts: vi.fn<BlueskySearch['searchPosts']>(async () => RA.err(error)),
            searchActors: vi.fn<BlueskySearch['searchActors']>(async () => RA.err(error)),
          }),
        });
        const me = await t.signIn('read:search');

        for (const path of [POSTS, ACTORS]) {
          const response = await t.request(`${path}?q=a`, { headers: me.bearer });
          expect(response.status).toBe(expectedStatus);
          expect(await response.json()).toEqual(expectedBody);
        }
      },
    );
  });
});

describe('投稿の uri で操作する', () => {
  const POST = 'at://did:plc:z/app.bsky.feed.post/3kzzz';
  const LIKES = '/api/iori/v1/bluesky/likes';

  it('feedItemId と uri が両方ある、どちらも無い、uri が投稿の at-uri でないときは 400 にし、Bluesky を呼ばない', async () => {
    const client = likeClient();
    const t = setupReadApi({ blueskyLikeClient: client, blueskyPostCids: { [POST]: 'bafyfresh' } });
    const me = await t.signIn('write:favourites');
    const bad = [
      { feedItemId: POST, uri: POST },
      {},
      { uri: '' },
      { uri: 'https://bsky.app/profile/x/post/1' },
      { uri: 'at://did:plc:z/app.bsky.feed.like/3k1' },
      { uri: 1 },
    ];

    for (const body of bad) {
      const response = await t.request(LIKES, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...me.bearer },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(400);
    }
    const both = await t.request(`${LIKES}?feedItemId=${POST}&uri=${POST}`, { method: 'DELETE', headers: me.bearer });
    const invalid = await t.request(`${LIKES}?uri=nope`, { method: 'DELETE', headers: me.bearer });
    expect(both.status).toBe(400);
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: 'Validation failed: uri' });
    expect(client.createLike).not.toHaveBeenCalled();
    expect(client.deleteLike).not.toHaveBeenCalled();
  });
});

describe('/api/iori/v1/bluesky/notifications/seen', () => {
  const SEEN = '/api/iori/v1/bluesky/notifications/seen';
  const NOW = Instant.orThrow(Date.UTC(2026, 10, 12, 3));
  const seenClient = () => ({ updateSeen: vi.fn<BlueskyClient['updateSeen']>(async () => RA.ok(undefined)) });
  const mark = (t: ReturnType<typeof setupReadApi>, headers: Record<string, string>, body: unknown = {
    seenAt: '2026-11-12T02:00:00.000Z',
  }) =>
    t.request(SEEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });

  it('認証なしだと 401、Origin が違う Cookie だと 403 にし、Bluesky を呼ばない', async () => {
    const client = seenClient();
    const t = setupReadApi({ blueskySeenClient: client, blueskyNow: () => NOW });
    const me = await t.signIn('write:notifications');

    expect((await mark(t, { Origin: ORIGIN })).status).toBe(401);
    expect((await mark(t, { Cookie: `sessionId=${me.sessionId}`, Origin: 'https://evil.example' })).status).toBe(403);
    expect(client.updateSeen).not.toHaveBeenCalled();
  });

  it('write:notifications を満たさない scope のトークンを 403 にする', async () => {
    const client = seenClient();
    const t = setupReadApi({ blueskySeenClient: client, blueskyNow: () => NOW });
    const me = await t.signIn('read:notifications write:statuses');

    expect((await mark(t, me.bearer)).status).toBe(403);
    expect(client.updateSeen).not.toHaveBeenCalled();
  });

  it('所有者でない利用者を、無効の 409 より先に 403 にする', async () => {
    const t = await setupNonOwner({ scope: 'write:notifications' });

    const response = await t.send('POST', SEEN, { seenAt: '2026-11-12T02:00:00.000Z' });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
  });

  it('seenAt が無い、文字列でない、ISO 8601 でない、存在しない日時のときは 400 にし、Bluesky を呼ばない', async () => {
    const client = seenClient();
    const t = setupReadApi({ blueskySeenClient: client, blueskyNow: () => NOW });
    const me = await t.signIn('write:notifications');

    for (const body of [{}, { seenAt: 1 }, { seenAt: 'yesterday' }, { seenAt: '2026-13-40T00:00:00Z' }]) {
      const response = await mark(t, me.bearer, body);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'Validation failed: seenAt' });
    }
    expect(client.updateSeen).not.toHaveBeenCalled();
  });

  it('成功したら 204 で本文なしにし、seenAt を Bluesky に渡す', async () => {
    const client = seenClient();
    const t = setupReadApi({ blueskySeenClient: client, blueskyNow: () => NOW });
    const me = await t.signIn('write:notifications');

    const response = await mark(t, { Cookie: `sessionId=${me.sessionId}`, Origin: ORIGIN });

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(client.updateSeen).toHaveBeenCalledExactlyOnceWith(Instant.orThrow(Date.UTC(2026, 10, 12, 2)));
  });

  it('タイムゾーン付きの ISO 文字列も受ける', async () => {
    const client = seenClient();
    const t = setupReadApi({ blueskySeenClient: client, blueskyNow: () => NOW });
    const me = await t.signIn('write:notifications');

    await mark(t, me.bearer, { seenAt: '2026-11-12T11:00:00+09:00' });

    expect(client.updateSeen.mock.calls).toEqual([[Instant.orThrow(Date.UTC(2026, 10, 12, 2))]]);
  });
});

describe('/api/iori/v1/bluesky/posts', () => {
  const POSTS = '/api/iori/v1/bluesky/posts';
  const post = (t: ReturnType<typeof setupReadApi>, headers: Record<string, string>, body: unknown = {
    status: 'こんにちは',
  }) =>
    t.request(POSTS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  const record = (client: ReturnType<typeof replyClient>) => client.createRecord.mock.calls[0]![0];

  it('認証なしだと 401、Origin が違う Cookie だと 403 にし、Bluesky を呼ばない', async () => {
    const client = replyClient();
    const t = setupReadApi({ blueskyPostClient: client });
    const me = await t.signIn('write:statuses');

    expect((await post(t, { Origin: ORIGIN })).status).toBe(401);
    const evil = { Cookie: `sessionId=${me.sessionId}`, Origin: 'https://evil.example' };
    expect((await post(t, evil)).status).toBe(403);
    expect(client.createRecord).not.toHaveBeenCalled();
  });

  it('write:statuses を満たさない scope のトークンを 403 にする', async () => {
    const client = replyClient();
    const t = setupReadApi({ blueskyPostClient: client });
    const me = await t.signIn('read:statuses');

    expect((await post(t, me.bearer)).status).toBe(403);
    expect(client.createRecord).not.toHaveBeenCalled();
  });

  it('所有者でない利用者を 403 にし、Bluesky を呼ばない', async () => {
    const client = replyClient();
    const t = await setupNonOwner({ scope: 'write:statuses', blueskyPostClient: client });

    const response = await t.send('POST', POSTS, { status: 'hi' });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
    expect(client.createRecord).not.toHaveBeenCalled();
  });

  it('spoiler_text か sensitive があるときは 422 にし、Bluesky を呼ばない', async () => {
    const client = replyClient();
    const t = setupReadApi({ blueskyPostClient: client });
    const me = await t.signIn('write:statuses');
    const error = { error: 'Bluesky だけの投稿では CW とセンシティブ指定を使えません' };

    for (const extra of [{ spoiler_text: '注意' }, { sensitive: true }, { sensitive: 'true' }]) {
      const response = await post(t, me.bearer, { status: 'hi', ...extra });

      expect(response.status).toBe(422);
      expect(await response.json()).toEqual(error);
    }
    expect(client.createRecord).not.toHaveBeenCalled();
  });

  it('visibility が public 以外のときは 422 にし、Bluesky を呼ばない', async () => {
    const client = replyClient();
    const t = setupReadApi({ blueskyPostClient: client });
    const me = await t.signIn('write:statuses');

    for (const visibility of ['unlisted', 'private', 'direct', '', 1]) {
      const response = await post(t, me.bearer, { status: 'hi', visibility });

      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({ error: 'Bluesky だけの投稿は公開でしか送れません' });
    }
    expect(client.createRecord).not.toHaveBeenCalled();
    expect(client.uploadBlob).not.toHaveBeenCalled();
  });

  it('空白だけの spoiler_text と sensitive false は受け付ける', async () => {
    const client = replyClient();
    const t = setupReadApi({ blueskyPostClient: client });
    const me = await t.signIn('write:statuses');

    const response = await post(t, me.bearer, { status: 'hi', spoiler_text: '  ', sensitive: false });

    expect(response.status).toBe(200);
    expect(client.createRecord).toHaveBeenCalledTimes(1);
  });

  it('status が文字列でない、または content_type が不正なときは 400 にし、Bluesky を呼ばない', async () => {
    const client = replyClient();
    const t = setupReadApi({ blueskyPostClient: client });
    const me = await t.signIn('write:statuses');

    expect((await post(t, me.bearer, {})).status).toBe(400);
    expect((await post(t, me.bearer, { status: 1 })).status).toBe(400);
    expect((await post(t, me.bearer, { status: 'hi', content_type: 'text/html' })).status).toBe(400);
    expect(client.createRecord).not.toHaveBeenCalled();
  });

  it('成功したら 200 で uri と url を返し、ローカル投稿も Fediverse への配送も作らない', async () => {
    const client = replyClient();
    const t = setupReadApi({ blueskyPostClient: client });
    const me = await t.signIn('write:statuses');

    const response = await post(t, { Cookie: `sessionId=${me.sessionId}`, Origin: ORIGIN });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      uri: POSTED_URI,
      url: 'https://bsky.app/profile/did:plc:me/post/3kreply',
    });
    expect(record(client)).toMatchObject({ $type: 'app.bsky.feed.post', text: 'こんにちは' });
    expect(t.sqlite.prepare('SELECT count(*) AS n FROM posts').get()).toEqual({ n: 0 });
    expect(t.sqlite.prepare('SELECT count(*) AS n FROM bluesky_crossposts').get()).toEqual({ n: 0 });
    expect(t.federation.sendActivity).not.toHaveBeenCalled();
  });

  it('text/markdown の本文は平文にし、表示文字列が URL と違うリンクには URL を残す', async () => {
    const client = replyClient();
    const t = setupReadApi({ blueskyPostClient: client });
    const me = await t.signIn('write:statuses');

    await post(t, me.bearer, {
      status: '**強調** は [この記事](https://example.com/a) と https://example.com/b を見てください',
      content_type: 'text/markdown',
    });

    expect(record(client)).toMatchObject({
      text: '強調 は この記事 (https://example.com/a) と https://example.com/b を見てください',
    });
  });

  it('本文が長すぎるときは 422 に日本語の error と reason を付けて返し、Bluesky に投稿しない', async () => {
    const client = replyClient();
    const t = setupReadApi({ blueskyPostClient: client });
    const me = await t.signIn('write:statuses');

    const response = await post(t, me.bearer, { status: 'a'.repeat(301) });

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: 'Bluesky に送れる本文は 300 文字までです',
      reason: 'too_many_graphemes',
    });
    expect(client.createRecord).not.toHaveBeenCalled();
  });

  it('自分の画像を R2 から読み、alt を付けて Bluesky に送る', async () => {
    const client = replyClient();
    client.uploadBlob.mockReturnValueOnce(
      RA.ok({ $type: 'blob', ref: { $link: 'bafyblob' }, mimeType: 'image/png', size: 3 }),
    );
    const uploads = uploadsOf(new Uint8Array([1, 2, 3]));
    const t = setupReadApi({ blueskyPostClient: client, uploads });
    const me = await t.signIn('write:statuses');
    const media = await t.addMedia(me.userId, '猫の写真');

    const response = await post(t, me.bearer, { status: '', media_ids: [media.mediaId] });

    expect(response.status).toBe(200);
    expect(record(client)).toMatchObject({
      embed: { $type: 'app.bsky.embed.images', images: [{ alt: '猫の写真' }] },
    });
  });

  it('他人の画像と存在しない画像は 422 にし、Bluesky に投稿しない', async () => {
    const client = replyClient();
    const uploads = uploadsOf(new Uint8Array([1]));
    const t = setupReadApi({ blueskyPostClient: client, uploads });
    const me = await t.signIn('write:statuses');
    const bob = t.seed.addLocalActor('bob');
    const others = await t.addMedia(bob.userId);

    const foreign = await post(t, me.bearer, { status: 'hi', media_ids: [others.mediaId] });
    const unknown = await post(t, me.bearer, { status: 'hi', media_ids: ['unknown'] });

    expect(foreign.status).toBe(422);
    expect(await foreign.json()).toEqual({
      error: '添付した画像が見つからないか、読み込めませんでした',
      code: 'media_invalid',
    });
    expect(unknown.status).toBe(422);
    expect(uploads.get).not.toHaveBeenCalled();
    expect(client.createRecord).not.toHaveBeenCalled();
  });

  it('画像が 5 枚だと、R2 から読む前に画像の理由を付けて 422 にする', async () => {
    const client = replyClient();
    const uploads = uploadsOf(new Uint8Array([1]));
    const t = setupReadApi({ blueskyPostClient: client, uploads });
    const me = await t.signIn('write:statuses');
    const medias = [];
    for (let index = 0; index < 5; index++) medias.push(await t.addMedia(me.userId));

    const response = await post(t, me.bearer, { status: 'hi', media_ids: medias.map(({ mediaId }) => mediaId) });

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: 'Bluesky に送れる画像は 4 枚までです',
      reason: 'too_many_images',
      code: 'media_invalid',
    });
    expect(uploads.get).not.toHaveBeenCalled();
    expect(client.createRecord).not.toHaveBeenCalled();
  });

  it('R2 から読めない画像があるときは 422 にし、Bluesky に投稿しない', async () => {
    const client = replyClient();
    const t = setupReadApi({ blueskyPostClient: client, uploads: uploadsOf(undefined) });
    const me = await t.signIn('write:statuses');
    const media = await t.addMedia(me.userId);

    const response = await post(t, me.bearer, { status: 'hi', media_ids: [media.mediaId] });

    expect(response.status).toBe(422);
    expect(client.uploadBlob).not.toHaveBeenCalled();
    expect(client.createRecord).not.toHaveBeenCalled();
  });

  it('Bluesky への呼び出しが失敗したら 502 にし、詳細を返さない', async () => {
    const error: BlueskyClientError = {
      type: 'BlueskyClientError',
      kind: 'http',
      message: 'createRecord failed: status 500 InternalServerError',
      status: 500,
    };
    const client = replyClient();
    client.createRecord.mockReturnValueOnce(RA.err(error));
    const t = setupReadApi({ blueskyPostClient: client });
    const me = await t.signIn('write:statuses');

    const response = await post(t, me.bearer);

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Bluesky request failed' });
  });

  it('Bluesky がレート制限を返したら 429 にする', async () => {
    const error: BlueskyClientError = {
      type: 'BlueskyClientError',
      kind: 'http',
      message: 'createRecord failed: status 429 RateLimitExceeded',
      status: 429,
    };
    const client = replyClient();
    client.createRecord.mockReturnValueOnce(RA.err(error));
    const t = setupReadApi({ blueskyPostClient: client });
    const me = await t.signIn('write:statuses');

    const response = await post(t, me.bearer);

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: 'Bluesky rate limited' });
  });

  describe('返信の制限と引用の禁止', () => {
    it('reply_allow の配列を interaction として createPostWithGates に渡し、uri を返す', async () => {
      const client = replyClient();
      const t = setupReadApi({ blueskyPostClient: client });
      const me = await t.signIn('write:statuses');

      const response = await post(t, me.bearer, {
        status: 'こんにちは',
        reply_allow: ['followers', 'mention'],
        quote_disabled: true,
      });

      expect(response.status).toBe(200);
      expect(client.createPostWithGates.mock.calls[0]![0].interaction).toEqual({
        replyRestriction: ['mention', 'followers'],
        quoteDisabled: true,
      });
    });

    it('reply_allow か quote_disabled が不正なら 422 にし、Bluesky を呼ばない', async () => {
      const client = replyClient();
      const t = setupReadApi({ blueskyPostClient: client });
      const me = await t.signIn('write:statuses');

      const response = await post(t, me.bearer, { status: 'hi', reply_allow: ['everyone'] });

      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({ error: expect.any(String) });
      expect(client.createRecord).not.toHaveBeenCalled();
      expect(client.createPostWithGates).not.toHaveBeenCalled();
    });
  });
});

describe('DELETE /api/iori/v1/bluesky/posts', () => {
  const POSTS = '/api/iori/v1/bluesky/posts';
  const MINE = 'at://did:plc:me/app.bsky.feed.post/3kmine';
  const CROSSPOSTED = 'at://did:plc:me/app.bsky.feed.post/3kcross';
  const OTHERS = 'at://did:plc:other/app.bsky.feed.post/3kother';
  const remove = (t: ReturnType<typeof setupReadApi>, headers: Record<string, string>, uri?: string) =>
    t.request(uri === undefined ? POSTS : `${POSTS}?uri=${encodeURIComponent(uri)}`, { method: 'DELETE', headers });
  const seedRow = (t: ReturnType<typeof setupReadApi>, uri: string) =>
    t.sqlite.prepare(
      'INSERT INTO bluesky_timeline_items(feedItemId,uri,cid,authorDid,authorHandle,text,facets,postedAt,indexedAt,fetchedAt) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).run(uri, uri, 'bafy', uri.split('/')[2], 'handle.bsky.social', 't', '[]', 1, 1, 1);
  const uris = (t: ReturnType<typeof setupReadApi>) =>
    t.sqlite.prepare('SELECT uri FROM bluesky_timeline_items').all().map((row) => (row as { uri: string }).uri);

  it('自分の投稿を Bluesky から削除し、タイムラインの行を消して 200 を返す', async () => {
    const client = deleteClient();
    const t = setupReadApi({ blueskyDeleteClient: client });
    const me = await t.signIn('write:statuses');
    seedRow(t, MINE);

    const response = await remove(t, me.bearer, MINE);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ viaCrosspost: false });
    expect(uris(t)).toEqual([]);
  });

  it('iori からクロスポストした投稿は、Bluesky を直接削除せず、iori の投稿として削除する', async () => {
    const client = deleteClient();
    const t = setupReadApi({ blueskyDeleteClient: client });
    const me = await t.signIn('write:statuses');
    const local = t.seed.addLocalPost(me, BASE);
    t.sqlite.prepare(
      'INSERT INTO bluesky_crossposts(postId,status,uri,attempts,createdAt,updatedAt) VALUES (?,?,?,?,?,?)',
    ).run(local.postId, 'sent', CROSSPOSTED, 1, BASE, BASE);

    const response = await remove(t, me.bearer, CROSSPOSTED);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ viaCrosspost: true, postId: local.postId });
    expect(client.deleteRecord).not.toHaveBeenCalled();
    expect(t.sqlite.prepare('SELECT deletedAt FROM posts WHERE postId = ?').get(local.postId)).not.toEqual({
      deletedAt: null,
    });
  });

  it('他人の投稿は 403 にし、Bluesky を呼ばない', async () => {
    const client = deleteClient();
    const t = setupReadApi({ blueskyDeleteClient: client });
    const me = await t.signIn('write:statuses');
    seedRow(t, OTHERS);

    const response = await remove(t, me.bearer, OTHERS);

    expect(response.status).toBe(403);
    expect(client.deleteRecord).not.toHaveBeenCalled();
    expect(uris(t)).toEqual([OTHERS]);
  });

  it('uri が無いか、投稿の uri でないときは 400 にし、Bluesky を呼ばない', async () => {
    const client = deleteClient();
    const t = setupReadApi({ blueskyDeleteClient: client });
    const me = await t.signIn('write:statuses');

    for (const uri of [undefined, 'not-a-uri', 'at://did:plc:me/app.bsky.feed.like/3kmine']) {
      const response = await remove(t, me.bearer, uri);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'Validation failed: uri' });
    }
    expect(client.deleteRecord).not.toHaveBeenCalled();
  });

  it('所有者でない利用者を 403 にし、Bluesky を呼ばない', async () => {
    const client = deleteClient();
    const t = await setupNonOwner({ scope: 'write:statuses', blueskyDeleteClient: client });

    const response = await t.send('DELETE', `${POSTS}?uri=${encodeURIComponent(MINE)}`);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
    expect(client.deleteRecord).not.toHaveBeenCalled();
  });

  it('認証なしだと 401、write:statuses を満たさない scope だと 403 にする', async () => {
    const client = deleteClient();
    const t = setupReadApi({ blueskyDeleteClient: client });
    const me = await t.signIn('read:statuses');

    expect((await remove(t, { Origin: ORIGIN }, MINE)).status).toBe(401);
    expect((await remove(t, me.bearer, MINE)).status).toBe(403);
    expect(client.deleteRecord).not.toHaveBeenCalled();
  });

  it('Bluesky の削除が失敗したら 502 にし、タイムラインの行を残す', async () => {
    const client = deleteClient();
    client.deleteRecord.mockReturnValueOnce(
      RA.err({ type: 'BlueskyClientError', kind: 'http', message: 'deleteRecord failed: status 500', status: 500 }),
    );
    const t = setupReadApi({ blueskyDeleteClient: client });
    const me = await t.signIn('write:statuses');
    seedRow(t, MINE);

    const response = await remove(t, me.bearer, MINE);

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Bluesky request failed' });
    expect(uris(t)).toEqual([MINE]);
  });
});

describe('/api/iori/v1/bluesky/chat', () => {
  const BASE_PATH = '/api/iori/v1/bluesky/chat';
  const ME = 'did:plc:me';
  const ALICE = {
    did: 'did:plc:alice',
    handle: 'alice.bsky.social',
    displayName: 'Alice',
    avatar: null,
    chatDisabled: false,
  };
  const SELF = { did: ME, handle: 'me.bsky.social', displayName: null, avatar: null, chatDisabled: false };
  const convo = (overrides: Partial<BlueskyChatConvo> = {}): BlueskyChatConvo => ({
    id: 'c1',
    rev: 'r1',
    members: [SELF, ALICE],
    lastMessage: null,
    muted: false,
    status: 'accepted',
    unreadCount: 1,
    ...overrides,
  });
  const sent = {
    kind: 'message',
    id: 'm1',
    text: 'こんにちは',
    facets: [],
    hasEmbed: false,
    sharedPost: null,
    reactions: [],
    senderDid: ME,
    sentAt: 1000,
  } as const;
  const chatMock = (overrides: Partial<BlueskyChat> = {}) => ({
    viewerDid: () => RA.ok(ME),
    listConvos: vi.fn<BlueskyChat['listConvos']>(
      overrides.listConvos ?? (async () => RA.ok({ items: [convo()], cursor: 'next' })),
    ),
    getConvo: vi.fn<BlueskyChat['getConvo']>(overrides.getConvo ?? (async () => RA.ok(convo()))),
    getConvoForMember: vi.fn<BlueskyChat['getConvoForMember']>(
      overrides.getConvoForMember ?? (async () => RA.ok(convo())),
    ),
    getMessages: vi.fn<BlueskyChat['getMessages']>(
      overrides.getMessages ?? (async () => RA.ok({ items: [sent], cursor: undefined })),
    ),
    sendMessage: vi.fn<BlueskyChat['sendMessage']>(overrides.sendMessage ?? (async () => RA.ok(sent))),
    updateRead: vi.fn<BlueskyChat['updateRead']>(
      overrides.updateRead ?? (async () => RA.ok(convo({ unreadCount: 0 }))),
    ),
    acceptConvo: vi.fn<BlueskyChat['acceptConvo']>(overrides.acceptConvo ?? (async () => RA.ok(undefined))),
  });
  const clientError = (overrides: Partial<BlueskyClientError>): BlueskyClientError => ({
    type: 'BlueskyClientError',
    kind: 'http',
    message: 'failed',
    status: 400,
    ...overrides,
  });
  const post = (t: ReturnType<typeof setupReadApi>, path: string, headers: Record<string, string>, body?: unknown) =>
    t.request(`${BASE_PATH}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  type Route = Readonly<{ name: string; method: 'GET' | 'POST'; path: string; scope: string; body?: unknown }>;
  const routes: readonly Route[] = [
    { name: '会話一覧', method: 'GET', path: '/convos', scope: 'read:statuses' },
    { name: '会話 1 件', method: 'GET', path: '/convos/c1', scope: 'read:statuses' },
    { name: 'メッセージ一覧', method: 'GET', path: '/convos/c1/messages', scope: 'read:statuses' },
    { name: '未読の合計', method: 'GET', path: '/unread_count', scope: 'read:statuses' },
    { name: '送信', method: 'POST', path: '/convos/c1/messages', scope: 'write:statuses', body: { text: 'hi' } },
    { name: '既読化', method: 'POST', path: '/convos/c1/read', scope: 'write:statuses', body: {} },
    { name: '承諾', method: 'POST', path: '/convos/c1/accept', scope: 'write:statuses' },
    { name: '会話を開く', method: 'POST', path: '/convos', scope: 'write:statuses', body: { did: 'did:plc:alice' } },
  ];
  const call = (t: ReturnType<typeof setupReadApi>, route: Route, headers: Record<string, string>) =>
    route.method === 'GET'
      ? t.request(`${BASE_PATH}${route.path}`, { headers })
      : post(t, route.path, headers, route.body);
  const callAsNonOwner = (t: Awaited<ReturnType<typeof setupNonOwner>>, route: Route) =>
    route.method === 'GET'
      ? t.get(`${BASE_PATH}${route.path}`)
      : t.send('POST', `${BASE_PATH}${route.path}`, route.body);

  describe.each(routes)('$name（$method $path）', (route) => {
    it('認証なしを 401 にし、必要な scope を満たさないトークンを 403 にする', async () => {
      const chat = chatMock();
      const t = setupReadApi({ blueskyChat: chat });
      const wrong = await t.signIn(route.scope === 'read:statuses' ? 'read:search' : 'read:statuses');

      expect((await call(t, route, { Origin: ORIGIN })).status).toBe(401);
      expect((await call(t, route, wrong.bearer)).status).toBe(403);
      expect(chat.listConvos).not.toHaveBeenCalled();
      expect(chat.sendMessage).not.toHaveBeenCalled();
    });

    it('所有者でない利用者を 403 にし、Bluesky を呼ばない', async () => {
      const chat = chatMock();
      const t = await setupNonOwner({ scope: route.scope, blueskyChat: chat });

      const response = await callAsNonOwner(t, route);

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: 'Forbidden' });
      expect(chat.listConvos).not.toHaveBeenCalled();
      expect(chat.getConvo).not.toHaveBeenCalled();
      expect(chat.sendMessage).not.toHaveBeenCalled();
      expect(chat.acceptConvo).not.toHaveBeenCalled();
    });
  });

  it('成功とエラーのどの応答にも Cache-Control: private, no-store を付ける', async () => {
    const noStore = 'private, no-store';
    const ok = setupReadApi({ blueskyChat: chatMock() });
    const okMe = await ok.signIn('read:statuses');
    const disabled = setupReadApi();
    const disabledMe = await disabled.signIn('read:statuses');

    const success = await ok.request(`${BASE_PATH}/convos`, { headers: okMe.bearer });
    const unauthorized = await ok.request(`${BASE_PATH}/convos`);
    const conflict = await disabled.request(`${BASE_PATH}/convos`, { headers: disabledMe.bearer });

    expect(success.status).toBe(200);
    expect(success.headers.get('Cache-Control')).toBe(noStore);
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get('Cache-Control')).toBe(noStore);
    expect(conflict.status).toBe(409);
    expect(conflict.headers.get('Cache-Control')).toBe(noStore);
  });

  it('Bluesky への呼び出しが失敗したら 502 にし、詳細を返さない', async () => {
    const t = setupReadApi({
      blueskyChat: chatMock({ listConvos: async () => RA.err(clientError({ status: 500 })) }),
    });
    const me = await t.signIn('read:statuses');

    const response = await t.request(`${BASE_PATH}/convos`, { headers: me.bearer });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Bluesky request failed' });
  });

  it('Origin が違う Cookie の書き込みを 403 にし、Bluesky を呼ばない', async () => {
    const chat = chatMock();
    const t = setupReadApi({ blueskyChat: chat });
    const me = await t.signIn('write:statuses');
    const evil = { Cookie: `sessionId=${me.sessionId}`, Origin: 'https://evil.example' };

    expect((await post(t, '/convos/c1/messages', evil, { text: 'hi' })).status).toBe(403);
    expect((await post(t, '/convos/c1/read', evil, {})).status).toBe(403);
    expect((await post(t, '/convos/c1/accept', evil)).status).toBe(403);
    expect((await post(t, '/convos', evil, { did: ALICE.did })).status).toBe(403);
    expect(chat.sendMessage).not.toHaveBeenCalled();
    expect(chat.updateRead).not.toHaveBeenCalled();
    expect(chat.acceptConvo).not.toHaveBeenCalled();
    expect(chat.getConvoForMember).not.toHaveBeenCalled();
  });

  it('会話 1 件は InvalidConvo を 404 にする', async () => {
    const chat = chatMock();
    const t = setupReadApi({ blueskyChat: chat });
    const me = await t.signIn('read:statuses');

    chat.getConvo.mockReturnValueOnce(RA.err(clientError({ code: 'InvalidConvo' })));
    const missing = await t.request(`${BASE_PATH}/convos/nope`, { headers: me.bearer });

    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'InvalidConvo' });
  });

  describe('失敗の構造化ログ', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    const failedList = (error: BlueskyClientError) => chatMock({ listConvos: async () => RA.err(error) });
    const loggedLines = (warn: ReturnType<typeof vi.spyOn>) =>
      warn.mock.calls.map(([line]) => JSON.parse(line as string) as Record<string, unknown>);

    it('chat_not_permitted で 403 にするとき、秘密値を含まない 1 行を console.warn に出す', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const t = setupReadApi({
        blueskyChat: failedList(clientError({
          kind: 'chat_not_permitted',
          message: 'chat.bsky.convo.listConvos failed: status 400 InvalidToken',
          code: 'InvalidToken',
        })),
      });
      const me = await t.signIn('read:statuses');

      const response = await t.request(`${BASE_PATH}/unread_count`, { headers: me.bearer });

      expect(response.status).toBe(403);
      expect(loggedLines(warn)).toEqual([{
        event: 'bluesky_client_failure',
        kind: 'chat_not_permitted',
        status: 400,
        code: 'InvalidToken',
        operation: 'chat.bsky.convo.listConvos',
        responseStatus: 403,
      }]);
    });
  });

  describe('送信', () => {
    it('成功したら 201 で message を返す', async () => {
      const t = setupReadApi({ blueskyChat: chatMock() });
      const me = await t.signIn('write:statuses');

      const response = await post(t, '/convos/c1/messages', me.bearer, { text: 'こんにちは' });

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({ message: sent });
    });

    it('text が文字列でなければ 400 にする', async () => {
      const chat = chatMock();
      const t = setupReadApi({ blueskyChat: chat });
      const me = await t.signIn('write:statuses');

      expect((await post(t, '/convos/c1/messages', me.bearer, {})).status).toBe(400);
      expect((await post(t, '/convos/c1/messages', me.bearer, { text: 1 })).status).toBe(400);
      expect(chat.sendMessage).not.toHaveBeenCalled();
    });

    it('不正な本文を 422 にし、reason を返して、送らない', async () => {
      const chat = chatMock();
      const t = setupReadApi({ blueskyChat: chat });
      const me = await t.signIn('write:statuses');

      const empty = await post(t, '/convos/c1/messages', me.bearer, { text: '  ' });

      expect(empty.status).toBe(422);
      expect(await empty.json()).toEqual({ error: 'Validation failed: text', reason: 'empty' });
      expect(chat.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('既読化・承諾・会話を開く', () => {
    it('既読化は更新後の会話を返し、messageId が文字列でなければ 400 にする', async () => {
      const chat = chatMock();
      const t = setupReadApi({ blueskyChat: chat });
      const me = await t.signIn('write:statuses');

      const response = await post(t, '/convos/c1/read', me.bearer, { messageId: 'm1' });
      const withoutId = await post(t, '/convos/c1/read', me.bearer, {});
      const invalid = await post(t, '/convos/c1/read', me.bearer, { messageId: 1 });

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ convo: { id: 'c1', unreadCount: 0 } });
      expect(withoutId.status).toBe(200);
      expect(invalid.status).toBe(400);
    });

    it('会話を開くは convoId を返し、DID でない値は 400 にする', async () => {
      const chat = chatMock();
      const t = setupReadApi({ blueskyChat: chat });
      const me = await t.signIn('write:statuses');

      const response = await post(t, '/convos', me.bearer, { did: ALICE.did });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ convoId: 'c1' });
      expect((await post(t, '/convos', me.bearer, { did: 'alice.bsky.social' })).status).toBe(400);
      expect((await post(t, '/convos', me.bearer, {})).status).toBe(400);
      expect(chat.getConvoForMember).toHaveBeenCalledTimes(1);
    });

    it('会話を開くで MessagesDisabled などの拒否を 422 にする', async () => {
      const chat = chatMock({ getConvoForMember: async () => RA.err(clientError({ code: 'NotFollowedBySender' })) });
      const t = setupReadApi({ blueskyChat: chat });
      const me = await t.signIn('write:statuses');

      const response = await post(t, '/convos', me.bearer, { did: ALICE.did });

      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({ error: 'NotFollowedBySender' });
    });
  });
});
