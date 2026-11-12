import { RA } from '@iwasa-kosui/result';
import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Instant } from '../../../domain/instant/instant.ts';
import type { BlueskyClient, BlueskyClientError } from '../../../ports/blueskyClient.ts';
import type { BlueskyProfile, BlueskyProfileReader } from '../../../ports/blueskyProfileReader.ts';
import { FollowBlueskyActorUseCase } from '../../../useCase/followBlueskyActor.ts';
import { GetBlueskyProfileUseCase } from '../../../useCase/getBlueskyProfile.ts';
import { IsDigestOwner } from '../../../useCase/isDigestOwner.ts';
import { ListBlueskyAuthorFeedUseCase } from '../../../useCase/listBlueskyAuthorFeed.ts';
import { UnfollowBlueskyActorUseCase } from '../../../useCase/unfollowBlueskyActor.ts';
import { createMastodonSeed } from '../../d1/__tests__/mastodonSeed.ts';
import { createSqliteD1Fixture } from '../../d1/__tests__/sqliteFixture.ts';
import { createD1UserResolverByUsername } from '../../d1/user/userResolverByUsername.ts';
import { createMastodonAuthn } from '../mastodonAuthn.ts';
import { createWorkerIoriBlueskyProfileRouter } from '../workerIoriBlueskyProfileRouter.ts';
import { createOAuthHarness, ORIGIN } from './helper/oauthHarness.ts';

const DID = 'did:plc:alice';
const FOLLOW_URI = 'at://did:plc:me/app.bsky.graph.follow/3kfollow';
const NEW_FOLLOW_URI = 'at://did:plc:me/app.bsky.graph.follow/3knew';
const PROFILES = '/api/iori/v1/bluesky/profiles';
const FOLLOWS = '/api/iori/v1/bluesky/follows';
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

const profile = (overrides: Partial<BlueskyProfile> = {}): BlueskyProfile => ({
  did: DID,
  handle: 'alice.bsky.social',
  displayName: 'Alice',
  description: 'hello\nworld',
  avatar: 'https://cdn.example/avatar.jpg',
  banner: null,
  followersCount: 3,
  followsCount: 2,
  postsCount: 1,
  viewerFollowingUri: undefined,
  viewerFollowedBy: true,
  ...overrides,
});

const feedItem = {
  feedItemId: 'at://did:plc:alice/app.bsky.feed.post/1',
  uri: 'at://did:plc:alice/app.bsky.feed.post/1',
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
};

