import { RA } from '@iwasa-kosui/result';
import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Instant } from '../../../domain/instant/instant.ts';
import type { BlueskyBookmarkReader } from '../../../ports/blueskyBookmarkReader.ts';
import type { BlueskyClient, BlueskyClientError } from '../../../ports/blueskyClient.ts';
import type { BlueskyPostCidResolver } from '../../../ports/blueskyPostCidResolver.ts';
import { BookmarkBlueskyPostUseCase } from '../../../useCase/bookmarkBlueskyPost.ts';
import { IsDigestOwner } from '../../../useCase/isDigestOwner.ts';
import { ListBlueskyBookmarksUseCase } from '../../../useCase/listBlueskyBookmarks.ts';
import { UnbookmarkBlueskyPostUseCase } from '../../../useCase/unbookmarkBlueskyPost.ts';
import { createMastodonSeed } from '../../d1/__tests__/mastodonSeed.ts';
import { createSqliteD1Fixture } from '../../d1/__tests__/sqliteFixture.ts';
import { createD1BlueskyBookmarkDeletedStore } from '../../d1/blueskyTimeline/blueskyBookmarkDeletedStore.ts';
import { createD1BlueskyBookmarkSavedStore } from '../../d1/blueskyTimeline/blueskyBookmarkSavedStore.ts';
import { createD1BlueskyBookmarkTargetResolver } from '../../d1/blueskyTimeline/blueskyBookmarkTargetResolver.ts';
import { createD1BlueskyViewerBookmarksSyncedStore } from '../../d1/blueskyTimeline/blueskyViewerBookmarksSyncedStore.ts';
import { createD1UserResolverByUsername } from '../../d1/user/userResolverByUsername.ts';
import { createMastodonAuthn } from '../mastodonAuthn.ts';
import { createWorkerIoriBlueskyBookmarkRouter } from '../workerIoriBlueskyBookmarkRouter.ts';
import { createOAuthHarness, ORIGIN } from './helper/oauthHarness.ts';

const DID = 'did:plc:alice';
const POST = 'at://did:plc:alice/app.bsky.feed.post/1';
const REPOST = `${POST}#repost:did:plc:b`;
const BOOKMARKS = '/api/iori/v1/bluesky/bookmarks';
const NOW = Date.UTC(2026, 10, 12);

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

const clientError = (overrides: Partial<BlueskyClientError> = {}): BlueskyClientError => ({
  type: 'BlueskyClientError',
  kind: 'http',
  message: 'failed',
  status: 500,
  ...overrides,
});

const bookmarkedItem = {
  feedItemId: POST,
  uri: POST,
  cid: 'cid1',
  authorDid: DID,
  authorHandle: 'alice.bsky.social',
  authorDisplayName: 'Alice',
  authorAvatar: null,
  text: 'post 1',
  facets: [],
  embed: null,
  replyParentUri: null,
  replyParentAuthorHandle: null,
  repostedByDid: null,
  repostedByHandle: null,
  postedAt: Instant.orThrow(NOW - 1000),
  indexedAt: Instant.orThrow(NOW - 500),
  fetchedAt: Instant.orThrow(NOW),
  liked: false,
  viewerLikeUri: null,
  reposted: false,
  viewerRepostUri: null,
  bookmarked: true,
  threadMuted: false,
  replyRootUri: null,
};

