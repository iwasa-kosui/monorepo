import { RA } from '@iwasa-kosui/result';
import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BlueskyTimelineItemsResolver } from '../../../domain/blueskyTimeline/blueskyTimelineItem.ts';
import type { BlueskyClientError } from '../../../ports/blueskyClient.ts';
import type { CollectBlueskyTimelineUseCase } from '../../../useCase/collectBlueskyTimeline.ts';
import { IsDigestOwner } from '../../../useCase/isDigestOwner.ts';
import { createMastodonSeed } from '../../d1/__tests__/mastodonSeed.ts';
import { createSqliteD1Fixture } from '../../d1/__tests__/sqliteFixture.ts';
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

const collector = (result: ReturnType<CollectBlueskyTimelineUseCase['run']>) => {
  const run = vi.fn(() => result);
  return { run, useCase: { run } as CollectBlueskyTimelineUseCase };
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
      });
    });

    it('取り込みが有効なら enabled を true にする', async () => {
      const t = setupReadApi({
        collectBlueskyTimeline: collector(RA.ok({ pages: 0, fetched: 0, saved: 0, dropped: 0 })).useCase,
      });
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
          collectBlueskyTimelineUseCase: undefined,
          isDigestOwner: IsDigestOwner.create({ userResolverByUsername: createD1UserResolverByUsername(fixture.db) }),
        }),
      );
      const issued = await harness.issueUserToken('read:statuses');
      createMastodonSeed(fixture).addLocalActor('alice', issued.userId);

      const response = await app.request(`${ORIGIN}${HOME}`, { headers: { Authorization: `Bearer ${issued.token}` } });

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

  describe('POST /refresh', () => {
    const refresh = (t: ReturnType<typeof setupReadApi>, headers: Record<string, string>) =>
      t.request('/api/iori/v1/bluesky/timeline/refresh', { method: 'POST', headers });

    it('認証なしだと 401 にする', async () => {
      const { run, useCase } = collector(RA.ok({ pages: 1, fetched: 0, saved: 0, dropped: 0 }));
      const t = setupReadApi({ collectBlueskyTimeline: useCase });

      expect((await refresh(t, { Origin: ORIGIN })).status).toBe(401);
      expect((await refresh(t, {})).status).toBe(403);
      expect(run).not.toHaveBeenCalled();
    });

    it('write:accounts を満たさない scope のトークンを 403 にする', async () => {
      const { run, useCase } = collector(RA.ok({ pages: 1, fetched: 0, saved: 0, dropped: 0 }));
      const t = setupReadApi({ collectBlueskyTimeline: useCase });
      const me = await t.signIn('read:statuses');

      expect((await refresh(t, me.bearer)).status).toBe(403);
      expect(run).not.toHaveBeenCalled();
    });

    it('Cookie のセッションで Origin が違うと 403 にする', async () => {
      const { run, useCase } = collector(RA.ok({ pages: 1, fetched: 0, saved: 0, dropped: 0 }));
      const t = setupReadApi({ collectBlueskyTimeline: useCase });
      const me = await t.signIn('write:accounts');

      const response = await refresh(t, { Cookie: `sessionId=${me.sessionId}`, Origin: 'https://evil.example' });

      expect(response.status).toBe(403);
      expect(run).not.toHaveBeenCalled();
    });

    it('無効のときは取り込まず、409 を返す', async () => {
      const t = setupReadApi();
      const me = await t.signIn('write:accounts');

      const response = await refresh(t, me.bearer);

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: 'Bluesky timeline is disabled' });
    });

    it('有効のときは取り込みを 1 回実行し、件数を返す', async () => {
      const summary = { pages: 2, fetched: 150, saved: 120, dropped: 1 };
      const { run, useCase } = collector(RA.ok(summary));
      const t = setupReadApi({ collectBlueskyTimeline: useCase });
      const me = await t.signIn('write:accounts');

      const response = await refresh(t, { Cookie: `sessionId=${me.sessionId}`, Origin: ORIGIN });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(summary);
      expect(run).toHaveBeenCalledOnce();
    });

    it('Bluesky への取得に失敗したら 502 にし、エラーの詳細を返さない', async () => {
      const error: BlueskyClientError = {
        type: 'BlueskyClientError',
        kind: 'auth',
        message: 'app.bsky.feed.getTimeline failed: status 401 ExpiredToken',
        status: 401,
      };
      const t = setupReadApi({ collectBlueskyTimeline: collector(RA.err(error)).useCase });
      const me = await t.signIn('write:accounts');

      const response = await refresh(t, me.bearer);

      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: 'Bluesky request failed' });
    });
  });
});