const setup = async (options: {
  scope: string;
  owner?: boolean;
  enabled?: boolean;
  reader?: Partial<BlueskyProfileReader>;
  client?: Partial<Pick<BlueskyClient, 'createFollow' | 'deleteFollow'>>;
}) => {
  const harness = createOAuthHarness();
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  const reader: BlueskyProfileReader = {
    getProfile: vi.fn(async () => RA.ok(profile())),
    getAuthorFeed: vi.fn(async () => RA.ok({ items: [feedItem], cursor: 'next-cursor' })),
    ...options.reader,
  };
  const client = {
    createFollow: vi.fn<BlueskyClient['createFollow']>(async () => RA.ok({ uri: NEW_FOLLOW_URI })),
    deleteFollow: vi.fn<BlueskyClient['deleteFollow']>(async () => RA.ok(undefined)),
    ...options.client,
  };
  const enabled = options.enabled !== false;
  const app = new Hono().route(
    '/api',
    createWorkerIoriBlueskyProfileRouter({
      authn: createMastodonAuthn({
        verifyAccessTokenUseCase: harness.memory.useCases.verifyAccessTokenUseCase,
        sessionResolver: harness.memory.sessionResolver as never,
      }),
      getBlueskyProfileUseCase: enabled ? GetBlueskyProfileUseCase.create({ reader }) : undefined,
      listBlueskyAuthorFeedUseCase: enabled ? ListBlueskyAuthorFeedUseCase.create({ reader }) : undefined,
      followBlueskyActorUseCase: enabled ? FollowBlueskyActorUseCase.create({ reader, client }) : undefined,
      unfollowBlueskyActorUseCase: enabled ? UnfollowBlueskyActorUseCase.create({ reader, client }) : undefined,
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
  return { get, send, anonymous, reader, client, sessionId: issued.sessionId };
};

describe('GET /api/iori/v1/bluesky/profiles/:actor', () => {
  it('認証なしだと 401 にする', async () => {
    const t = await setup({ scope: 'read:accounts' });

    expect((await t.anonymous(`${PROFILES}/${DID}`)).status).toBe(401);
    expect((await t.anonymous(`${PROFILES}/${DID}/feed`)).status).toBe(401);
    expect(t.reader.getProfile).not.toHaveBeenCalled();
  });

  it('read:accounts を満たさない scope のトークンを 403 にする', async () => {
    const t = await setup({ scope: 'read:statuses' });

    expect((await t.get(`${PROFILES}/${DID}`)).status).toBe(403);
    expect(t.reader.getProfile).not.toHaveBeenCalled();
  });

  it('所有者でない利用者を 403 にし、Bluesky を呼ばない', async () => {
    const t = await setup({ scope: 'read:accounts', owner: false });

    const response = await t.get(`${PROFILES}/${DID}`);
    const feed = await t.get(`${PROFILES}/${DID}/feed`);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
    expect(feed.status).toBe(403);
    expect(t.reader.getProfile).not.toHaveBeenCalled();
    expect(t.reader.getAuthorFeed).not.toHaveBeenCalled();
  });

  it('無効のときは 409 を返す', async () => {
    const t = await setup({ scope: 'read:accounts', enabled: false });

    const response = await t.get(`${PROFILES}/${DID}`);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Bluesky timeline is disabled' });
    expect((await t.get(`${PROFILES}/${DID}/feed`)).status).toBe(409);
  });

  it('プロフィールを返し、フォロー中かどうかを following にする', async () => {
    const t = await setup({
      scope: 'read:accounts',
      reader: { getProfile: vi.fn(async () => RA.ok(profile({ viewerFollowingUri: FOLLOW_URI }))) },
    });

    const response = await t.get(`${PROFILES}/${encodeURIComponent(DID)}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      did: DID,
      handle: 'alice.bsky.social',
      displayName: 'Alice',
      description: 'hello\nworld',
      avatar: 'https://cdn.example/avatar.jpg',
      banner: null,
      followersCount: 3,
      followsCount: 2,
      postsCount: 1,
      following: true,
      followedBy: true,
    });
    expect(t.reader.getProfile).toHaveBeenCalledExactlyOnceWith(DID);
  });

  it('ハンドルでも引ける', async () => {
    const t = await setup({ scope: 'read:accounts' });

    expect((await t.get(`${PROFILES}/alice.bsky.social`)).status).toBe(200);
    expect(t.reader.getProfile).toHaveBeenCalledExactlyOnceWith('alice.bsky.social');
  });

  it('アカウントが無ければ 404 にする', async () => {
    const t = await setup({
      scope: 'read:accounts',
      reader: {
        getProfile: vi.fn(async () => RA.err(clientError({ status: 400, code: 'InvalidRequest' }))),
      },
    });

    const response = await t.get(`${PROFILES}/nobody.bsky.social`);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Profile not found' });
  });

  it('Bluesky のログインに失敗したら 502 にして Bluesky login failed を返す', async () => {
    const t = await setup({
      scope: 'read:accounts',
      reader: { getProfile: vi.fn(async () => RA.err(clientError({ kind: 'auth', status: 401 }))) },
    });

    const response = await t.get(`${PROFILES}/${DID}`);

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Bluesky login failed' });
  });

  it('それ以外の Bluesky の失敗を 502 にして Bluesky request failed を返す', async () => {
    const t = await setup({
      scope: 'read:accounts',
      reader: { getProfile: vi.fn(async () => RA.err(clientError({ kind: 'network' }))) },
    });

    const response = await t.get(`${PROFILES}/${DID}`);

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Bluesky request failed' });
  });
});

describe('GET /api/iori/v1/bluesky/profiles/:actor/feed', () => {
  it('投稿を IoriBlueskyTimelineItemBody の形で返し、cursor を渡す', async () => {
    const t = await setup({ scope: 'read:accounts' });

    const response = await t.get(`${PROFILES}/${encodeURIComponent(DID)}/feed?cursor=abc`);

    expect(response.status).toBe(200);
    const body = await response.json() as { items: Array<Record<string, unknown>>; cursor: string | null };
    expect(body.cursor).toBe('next-cursor');
    expect(body.items).toEqual([{
      feedItemId: feedItem.feedItemId,
      uri: feedItem.uri,
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
    }]);
    expect(t.reader.getAuthorFeed).toHaveBeenCalledExactlyOnceWith({ actor: DID, cursor: 'abc' });
  });

  it('続きが無いとき cursor を null にし、cursor を付けなければ undefined で呼ぶ', async () => {
    const t = await setup({
      scope: 'read:accounts',
      reader: { getAuthorFeed: vi.fn(async () => RA.ok({ items: [], cursor: undefined })) },
    });

    const response = await t.get(`${PROFILES}/${DID}/feed`);

    expect(await response.json()).toEqual({ items: [], cursor: null });
    expect(t.reader.getAuthorFeed).toHaveBeenCalledExactlyOnceWith({ actor: DID, cursor: undefined });
  });

  it('アカウントが無ければ 404、失敗は 502 にする', async () => {
    const missing = await setup({
      scope: 'read:accounts',
      reader: { getAuthorFeed: vi.fn(async () => RA.err(clientError({ code: 'AccountTakedown', status: 400 }))) },
    });
    const failing = await setup({
      scope: 'read:accounts',
      reader: { getAuthorFeed: vi.fn(async () => RA.err(clientError())) },
    });

    expect((await missing.get(`${PROFILES}/${DID}/feed`)).status).toBe(404);
    expect((await failing.get(`${PROFILES}/${DID}/feed`)).status).toBe(502);
  });
});

describe('POST /api/iori/v1/bluesky/follows', () => {
  it('認証なしだと 401、Origin が違う Cookie だと 403 にし、Bluesky を呼ばない', async () => {
    const t = await setup({ scope: 'write:follows' });

    expect((await t.anonymous(FOLLOWS, { method: 'POST', headers: { Origin: ORIGIN } })).status).toBe(401);
    const evil = { Cookie: `sessionId=${t.sessionId}`, Origin: 'https://evil.example' };
    expect((await t.send('POST', FOLLOWS, { did: DID }, evil)).status).toBe(403);
    expect(t.client.createFollow).not.toHaveBeenCalled();
  });

  it('write:follows を満たさない scope のトークンを 403 にする', async () => {
    const t = await setup({ scope: 'read:accounts' });

    expect((await t.send('POST', FOLLOWS, { did: DID })).status).toBe(403);
    expect(t.client.createFollow).not.toHaveBeenCalled();
  });

  it('所有者でない利用者を 403 にし、Bluesky を呼ばない', async () => {
    const t = await setup({ scope: 'write:follows', owner: false });

    const response = await t.send('POST', FOLLOWS, { did: DID });

    expect(response.status).toBe(403);
    expect(t.client.createFollow).not.toHaveBeenCalled();
  });

  it('無効のときは 409 を返す', async () => {
    const t = await setup({ scope: 'write:follows', enabled: false });

    expect((await t.send('POST', FOLLOWS, { did: DID })).status).toBe(409);
  });

  it('did が無い、または did: で始まらないなら 400 にする', async () => {
    const t = await setup({ scope: 'write:follows' });

    expect((await t.send('POST', FOLLOWS, {})).status).toBe(400);
    expect((await t.send('POST', FOLLOWS, { did: 'alice.bsky.social' })).status).toBe(400);
    expect((await t.send('POST', FOLLOWS, { did: 42 })).status).toBe(400);
    expect(t.client.createFollow).not.toHaveBeenCalled();
  });

  it('未フォローなら createFollow を呼び、following と followUri を返す', async () => {
    const t = await setup({ scope: 'write:follows' });

    const response = await t.send('POST', FOLLOWS, { did: DID });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ following: true, followUri: NEW_FOLLOW_URI });
    expect(t.client.createFollow).toHaveBeenCalledExactlyOnceWith(DID);
  });

  it('アカウントが無ければ 404 にし、フォローしない', async () => {
    const t = await setup({
      scope: 'write:follows',
      reader: { getProfile: vi.fn(async () => RA.err(clientError({ status: 400, code: 'AccountDeactivated' }))) },
    });

    const response = await t.send('POST', FOLLOWS, { did: DID });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Profile not found' });
    expect(t.client.createFollow).not.toHaveBeenCalled();
  });

  it('Bluesky のログインに失敗したら 502 と Bluesky login failed を返す', async () => {
    const t = await setup({
      scope: 'write:follows',
      client: { createFollow: vi.fn(async () => RA.err(clientError({ kind: 'auth', status: 401 }))) },
    });

    const response = await t.send('POST', FOLLOWS, { did: DID });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Bluesky login failed' });
  });

  it('それ以外の失敗は 502 と Bluesky request failed を返す', async () => {
    const t = await setup({
      scope: 'write:follows',
      client: { createFollow: vi.fn(async () => RA.err(clientError())) },
    });

    const response = await t.send('POST', FOLLOWS, { did: DID });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Bluesky request failed' });
  });
});

describe('DELETE /api/iori/v1/bluesky/follows', () => {
  const unfollow = (t: Awaited<ReturnType<typeof setup>>, did: string = DID) =>
    t.send('DELETE', `${FOLLOWS}?did=${encodeURIComponent(did)}`);

  it('認証なしだと 401、Origin が違う Cookie だと 403 にし、Bluesky を呼ばない', async () => {
    const t = await setup({
      scope: 'write:follows',
      reader: { getProfile: vi.fn(async () => RA.ok(profile({ viewerFollowingUri: FOLLOW_URI }))) },
    });

    expect((await t.anonymous(`${FOLLOWS}?did=${DID}`, { method: 'DELETE', headers: { Origin: ORIGIN } })).status)
      .toBe(401);
    const evil = { Cookie: `sessionId=${t.sessionId}`, Origin: 'https://evil.example' };
    expect((await t.send('DELETE', `${FOLLOWS}?did=${DID}`, undefined, evil)).status).toBe(403);
    expect(t.client.deleteFollow).not.toHaveBeenCalled();
  });

  it('所有者でない利用者を 403、無効なら 409 にする', async () => {
    const nonOwner = await setup({ scope: 'write:follows', owner: false });
    const disabled = await setup({ scope: 'write:follows', enabled: false });

    expect((await unfollow(nonOwner)).status).toBe(403);
    expect(nonOwner.client.deleteFollow).not.toHaveBeenCalled();
    expect((await unfollow(disabled)).status).toBe(409);
  });

  it('did が無い、または did: で始まらないなら 400 にする', async () => {
    const t = await setup({ scope: 'write:follows' });

    expect((await t.send('DELETE', FOLLOWS)).status).toBe(400);
    expect((await unfollow(t, 'alice.bsky.social')).status).toBe(400);
  });

  it('フォロー中なら deleteFollow を呼び、following: false を返す', async () => {
    const t = await setup({
      scope: 'write:follows',
      reader: { getProfile: vi.fn(async () => RA.ok(profile({ viewerFollowingUri: FOLLOW_URI }))) },
    });

    const response = await unfollow(t);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ following: false });
    expect(t.client.deleteFollow).toHaveBeenCalledExactlyOnceWith(FOLLOW_URI);
  });

  it('アカウントが無ければ 404、Bluesky のログイン失敗は 502 にする', async () => {
    const missing = await setup({
      scope: 'write:follows',
      reader: { getProfile: vi.fn(async () => RA.err(clientError({ status: 400, code: 'InvalidRequest' }))) },
    });
    const failing = await setup({
      scope: 'write:follows',
      reader: { getProfile: vi.fn(async () => RA.ok(profile({ viewerFollowingUri: FOLLOW_URI }))) },
      client: { deleteFollow: vi.fn(async () => RA.err(clientError({ kind: 'auth', status: 401 }))) },
    });

    expect((await unfollow(missing)).status).toBe(404);
    const response = await unfollow(failing);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Bluesky login failed' });
  });
});