const setup = async (options: {
  scope: string;
  owner?: boolean;
  enabled?: boolean;
  reader?: Partial<BlueskyBookmarkReader>;
  client?: Partial<Pick<BlueskyClient, 'createBookmark' | 'deleteBookmark'>>;
  viewerDid?: () => RA<string, BlueskyClientError>;
}) => {
  const harness = createOAuthHarness();
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  fixture.sqlite.prepare(
    'INSERT INTO bluesky_timeline_items(feedItemId,uri,cid,authorDid,authorHandle,text,facets,repostedByDid,postedAt,indexedAt,fetchedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
  ).run(POST, POST, 'cid1', DID, 'alice.bsky.social', 't', '[]', null, 1, 1, 1);
  fixture.sqlite.prepare(
    'INSERT INTO bluesky_timeline_items(feedItemId,uri,cid,authorDid,authorHandle,text,facets,repostedByDid,postedAt,indexedAt,fetchedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
  ).run(REPOST, POST, 'cid1', DID, 'alice.bsky.social', 't', '[]', 'did:plc:b', 1, 1, 1);
  const reader: BlueskyBookmarkReader = {
    getBookmarks: vi.fn(async () => RA.ok({ items: [bookmarkedItem], cursor: 'next-cursor' })),
    ...options.reader,
  };
  const client = {
    createBookmark: vi.fn<BlueskyClient['createBookmark']>(async () => RA.ok(undefined)),
    deleteBookmark: vi.fn<BlueskyClient['deleteBookmark']>(async () => RA.ok(undefined)),
    ...options.client,
  };
  const targetResolver = createD1BlueskyBookmarkTargetResolver(fixture.db);
  const cidResolver: BlueskyPostCidResolver = {
    resolve: vi.fn(async (uri) =>
      RA.ok(uri === POST ? { cid: 'cid-fresh', likeUri: null, repostUri: null } : undefined)
    ),
  };
  const enabled = options.enabled !== false;
  const app = new Hono().route(
    '/api',
    createWorkerIoriBlueskyBookmarkRouter({
      authn: createMastodonAuthn({
        verifyAccessTokenUseCase: harness.memory.useCases.verifyAccessTokenUseCase,
        sessionResolver: harness.memory.sessionResolver as never,
      }),
      bookmarkBlueskyPostUseCase: enabled
        ? BookmarkBlueskyPostUseCase.create({
          client,
          targetResolver,
          cidResolver,
          savedStore: createD1BlueskyBookmarkSavedStore(fixture.db),
          now: () => Instant.orThrow(NOW),
        })
        : undefined,
      unbookmarkBlueskyPostUseCase: enabled
        ? UnbookmarkBlueskyPostUseCase.create({
          client,
          targetResolver,
          deletedStore: createD1BlueskyBookmarkDeletedStore(fixture.db),
        })
        : undefined,
      listBlueskyBookmarksUseCase: enabled
        ? ListBlueskyBookmarksUseCase.create({
          reader,
          viewerBookmarksStore: createD1BlueskyViewerBookmarksSyncedStore(fixture.db),
        })
        : undefined,
      viewerDid: options.viewerDid,
      isDigestOwner: IsDigestOwner.create({ userResolverByUsername: createD1UserResolverByUsername(fixture.db) }),
    }),
  );
  const issued = await harness.issueUserToken(options.scope);
  const seed = createMastodonSeed(fixture);
  seed.addLocalActor('kosui', options.owner === false ? undefined : issued.userId);
  if (options.owner === false) seed.addLocalActor('alice', issued.userId);
  const bearer = { Authorization: `Bearer ${issued.token}` };
  const get = (path: string) => app.request(`${ORIGIN}${path}`, { headers: bearer });
  const anonymous = (path: string, init: RequestInit = {}) => app.request(`${ORIGIN}${path}`, init);
  const send = (method: 'POST' | 'DELETE', path: string, body?: unknown, headers: Record<string, string> = bearer) =>
    app.request(`${ORIGIN}${path}`, {
      method,
      headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const mirrored = () => fixture.sqlite.prepare('SELECT subjectUri FROM bluesky_bookmarks').all();
  return { get, send, anonymous, reader, client, cidResolver, mirrored, sessionId: issued.sessionId };
};

describe('GET /api/iori/v1/bluesky/bookmarks', () => {
  it('認証なしだと 401、read:bookmarks を満たさない scope のトークンは 403 にする', async () => {
    const t = await setup({ scope: 'read:statuses' });

    expect((await t.anonymous(BOOKMARKS)).status).toBe(401);
    expect((await t.get(BOOKMARKS)).status).toBe(403);
    expect(t.reader.getBookmarks).not.toHaveBeenCalled();
  });

  it('所有者でない利用者を 403 にし、Bluesky を呼ばない', async () => {
    const t = await setup({ scope: 'read:bookmarks', owner: false });

    const response = await t.get(BOOKMARKS);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
    expect(t.reader.getBookmarks).not.toHaveBeenCalled();
  });

  it('無効のときは 409 を返す', async () => {
    const t = await setup({ scope: 'read:bookmarks', enabled: false });

    const response = await t.get(BOOKMARKS);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Bluesky timeline is disabled' });
  });

  it('投稿を IoriBlueskyTimelineItemBody の形で返し、cursor を渡す', async () => {
    const t = await setup({ scope: 'read:bookmarks' });

    const response = await t.get(`${BOOKMARKS}?cursor=abc`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [{
        feedItemId: POST,
        uri: POST,
        cid: 'cid1',
        authorDid: DID,
        authorHandle: 'alice.bsky.social',
        authorDisplayName: 'Alice',
        authorAvatar: null,
        text: 'post 1',
        facets: [],
        embed: null,
        replyParentUri: null,
        replyParentAuthorHandle: null,
        repostedByDid: null,
        repostedByHandle: null,
        postedAt: NOW - 1000,
        indexedAt: NOW - 500,
        liked: false,
        reposted: false,
        bookmarked: true,
        threadMuted: false,
        replyRootUri: null,
        isOwn: false,
      }],
      cursor: 'next-cursor',
    });
    expect(t.reader.getBookmarks).toHaveBeenCalledExactlyOnceWith({ cursor: 'abc' });
  });

  it('続きが無いとき cursor を null にし、cursor を付けなければ undefined で呼ぶ', async () => {
    const t = await setup({
      scope: 'read:bookmarks',
      reader: { getBookmarks: vi.fn(async () => RA.ok({ items: [], cursor: undefined })) },
    });

    const response = await t.get(BOOKMARKS);

    expect(await response.json()).toEqual({ items: [], cursor: null });
    expect(t.reader.getBookmarks).toHaveBeenCalledExactlyOnceWith({ cursor: undefined });
  });

  it('自分の投稿は isOwn にする', async () => {
    const t = await setup({ scope: 'read:bookmarks', viewerDid: async () => RA.ok(DID) });

    const body = await (await t.get(BOOKMARKS)).json() as { items: Array<{ isOwn: boolean }> };

    expect(body.items[0]?.isOwn).toBe(true);
  });

  it('Bluesky のログインに失敗したら 502 にして Bluesky login failed を返す', async () => {
    const t = await setup({
      scope: 'read:bookmarks',
      reader: {
        getBookmarks: vi.fn(async () =>
          RA.err(clientError({ kind: 'auth', status: 401, code: 'AuthenticationRequired' }))
        ),
      },
    });

    const response = await t.get(BOOKMARKS);

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Bluesky login failed' });
  });

  it.each(
    [
      ['403', { status: 403, code: 'Forbidden' }],
      ['501', { status: 501, code: 'MethodNotImplemented' }],
      ['401 の権限の拒否', { kind: 'auth', status: 401 }],
      ['400 InvalidToken の Bad token scope', {
        status: 400,
        code: 'InvalidToken',
        message: 'status 400 InvalidToken Bad token scope',
      }],
    ] as const,
  )('ブックマークを使えない応答（%s）は 502 の Bluesky bookmarks unavailable にする', async (_name, overrides) => {
    const t = await setup({
      scope: 'read:bookmarks',
      reader: { getBookmarks: vi.fn(async () => RA.err(clientError(overrides))) },
    });

    const response = await t.get(BOOKMARKS);

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Bluesky bookmarks unavailable' });
  });

  it('それ以外の Bluesky の失敗は 502 の Bluesky request failed にする', async () => {
    const t = await setup({
      scope: 'read:bookmarks',
      reader: { getBookmarks: vi.fn(async () => RA.err(clientError({ kind: 'network' }))) },
    });

    const response = await t.get(BOOKMARKS);

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Bluesky request failed' });
  });
});

describe('POST /api/iori/v1/bluesky/bookmarks', () => {
  it('認証なしだと 401、Origin が違う Cookie だと 403 にし、Bluesky を呼ばない', async () => {
    const t = await setup({ scope: 'write:bookmarks' });

    expect((await t.anonymous(BOOKMARKS, { method: 'POST', headers: { Origin: ORIGIN } })).status).toBe(401);
    const evil = { Cookie: `sessionId=${t.sessionId}`, Origin: 'https://evil.example' };
    expect((await t.send('POST', BOOKMARKS, { feedItemId: POST }, evil)).status).toBe(403);
    expect(t.client.createBookmark).not.toHaveBeenCalled();
  });

  it('write:bookmarks を満たさない scope のトークンを 403 にする', async () => {
    const t = await setup({ scope: 'read:bookmarks' });

    expect((await t.send('POST', BOOKMARKS, { feedItemId: POST })).status).toBe(403);
    expect(t.client.createBookmark).not.toHaveBeenCalled();
  });

  it('所有者でない利用者を 403 にし、Bluesky を呼ばない', async () => {
    const t = await setup({ scope: 'write:bookmarks', owner: false });

    const response = await t.send('POST', BOOKMARKS, { feedItemId: POST });

    expect(response.status).toBe(403);
    expect(t.client.createBookmark).not.toHaveBeenCalled();
  });

  it('無効のときは 409 を返す', async () => {
    const t = await setup({ scope: 'write:bookmarks', enabled: false });

    expect((await t.send('POST', BOOKMARKS, { feedItemId: POST })).status).toBe(409);
  });

  it('feedItemId も uri も無い、または uri が投稿の uri でないなら 400 にする', async () => {
    const t = await setup({ scope: 'write:bookmarks' });

    expect(await (await t.send('POST', BOOKMARKS, {})).json()).toEqual({ error: 'Validation failed: feedItemId' });
    expect((await t.send('POST', BOOKMARKS, { uri: 'https://example.com' })).status).toBe(400);
    expect((await t.send('POST', BOOKMARKS, { feedItemId: POST, uri: POST })).status).toBe(400);
    expect(t.client.createBookmark).not.toHaveBeenCalled();
  });

  it('feedItemId の投稿を Bluesky に作成し、bluesky_bookmarks に保存して bookmarked: true を返す', async () => {
    const t = await setup({ scope: 'write:bookmarks' });

    const response = await t.send('POST', BOOKMARKS, { feedItemId: REPOST });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ bookmarked: true });
    expect(t.client.createBookmark).toHaveBeenCalledExactlyOnceWith({ uri: POST, cid: 'cid1' });
    expect(t.mirrored()).toEqual([{ subjectUri: POST }]);
  });

  it('uri の指定では cid を解決して作成する', async () => {
    const t = await setup({ scope: 'write:bookmarks' });

    const response = await t.send('POST', BOOKMARKS, { uri: POST });

    expect(response.status).toBe(200);
    expect(t.client.createBookmark).toHaveBeenCalledExactlyOnceWith({ uri: POST, cid: 'cid-fresh' });
  });

  it('見つからない投稿は 404 にする', async () => {
    const t = await setup({ scope: 'write:bookmarks' });

    expect((await t.send('POST', BOOKMARKS, { feedItemId: 'unknown' })).status).toBe(404);
    expect(
      (await t.send('POST', BOOKMARKS, { uri: 'at://did:plc:alice/app.bsky.feed.post/none' })).status,
    ).toBe(404);
    expect(t.client.createBookmark).not.toHaveBeenCalled();
  });

  it('Bluesky のログインに失敗したら 502 の Bluesky login failed にし、保存しない', async () => {
    const t = await setup({
      scope: 'write:bookmarks',
      client: {
        createBookmark: vi.fn(async () => RA.err(clientError({ kind: 'auth', status: 400, code: 'ExpiredToken' }))),
      },
    });

    const response = await t.send('POST', BOOKMARKS, { feedItemId: POST });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Bluesky login failed' });
    expect(t.mirrored()).toEqual([]);
  });

  it('ブックマークを使えない応答は 502 の Bluesky bookmarks unavailable にし、ログイン切れと区別して保存しない', async () => {
    const t = await setup({
      scope: 'write:bookmarks',
      client: { createBookmark: vi.fn(async () => RA.err(clientError({ status: 403, code: 'Forbidden' }))) },
    });

    const response = await t.send('POST', BOOKMARKS, { feedItemId: POST });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Bluesky bookmarks unavailable' });
    expect(t.mirrored()).toEqual([]);
  });

  it('それ以外の失敗は 502 の Bluesky request failed にする', async () => {
    const t = await setup({
      scope: 'write:bookmarks',
      client: { createBookmark: vi.fn(async () => RA.err(clientError())) },
    });

    const response = await t.send('POST', BOOKMARKS, { feedItemId: POST });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Bluesky request failed' });
  });
});

describe('DELETE /api/iori/v1/bluesky/bookmarks', () => {
  it('認証なしだと 401、Origin が違う Cookie だと 403 にし、Bluesky を呼ばない', async () => {
    const t = await setup({ scope: 'write:bookmarks' });

    expect((await t.anonymous(`${BOOKMARKS}?uri=${POST}`, { method: 'DELETE', headers: { Origin: ORIGIN } })).status)
      .toBe(401);
    const evil = { Cookie: `sessionId=${t.sessionId}`, Origin: 'https://evil.example' };
    expect((await t.send('DELETE', `${BOOKMARKS}?uri=${POST}`, undefined, evil)).status).toBe(403);
    expect(t.client.deleteBookmark).not.toHaveBeenCalled();
  });

  it('所有者でない利用者を 403、無効のときは 409 にする', async () => {
    const notOwner = await setup({ scope: 'write:bookmarks', owner: false });
    const disabled = await setup({ scope: 'write:bookmarks', enabled: false });

    expect((await notOwner.send('DELETE', `${BOOKMARKS}?uri=${POST}`)).status).toBe(403);
    expect((await disabled.send('DELETE', `${BOOKMARKS}?uri=${POST}`)).status).toBe(409);
    expect(notOwner.client.deleteBookmark).not.toHaveBeenCalled();
  });

  it('feedItemId も uri も無いなら 400 にする', async () => {
    const t = await setup({ scope: 'write:bookmarks' });

    expect((await t.send('DELETE', BOOKMARKS)).status).toBe(400);
    expect(t.client.deleteBookmark).not.toHaveBeenCalled();
  });

  it('feedItemId の投稿の uri で Bluesky から削除し、bluesky_bookmarks の行を消して bookmarked: false を返す', async () => {
    const t = await setup({ scope: 'write:bookmarks' });
    await t.send('POST', BOOKMARKS, { feedItemId: POST });

    const response = await t.send('DELETE', `${BOOKMARKS}?feedItemId=${encodeURIComponent(REPOST)}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ bookmarked: false });
    expect(t.client.deleteBookmark).toHaveBeenCalledExactlyOnceWith(POST);
    expect(t.mirrored()).toEqual([]);
  });

  it('uri の指定では、その uri で Bluesky から削除する', async () => {
    const t = await setup({ scope: 'write:bookmarks' });

    const response = await t.send('DELETE', `${BOOKMARKS}?uri=${encodeURIComponent(POST)}`);

    expect(response.status).toBe(200);
    expect(t.client.deleteBookmark).toHaveBeenCalledExactlyOnceWith(POST);
  });

  it('見つからない feedItemId は 404 にする', async () => {
    const t = await setup({ scope: 'write:bookmarks' });

    expect((await t.send('DELETE', `${BOOKMARKS}?feedItemId=unknown`)).status).toBe(404);
  });

  it('ログイン切れは Bluesky login failed、使えない応答は Bluesky bookmarks unavailable にして区別する', async () => {
    const loginFailed = await setup({
      scope: 'write:bookmarks',
      client: {
        deleteBookmark: vi.fn(async () =>
          RA.err(clientError({ kind: 'auth', status: 401, code: 'AuthenticationRequired' }))
        ),
      },
    });
    const unavailable = await setup({
      scope: 'write:bookmarks',
      client: { deleteBookmark: vi.fn(async () => RA.err(clientError({ status: 501, code: 'MethodNotImplemented' }))) },
    });

    const first = await loginFailed.send('DELETE', `${BOOKMARKS}?uri=${POST}`);
    const second = await unavailable.send('DELETE', `${BOOKMARKS}?uri=${POST}`);

    expect(first.status).toBe(502);
    expect(await first.json()).toEqual({ error: 'Bluesky login failed' });
    expect(second.status).toBe(502);
    expect(await second.json()).toEqual({ error: 'Bluesky bookmarks unavailable' });
  });
});
