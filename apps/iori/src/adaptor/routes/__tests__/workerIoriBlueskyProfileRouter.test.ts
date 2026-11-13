import { RA } from '@iwasa-kosui/result';
import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { blueskyFeedKindOf } from '../../../domain/blueskyFeed/blueskyFeedUri.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import type { BlueskyClient, BlueskyClientError } from '../../../ports/blueskyClient.ts';
import type { BlueskyFeedReader } from '../../../ports/blueskyFeedReader.ts';
import type { BlueskyProfile, BlueskyProfileReader } from '../../../ports/blueskyProfileReader.ts';
import { FollowBlueskyActorUseCase } from '../../../useCase/followBlueskyActor.ts';
import { GetBlueskyFeedInfoUseCase } from '../../../useCase/getBlueskyFeedInfo.ts';
import { GetBlueskyProfileUseCase } from '../../../useCase/getBlueskyProfile.ts';
import { GetOwnBlueskyProfileUseCase } from '../../../useCase/getOwnBlueskyProfile.ts';
import { IsDigestOwner } from '../../../useCase/isDigestOwner.ts';
import { ListBlueskyActorFeedsUseCase } from '../../../useCase/listBlueskyActorFeeds.ts';
import { ListBlueskyActorFollowersUseCase } from '../../../useCase/listBlueskyActorFollowers.ts';
import { ListBlueskyActorFollowsUseCase } from '../../../useCase/listBlueskyActorFollows.ts';
import { ListBlueskyActorLikesUseCase } from '../../../useCase/listBlueskyActorLikes.ts';
import { ListBlueskyActorListsUseCase } from '../../../useCase/listBlueskyActorLists.ts';
import { ListBlueskyAuthorFeedUseCase } from '../../../useCase/listBlueskyAuthorFeed.ts';
import { ListBlueskyFeedPostsUseCase } from '../../../useCase/listBlueskyFeedPosts.ts';
import { ListBlueskyListMembersUseCase } from '../../../useCase/listBlueskyListMembers.ts';
import { ListBlueskySavedFeedsUseCase } from '../../../useCase/listBlueskySavedFeeds.ts';
import { ResolveBlueskyFeedUrlUseCase } from '../../../useCase/resolveBlueskyFeedUrl.ts';
import { UnfollowBlueskyActorUseCase } from '../../../useCase/unfollowBlueskyActor.ts';
import { UpdateBlueskyProfileUseCase } from '../../../useCase/updateBlueskyProfile.ts';
import { createMastodonSeed } from '../../d1/__tests__/mastodonSeed.ts';
import { createSqliteD1Fixture } from '../../d1/__tests__/sqliteFixture.ts';
import { createD1UserResolverByUsername } from '../../d1/user/userResolverByUsername.ts';
import { createMastodonAuthn } from '../mastodonAuthn.ts';
import { createWorkerIoriBlueskyProfileRouter } from '../workerIoriBlueskyProfileRouter.ts';
import { createOAuthHarness, ORIGIN } from './helper/oauthHarness.ts';

const DID = 'did:plc:alice';
const OWN_DID = 'did:plc:me';
const FOLLOW_URI = 'at://did:plc:me/app.bsky.graph.follow/3kfollow';
const NEW_FOLLOW_URI = 'at://did:plc:me/app.bsky.graph.follow/3knew';
const PROFILES = '/api/iori/v1/bluesky/profiles';
const OWN_PROFILE = '/api/iori/v1/bluesky/profile';
const OWN_PROFILE_URI = 'at://did:plc:me/app.bsky.actor.profile/self';
const FOLLOWS = '/api/iori/v1/bluesky/follows';
const LIKED_POSTS = '/api/iori/v1/bluesky/liked-posts';
const FEEDS = '/api/iori/v1/bluesky/feeds';
const FEED_POSTS = '/api/iori/v1/bluesky/feeds/posts';
const FEED_INFO = '/api/iori/v1/bluesky/feeds/info';
const FEED_RESOLVE = '/api/iori/v1/bluesky/feeds/resolve';
const LIST_MEMBERS = '/api/iori/v1/bluesky/lists/members';
const FEED_URI = 'at://did:plc:gen/app.bsky.feed.generator/whats-hot';
const LIST_URI = 'at://did:plc:own/app.bsky.graph.list/3klist';
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

const member = {
  did: 'did:plc:bob',
  handle: 'bob.bsky.social',
  displayName: 'Bob',
  avatar: null,
  description: null,
  followedByMe: false,
};

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
  bridgyOriginalUrl: null,
  bridgedFromPostId: null,
  postedAt: Instant.orThrow(NOW - 1000),
  indexedAt: Instant.orThrow(NOW - 500),
  fetchedAt: Instant.orThrow(NOW),
  liked: false,
  viewerLikeUri: null,
  reposted: false,
  threadMuted: false,
  replyRootUri: null,
  viewerRepostUri: null,
  bookmarked: false,
};

const setup = async (options: {
  scope: string;
  owner?: boolean;
  enabled?: boolean;
  reader?: Partial<BlueskyProfileReader>;
  feedReader?: Partial<BlueskyFeedReader>;
  client?: Partial<
    Pick<
      BlueskyClient,
      'createFollow' | 'deleteFollow' | 'getRecord' | 'getProfileRecord' | 'putProfileRecord' | 'uploadBlob'
    >
  >;
  viewerDid?: () => RA<string, BlueskyClientError>;
  ownDid?: () => RA<string, BlueskyClientError>;
}) => {
  const harness = createOAuthHarness();
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  const reader: BlueskyProfileReader = {
    getProfile: vi.fn(async () => RA.ok(profile())),
    getAuthorFeed: vi.fn(async () => RA.ok({ items: [feedItem], cursor: 'next-cursor', unavailable: null })),
    getActorLikes: vi.fn(async () => RA.ok({ items: [feedItem], cursor: 'next-cursor' })),
    getFollows: vi.fn<BlueskyProfileReader['getFollows']>(async () =>
      RA.ok({ actors: [member], cursor: 'next-cursor' })
    ),
    getFollowers: vi.fn<BlueskyProfileReader['getFollowers']>(async () =>
      RA.ok({ actors: [member], cursor: 'next-cursor' })
    ),
    ...options.reader,
  };
  const feedReader: BlueskyFeedReader = {
    listSavedFeeds: vi.fn<BlueskyFeedReader['listSavedFeeds']>(async () =>
      RA.ok({
        feeds: [
          { uri: FEED_URI, kind: 'feed', pinned: true, displayName: 'Hot', creatorHandle: 'gen.bsky.social' },
          { uri: LIST_URI, kind: 'list', pinned: false },
        ],
      })
    ),
    getFeedPosts: vi.fn(async () => RA.ok({ items: [feedItem], cursor: 'next-cursor' })),
    getFeedInfo: vi.fn<BlueskyFeedReader['getFeedInfo']>(async (uri) =>
      RA.ok({
        uri,
        kind: blueskyFeedKindOf(uri) ?? 'feed',
        pinned: false,
        displayName: 'Info',
        creatorHandle: 'gen.bsky.social',
      })
    ),
    getListMembers: vi.fn<BlueskyFeedReader['getListMembers']>(async () =>
      RA.ok({ actors: [member], cursor: 'next-cursor' })
    ),
    getActorFeeds: vi.fn<BlueskyFeedReader['getActorFeeds']>(async () =>
      RA.ok({ feeds: [{ uri: FEED_URI, kind: 'feed', pinned: false, displayName: 'Hot' }], cursor: 'next-cursor' })
    ),
    getActorLists: vi.fn<BlueskyFeedReader['getActorLists']>(async () =>
      RA.ok({ feeds: [{ uri: LIST_URI, kind: 'list', pinned: false, displayName: 'Friends' }], cursor: 'next-cursor' })
    ),
    resolveHandle: vi.fn<BlueskyFeedReader['resolveHandle']>(async () => RA.ok('did:plc:gen')),
    ...options.feedReader,
  };
  const client = {
    createFollow: vi.fn<BlueskyClient['createFollow']>(async () => RA.ok({ uri: NEW_FOLLOW_URI })),
    deleteFollow: vi.fn<BlueskyClient['deleteFollow']>(async () => RA.ok(undefined)),
    getRecord: vi.fn<BlueskyClient['getRecord']>(async () =>
      RA.err(clientError({ status: 400, code: 'RecordNotFound' }))
    ),
    getProfileRecord: vi.fn<BlueskyClient['getProfileRecord']>(async () =>
      RA.ok({
        cid: 'bafycurrent',
        value: { $type: 'app.bsky.actor.profile', displayName: '旧名', pinnedPost: { uri: 'at://p' } },
      })
    ),
    putProfileRecord: vi.fn<BlueskyClient['putProfileRecord']>(async () =>
      RA.ok({ uri: OWN_PROFILE_URI, cid: 'bafynew' })
    ),
    uploadBlob: vi.fn<BlueskyClient['uploadBlob']>(async ({ bytes, mimeType }) =>
      RA.ok({ $type: 'blob', ref: { $link: 'bafyblob' }, mimeType, size: bytes.byteLength })
    ),
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
      listBlueskyActorLikesUseCase: enabled
        ? ListBlueskyActorLikesUseCase.create({ reader, viewerDid: options.ownDid ?? (async () => RA.ok(OWN_DID)) })
        : undefined,
      listBlueskySavedFeedsUseCase: enabled ? ListBlueskySavedFeedsUseCase.create({ reader: feedReader }) : undefined,
      listBlueskyFeedPostsUseCase: enabled ? ListBlueskyFeedPostsUseCase.create({ reader: feedReader }) : undefined,
      getBlueskyFeedInfoUseCase: enabled ? GetBlueskyFeedInfoUseCase.create({ reader: feedReader }) : undefined,
      resolveBlueskyFeedUrlUseCase: enabled ? ResolveBlueskyFeedUrlUseCase.create({ reader: feedReader }) : undefined,
      listBlueskyListMembersUseCase: enabled ? ListBlueskyListMembersUseCase.create({ reader: feedReader }) : undefined,
      listBlueskyActorFeedsUseCase: enabled ? ListBlueskyActorFeedsUseCase.create({ reader: feedReader }) : undefined,
      listBlueskyActorListsUseCase: enabled ? ListBlueskyActorListsUseCase.create({ reader: feedReader }) : undefined,
      listBlueskyActorFollowsUseCase: enabled ? ListBlueskyActorFollowsUseCase.create({ reader }) : undefined,
      listBlueskyActorFollowersUseCase: enabled ? ListBlueskyActorFollowersUseCase.create({ reader }) : undefined,
      followBlueskyActorUseCase: enabled ? FollowBlueskyActorUseCase.create({ reader, client }) : undefined,
      unfollowBlueskyActorUseCase: enabled ? UnfollowBlueskyActorUseCase.create({ reader, client }) : undefined,
      getOwnBlueskyProfileUseCase: enabled
        ? GetOwnBlueskyProfileUseCase.create({ reader, viewerDid: options.ownDid ?? (async () => RA.ok(OWN_DID)) })
        : undefined,
      updateBlueskyProfileUseCase: enabled
        ? UpdateBlueskyProfileUseCase.create({ client, now: () => Instant.orThrow(NOW) })
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
  const put = (path: string, form: FormData, headers: Record<string, string> = bearer) =>
    app.request(`${ORIGIN}${path}`, { method: 'PUT', headers, body: form });
  return { get, send, put, anonymous, reader, feedReader, client, sessionId: issued.sessionId };
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
      followUri: FOLLOW_URI,
      isSelf: false,
    });
    expect(t.reader.getProfile).toHaveBeenCalledExactlyOnceWith(DID);
  });

  it('フォローしていなければ followUri を null にする', async () => {
    const t = await setup({ scope: 'read:accounts' });

    const response = await t.get(`${PROFILES}/${DID}`);

    expect(await response.json()).toMatchObject({ following: false, followUri: null });
  });

  it('自分の DID のプロフィールだけ isSelf を true にする。自分の DID が取れなければ false にする', async () => {
    const own = await setup({ scope: 'read:accounts', viewerDid: async () => RA.ok(DID) });
    const other = await setup({ scope: 'read:accounts', viewerDid: async () => RA.ok('did:plc:me') });
    const failed = await setup({
      scope: 'read:accounts',
      viewerDid: async () => RA.err(clientError({ status: 500 })),
    });

    expect(await (await own.get(`${PROFILES}/${DID}`)).json()).toMatchObject({ isSelf: true });
    expect(await (await other.get(`${PROFILES}/${DID}`)).json()).toMatchObject({ isSelf: false });
    expect((await failed.get(`${PROFILES}/${DID}`)).status).toBe(200);
    expect(await (await failed.get(`${PROFILES}/${DID}`)).json()).toMatchObject({ isSelf: false });
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
    expect(body).toMatchObject({ unavailable: null });
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
      bridgyOriginalUrl: null,
      bridgedFromPostId: null,
      postedAt: NOW - 1000,
      indexedAt: NOW - 500,
      liked: false,
      reposted: false,
      bookmarked: false,
      threadMuted: false,
      replyRootUri: null,
      isOwn: false,
    }]);
    expect(t.reader.getAuthorFeed).toHaveBeenCalledExactlyOnceWith({ actor: DID, cursor: 'abc' });
  });

  it('続きが無いとき cursor を null にし、cursor を付けなければ undefined で呼ぶ', async () => {
    const t = await setup({
      scope: 'read:accounts',
      reader: { getAuthorFeed: vi.fn(async () => RA.ok({ items: [], cursor: undefined, unavailable: null })) },
    });

    const response = await t.get(`${PROFILES}/${DID}/feed`);

    expect(await response.json()).toEqual({ items: [], cursor: null, unavailable: null });
    expect(t.reader.getAuthorFeed).toHaveBeenCalledExactlyOnceWith({ actor: DID, cursor: undefined });
  });

  it('ブロック関係で読めないときは 200 で空の投稿と unavailable: blocked を返す', async () => {
    const t = await setup({
      scope: 'read:accounts',
      reader: {
        getAuthorFeed: vi.fn(async () => RA.ok({ items: [], cursor: undefined, unavailable: 'blocked' as const })),
      },
    });

    const response = await t.get(`${PROFILES}/${DID}/feed`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [], cursor: null, unavailable: 'blocked' });
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

describe('GET /api/iori/v1/bluesky/liked-posts', () => {
  it('いいねした投稿を IoriBlueskyTimelineItemBody の形で返し、自分の DID と cursor を渡す', async () => {
    const t = await setup({ scope: 'read:accounts' });

    const response = await t.get(`${LIKED_POSTS}?cursor=abc`);

    expect(response.status).toBe(200);
    const body = await response.json() as { items: Array<Record<string, unknown>>; cursor: string | null };
    expect(body.cursor).toBe('next-cursor');
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ uri: feedItem.uri, authorDid: DID, text: 'post 1', liked: false });
    expect(t.reader.getActorLikes).toHaveBeenCalledExactlyOnceWith({ actor: OWN_DID, cursor: 'abc' });
  });

  it('続きが無いとき cursor を null にし、cursor を付けなければ undefined で呼ぶ', async () => {
    const t = await setup({
      scope: 'read:accounts',
      reader: { getActorLikes: vi.fn(async () => RA.ok({ items: [], cursor: undefined })) },
    });

    const response = await t.get(LIKED_POSTS);

    expect(await response.json()).toEqual({ items: [], cursor: null });
    expect(t.reader.getActorLikes).toHaveBeenCalledExactlyOnceWith({ actor: OWN_DID, cursor: undefined });
  });

  it('認証なしは 401、read:accounts を満たさない scope は 403 にする', async () => {
    const t = await setup({ scope: 'read:statuses' });

    expect((await t.anonymous(LIKED_POSTS)).status).toBe(401);
    expect((await t.get(LIKED_POSTS)).status).toBe(403);
    expect(t.reader.getActorLikes).not.toHaveBeenCalled();
  });

  it('所有者でない利用者を 403 にし、Bluesky を呼ばない', async () => {
    const t = await setup({ scope: 'read:accounts', owner: false });

    const response = await t.get(LIKED_POSTS);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
    expect(t.reader.getActorLikes).not.toHaveBeenCalled();
  });

  it('無効のときは 409 を返す', async () => {
    const t = await setup({ scope: 'read:accounts', enabled: false });

    const response = await t.get(LIKED_POSTS);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Bluesky timeline is disabled' });
  });

  it('Bluesky のログイン失敗と、それ以外の失敗を 502 にする', async () => {
    const login = await setup({
      scope: 'read:accounts',
      reader: { getActorLikes: vi.fn(async () => RA.err(clientError({ kind: 'auth', status: 401 }))) },
    });
    const failing = await setup({
      scope: 'read:accounts',
      reader: { getActorLikes: vi.fn(async () => RA.err(clientError())) },
    });
    const noDid = await setup({
      scope: 'read:accounts',
      ownDid: async () => RA.err(clientError({ kind: 'network' })),
    });

    const loginResponse = await login.get(LIKED_POSTS);
    expect(loginResponse.status).toBe(502);
    expect(await loginResponse.json()).toEqual({ error: 'Bluesky login failed' });
    const failingResponse = await failing.get(LIKED_POSTS);
    expect(failingResponse.status).toBe(502);
    expect(await failingResponse.json()).toEqual({ error: 'Bluesky request failed' });
    expect((await noDid.get(LIKED_POSTS)).status).toBe(502);
    expect(noDid.reader.getActorLikes).not.toHaveBeenCalled();
  });
});

describe('GET /api/iori/v1/bluesky/feeds', () => {
  it('保存したフィードとリストを返す', async () => {
    const t = await setup({ scope: 'read:accounts' });

    const response = await t.get(FEEDS);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      feeds: [
        { uri: FEED_URI, kind: 'feed', pinned: true, displayName: 'Hot', creatorHandle: 'gen.bsky.social' },
        { uri: LIST_URI, kind: 'list', pinned: false },
      ],
    });
  });

  it('認証なしは 401、read:accounts を満たさない scope は 403 にする', async () => {
    const t = await setup({ scope: 'read:statuses' });

    expect((await t.anonymous(FEEDS)).status).toBe(401);
    expect((await t.get(FEEDS)).status).toBe(403);
    expect(t.feedReader.listSavedFeeds).not.toHaveBeenCalled();
  });

  it('所有者でない利用者を 403 にし、Bluesky を呼ばない', async () => {
    const t = await setup({ scope: 'read:accounts', owner: false });

    const response = await t.get(FEEDS);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
    expect(t.feedReader.listSavedFeeds).not.toHaveBeenCalled();
  });

  it('無効のときは 409 を返す', async () => {
    const t = await setup({ scope: 'read:accounts', enabled: false });

    const response = await t.get(FEEDS);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Bluesky timeline is disabled' });
  });

  it('Bluesky のログイン失敗と、それ以外の失敗を 502 にする', async () => {
    const login = await setup({
      scope: 'read:accounts',
      feedReader: { listSavedFeeds: vi.fn(async () => RA.err(clientError({ kind: 'auth', status: 401 }))) },
    });
    const failing = await setup({
      scope: 'read:accounts',
      feedReader: { listSavedFeeds: vi.fn(async () => RA.err(clientError())) },
    });

    const loginResponse = await login.get(FEEDS);
    expect(loginResponse.status).toBe(502);
    expect(await loginResponse.json()).toEqual({ error: 'Bluesky login failed' });
    const failingResponse = await failing.get(FEEDS);
    expect(failingResponse.status).toBe(502);
    expect(await failingResponse.json()).toEqual({ error: 'Bluesky request failed' });
  });
});

describe('GET /api/iori/v1/bluesky/feeds/posts', () => {
  it('投稿を IoriBlueskyTimelineItemBody の形で返し、uri と cursor を渡す', async () => {
    const t = await setup({ scope: 'read:accounts' });

    const response = await t.get(`${FEED_POSTS}?uri=${encodeURIComponent(FEED_URI)}&cursor=abc`);

    expect(response.status).toBe(200);
    const body = await response.json() as { items: Array<Record<string, unknown>>; cursor: string | null };
    expect(body.cursor).toBe('next-cursor');
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ uri: feedItem.uri, authorDid: DID, text: 'post 1', liked: false });
    expect(t.feedReader.getFeedPosts).toHaveBeenCalledExactlyOnceWith({ uri: FEED_URI, cursor: 'abc' });
  });

  it('list の uri も受け付け、続きが無いとき cursor を null にし、cursor を付けなければ undefined で呼ぶ', async () => {
    const t = await setup({
      scope: 'read:accounts',
      feedReader: { getFeedPosts: vi.fn(async () => RA.ok({ items: [], cursor: undefined })) },
    });

    const response = await t.get(`${FEED_POSTS}?uri=${encodeURIComponent(LIST_URI)}`);

    expect(await response.json()).toEqual({ items: [], cursor: null });
    expect(t.feedReader.getFeedPosts).toHaveBeenCalledExactlyOnceWith({ uri: LIST_URI, cursor: undefined });
  });

  it('uri が無い、または feed と list の URI でないとき 400 にし、Bluesky を呼ばない', async () => {
    const t = await setup({ scope: 'read:accounts' });

    expect((await t.get(FEED_POSTS)).status).toBe(400);
    expect((await t.get(`${FEED_POSTS}?uri=`)).status).toBe(400);
    expect((await t.get(`${FEED_POSTS}?uri=${encodeURIComponent('at://did:plc:a/app.bsky.feed.post/1')}`)).status)
      .toBe(400);
    expect((await t.get(`${FEED_POSTS}?uri=https%3A%2F%2Fexample.com`)).status).toBe(400);
    expect(t.feedReader.getFeedPosts).not.toHaveBeenCalled();
  });

  it('認証なしは 401、read:accounts を満たさない scope は 403 にする', async () => {
    const t = await setup({ scope: 'read:statuses' });
    const path = `${FEED_POSTS}?uri=${encodeURIComponent(FEED_URI)}`;

    expect((await t.anonymous(path)).status).toBe(401);
    expect((await t.get(path)).status).toBe(403);
    expect(t.feedReader.getFeedPosts).not.toHaveBeenCalled();
  });

  it('所有者でない利用者を 403 にし、Bluesky を呼ばない', async () => {
    const t = await setup({ scope: 'read:accounts', owner: false });

    const response = await t.get(`${FEED_POSTS}?uri=${encodeURIComponent(FEED_URI)}`);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
    expect(t.feedReader.getFeedPosts).not.toHaveBeenCalled();
  });

  it('無効のときは 409 を返す', async () => {
    const t = await setup({ scope: 'read:accounts', enabled: false });

    const response = await t.get(`${FEED_POSTS}?uri=${encodeURIComponent(FEED_URI)}`);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Bluesky timeline is disabled' });
  });

  it('Bluesky のログイン失敗と、それ以外の失敗を 502 にする', async () => {
    const path = `${FEED_POSTS}?uri=${encodeURIComponent(FEED_URI)}`;
    const login = await setup({
      scope: 'read:accounts',
      feedReader: { getFeedPosts: vi.fn(async () => RA.err(clientError({ kind: 'auth', status: 401 }))) },
    });
    const failing = await setup({
      scope: 'read:accounts',
      feedReader: { getFeedPosts: vi.fn(async () => RA.err(clientError({ kind: 'network', status: undefined }))) },
    });

    const loginResponse = await login.get(path);
    expect(loginResponse.status).toBe(502);
    expect(await loginResponse.json()).toEqual({ error: 'Bluesky login failed' });
    const failingResponse = await failing.get(path);
    expect(failingResponse.status).toBe(502);
    expect(await failingResponse.json()).toEqual({ error: 'Bluesky request failed' });
  });

  it('見つからない失敗は 404、提供元の失敗は 502 の Feed provider failed にする', async () => {
    const path = `${FEED_POSTS}?uri=${encodeURIComponent(FEED_URI)}`;
    const responseOf = async (error: BlueskyClientError) => {
      const t = await setup({
        scope: 'read:accounts',
        feedReader: { getFeedPosts: vi.fn(async () => RA.err(error)) },
      });
      return t.get(path);
    };

    for (
      const error of [
        clientError({ status: 400, code: 'UnknownFeed' }),
        clientError({ status: 400, code: 'UnknownList' }),
        clientError({ status: 400, code: 'NotFound' }),
        clientError({ status: 404 }),
      ]
    ) {
      const response = await responseOf(error);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'Feed not found' });
    }
    for (
      const error of [
        clientError({ status: 502, code: 'UpstreamFailure' }),
        clientError({ status: 500 }),
        clientError({ status: 400, code: 'UpstreamFailure' }),
        clientError({ status: 401, code: 'UpstreamFailure' }),
      ]
    ) {
      const response = await responseOf(error);
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: 'Feed provider failed' });
    }
  });

  it('リストの 5xx は Feed provider failed にせず、Bluesky request failed にする', async () => {
    const path = `${FEED_POSTS}?uri=${encodeURIComponent(LIST_URI)}`;

    for (const error of [clientError({ status: 502, code: 'UpstreamFailure' }), clientError({ status: 500 })]) {
      const t = await setup({
        scope: 'read:accounts',
        feedReader: { getFeedPosts: vi.fn(async () => RA.err(error)) },
      });
      const response = await t.get(path);
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: 'Bluesky request failed' });
    }
  });

  it('ネットワークの失敗と、提供元の失敗でない HTTP エラーは Bluesky request failed にする', async () => {
    const path = `${FEED_POSTS}?uri=${encodeURIComponent(FEED_URI)}`;
    const network = await setup({
      scope: 'read:accounts',
      feedReader: { getFeedPosts: vi.fn(async () => RA.err(clientError({ kind: 'network', status: undefined }))) },
    });
    const forbiddenByProvider = await setup({
      scope: 'read:accounts',
      feedReader: { getFeedPosts: vi.fn(async () => RA.err(clientError({ status: 403 }))) },
    });

    for (const t of [network, forbiddenByProvider]) {
      const response = await t.get(path);
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: 'Bluesky request failed' });
    }
  });
});

const NOT_FOUND = clientError({ status: 400, code: 'InvalidRequest' });

describe('GET /api/iori/v1/bluesky/feeds/info', () => {
  it('feed の uri で一覧の項目の形を返す', async () => {
    const t = await setup({ scope: 'read:accounts' });

    const response = await t.get(`${FEED_INFO}?uri=${encodeURIComponent(FEED_URI)}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      uri: FEED_URI,
      kind: 'feed',
      pinned: false,
      displayName: 'Info',
      creatorHandle: 'gen.bsky.social',
    });
    expect(t.feedReader.getFeedInfo).toHaveBeenCalledExactlyOnceWith(FEED_URI);
  });

  it('list の uri も受け付ける', async () => {
    const t = await setup({ scope: 'read:accounts' });

    const response = await t.get(`${FEED_INFO}?uri=${encodeURIComponent(LIST_URI)}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ uri: LIST_URI, kind: 'list', pinned: false });
  });

  it('uri が無い、または feed と list の URI でないとき 400 にし、Bluesky を呼ばない', async () => {
    const t = await setup({ scope: 'read:accounts' });

    expect((await t.get(FEED_INFO)).status).toBe(400);
    expect((await t.get(`${FEED_INFO}?uri=`)).status).toBe(400);
    expect((await t.get(`${FEED_INFO}?uri=${encodeURIComponent('at://did:plc:a/app.bsky.feed.post/1')}`)).status)
      .toBe(400);
    expect(t.feedReader.getFeedInfo).not.toHaveBeenCalled();
  });

  it('認証なしは 401、read:accounts を満たさない scope は 403 にする', async () => {
    const t = await setup({ scope: 'read:statuses' });
    const path = `${FEED_INFO}?uri=${encodeURIComponent(FEED_URI)}`;

    expect((await t.anonymous(path)).status).toBe(401);
    expect((await t.get(path)).status).toBe(403);
    expect(t.feedReader.getFeedInfo).not.toHaveBeenCalled();
  });

  it('所有者でない利用者を 403 にし、Bluesky を呼ばない', async () => {
    const t = await setup({ scope: 'read:accounts', owner: false });

    const response = await t.get(`${FEED_INFO}?uri=${encodeURIComponent(FEED_URI)}`);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
    expect(t.feedReader.getFeedInfo).not.toHaveBeenCalled();
  });

  it('無効のときは 409 を返す', async () => {
    const t = await setup({ scope: 'read:accounts', enabled: false });

    const response = await t.get(`${FEED_INFO}?uri=${encodeURIComponent(FEED_URI)}`);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Bluesky timeline is disabled' });
  });

  it('見つからないとき 404、Bluesky のログイン失敗とそれ以外の失敗は 502 にする', async () => {
    const path = `${FEED_INFO}?uri=${encodeURIComponent(FEED_URI)}`;
    const missing = await setup({
      scope: 'read:accounts',
      feedReader: { getFeedInfo: vi.fn(async () => RA.err(NOT_FOUND)) },
    });
    const login = await setup({
      scope: 'read:accounts',
      feedReader: { getFeedInfo: vi.fn(async () => RA.err(clientError({ kind: 'auth', status: 401 }))) },
    });
    const failing = await setup({
      scope: 'read:accounts',
      feedReader: { getFeedInfo: vi.fn(async () => RA.err(clientError())) },
    });

    const missingResponse = await missing.get(path);
    expect(missingResponse.status).toBe(404);
    expect(await missingResponse.json()).toEqual({ error: 'Feed not found' });
    const loginResponse = await login.get(path);
    expect(loginResponse.status).toBe(502);
    expect(await loginResponse.json()).toEqual({ error: 'Bluesky login failed' });
    const failingResponse = await failing.get(path);
    expect(failingResponse.status).toBe(502);
    expect(await failingResponse.json()).toEqual({ error: 'Bluesky request failed' });
  });
});

describe('GET /api/iori/v1/bluesky/feeds/resolve', () => {
  const resolve = (url: string) => `${FEED_RESOLVE}?url=${encodeURIComponent(url)}`;

  it('did の URL は Bluesky を呼ばずに at-uri を返す', async () => {
    const t = await setup({ scope: 'read:accounts' });

    const response = await t.get(resolve('https://bsky.app/profile/did:plc:gen/feed/whats-hot'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ uri: FEED_URI });
    expect(t.feedReader.resolveHandle).not.toHaveBeenCalled();
  });

  it('ハンドルの URL は did に解決した at-uri を返す', async () => {
    const t = await setup({
      scope: 'read:accounts',
      feedReader: { resolveHandle: vi.fn(async () => RA.ok('did:plc:own')) },
    });

    const response = await t.get(resolve('https://bsky.app/profile/own.bsky.social/lists/3klist'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ uri: LIST_URI });
    expect(t.feedReader.resolveHandle).toHaveBeenCalledExactlyOnceWith('own.bsky.social');
  });

  it('url が無い、または bsky.app のフィードとリストの URL でないとき 400 にし、Bluesky を呼ばない', async () => {
    const t = await setup({ scope: 'read:accounts' });

    expect((await t.get(FEED_RESOLVE)).status).toBe(400);
    expect((await t.get(resolve('https://example.com/profile/a.bsky.social/feed/x'))).status).toBe(400);
    expect((await t.get(resolve('https://bsky.app/profile/a.bsky.social/post/x'))).status).toBe(400);
    const response = await t.get(resolve('not a url'));
    expect(await response.json()).toEqual({ error: 'Validation failed: url' });
    expect(t.feedReader.resolveHandle).not.toHaveBeenCalled();
  });

  it('認証なしは 401、read:accounts を満たさない scope は 403 にする', async () => {
    const t = await setup({ scope: 'read:statuses' });
    const path = resolve('https://bsky.app/profile/did:plc:gen/feed/a');

    expect((await t.anonymous(path)).status).toBe(401);
    expect((await t.get(path)).status).toBe(403);
  });

  it('所有者でない利用者を 403 にし、Bluesky を呼ばない', async () => {
    const t = await setup({ scope: 'read:accounts', owner: false });

    const response = await t.get(resolve('https://bsky.app/profile/own.bsky.social/feed/a'));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
    expect(t.feedReader.resolveHandle).not.toHaveBeenCalled();
  });

  it('無効のときは 409 を返す', async () => {
    const t = await setup({ scope: 'read:accounts', enabled: false });

    const response = await t.get(resolve('https://bsky.app/profile/did:plc:gen/feed/a'));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Bluesky timeline is disabled' });
  });

  it('ハンドルを解決できないとき 404、Bluesky のログイン失敗とそれ以外の失敗は 502 にする', async () => {
    const path = resolve('https://bsky.app/profile/own.bsky.social/feed/a');
    const missing = await setup({
      scope: 'read:accounts',
      feedReader: { resolveHandle: vi.fn(async () => RA.err(NOT_FOUND)) },
    });
    const login = await setup({
      scope: 'read:accounts',
      feedReader: { resolveHandle: vi.fn(async () => RA.err(clientError({ kind: 'auth', status: 401 }))) },
    });
    const failing = await setup({
      scope: 'read:accounts',
      feedReader: { resolveHandle: vi.fn(async () => RA.err(clientError())) },
    });

    expect((await missing.get(path)).status).toBe(404);
    const loginResponse = await login.get(path);
    expect(loginResponse.status).toBe(502);
    expect(await loginResponse.json()).toEqual({ error: 'Bluesky login failed' });
    const failingResponse = await failing.get(path);
    expect(failingResponse.status).toBe(502);
    expect(await failingResponse.json()).toEqual({ error: 'Bluesky request failed' });
  });
});

describe('GET /api/iori/v1/bluesky/lists/members', () => {
  it('メンバーを検索の actor 一覧と同じ形で返し、uri と cursor を渡す', async () => {
    const t = await setup({ scope: 'read:accounts' });

    const response = await t.get(`${LIST_MEMBERS}?uri=${encodeURIComponent(LIST_URI)}&cursor=abc`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ actors: [member], cursor: 'next-cursor' });
    expect(t.feedReader.getListMembers).toHaveBeenCalledExactlyOnceWith({ uri: LIST_URI, cursor: 'abc' });
  });

  it('続きが無いとき cursor を null にし、cursor を付けなければ undefined で呼ぶ', async () => {
    const t = await setup({
      scope: 'read:accounts',
      feedReader: { getListMembers: vi.fn(async () => RA.ok({ actors: [], cursor: undefined })) },
    });

    const response = await t.get(`${LIST_MEMBERS}?uri=${encodeURIComponent(LIST_URI)}`);

    expect(await response.json()).toEqual({ actors: [], cursor: null });
    expect(t.feedReader.getListMembers).toHaveBeenCalledExactlyOnceWith({ uri: LIST_URI, cursor: undefined });
  });

  it('uri が無い、または list の URI でないとき 400 にし、Bluesky を呼ばない', async () => {
    const t = await setup({ scope: 'read:accounts' });

    expect((await t.get(LIST_MEMBERS)).status).toBe(400);
    expect((await t.get(`${LIST_MEMBERS}?uri=`)).status).toBe(400);
    expect((await t.get(`${LIST_MEMBERS}?uri=${encodeURIComponent(FEED_URI)}`)).status).toBe(400);
    expect((await t.get(`${LIST_MEMBERS}?uri=https%3A%2F%2Fexample.com`)).status).toBe(400);
    expect(t.feedReader.getListMembers).not.toHaveBeenCalled();
  });

  it('認証なしは 401、read:accounts を満たさない scope は 403 にする', async () => {
    const t = await setup({ scope: 'read:statuses' });
    const path = `${LIST_MEMBERS}?uri=${encodeURIComponent(LIST_URI)}`;

    expect((await t.anonymous(path)).status).toBe(401);
    expect((await t.get(path)).status).toBe(403);
    expect(t.feedReader.getListMembers).not.toHaveBeenCalled();
  });

  it('所有者でない利用者を 403 にし、Bluesky を呼ばない', async () => {
    const t = await setup({ scope: 'read:accounts', owner: false });

    const response = await t.get(`${LIST_MEMBERS}?uri=${encodeURIComponent(LIST_URI)}`);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
    expect(t.feedReader.getListMembers).not.toHaveBeenCalled();
  });

  it('無効のときは 409 を返す', async () => {
    const t = await setup({ scope: 'read:accounts', enabled: false });

    const response = await t.get(`${LIST_MEMBERS}?uri=${encodeURIComponent(LIST_URI)}`);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Bluesky timeline is disabled' });
  });

  it('見つからないとき 404、Bluesky のログイン失敗とそれ以外の失敗は 502 にする', async () => {
    const path = `${LIST_MEMBERS}?uri=${encodeURIComponent(LIST_URI)}`;
    const missing = await setup({
      scope: 'read:accounts',
      feedReader: { getListMembers: vi.fn(async () => RA.err(NOT_FOUND)) },
    });
    const login = await setup({
      scope: 'read:accounts',
      feedReader: { getListMembers: vi.fn(async () => RA.err(clientError({ kind: 'auth', status: 401 }))) },
    });
    const failing = await setup({
      scope: 'read:accounts',
      feedReader: { getListMembers: vi.fn(async () => RA.err(clientError())) },
    });

    expect((await missing.get(path)).status).toBe(404);
    const loginResponse = await login.get(path);
    expect(loginResponse.status).toBe(502);
    expect(await loginResponse.json()).toEqual({ error: 'Bluesky login failed' });
    const failingResponse = await failing.get(path);
    expect(failingResponse.status).toBe(502);
    expect(await failingResponse.json()).toEqual({ error: 'Bluesky request failed' });
  });
});

describe.each(
  [
    { name: 'feeds', key: 'feeds', method: 'getActorFeeds', uri: FEED_URI, kind: 'feed' },
    { name: 'lists', key: 'lists', method: 'getActorLists', uri: LIST_URI, kind: 'list' },
  ] as const,
)('GET /api/iori/v1/bluesky/profiles/:actor/$name', ({ name, key, method, uri, kind }) => {
  const path = `${PROFILES}/${DID}/${name}`;

  it('一覧の項目の形で返し、actor と cursor を渡す', async () => {
    const t = await setup({ scope: 'read:accounts' });

    const response = await t.get(`${path}?cursor=abc`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      [key]: [{ uri, kind, pinned: false, displayName: kind === 'feed' ? 'Hot' : 'Friends' }],
      cursor: 'next-cursor',
    });
    expect(t.feedReader[method]).toHaveBeenCalledExactlyOnceWith({ actor: DID, cursor: 'abc' });
  });

  it('続きが無いとき cursor を null にし、cursor を付けなければ undefined で呼ぶ', async () => {
    const t = await setup({
      scope: 'read:accounts',
      feedReader: { [method]: vi.fn(async () => RA.ok({ feeds: [], cursor: undefined })) },
    });

    const response = await t.get(path);

    expect(await response.json()).toEqual({ [key]: [], cursor: null });
    expect(t.feedReader[method]).toHaveBeenCalledExactlyOnceWith({ actor: DID, cursor: undefined });
  });

  it('ハンドルでも引ける', async () => {
    const t = await setup({ scope: 'read:accounts' });

    await t.get(`${PROFILES}/alice.bsky.social/${name}`);

    expect(t.feedReader[method]).toHaveBeenCalledExactlyOnceWith({ actor: 'alice.bsky.social', cursor: undefined });
  });

  it('認証なしは 401、read:accounts を満たさない scope は 403 にする', async () => {
    const t = await setup({ scope: 'read:statuses' });

    expect((await t.anonymous(path)).status).toBe(401);
    expect((await t.get(path)).status).toBe(403);
    expect(t.feedReader[method]).not.toHaveBeenCalled();
  });

  it('所有者でない利用者を 403 にし、Bluesky を呼ばない', async () => {
    const t = await setup({ scope: 'read:accounts', owner: false });

    const response = await t.get(path);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
    expect(t.feedReader[method]).not.toHaveBeenCalled();
  });

  it('無効のときは 409 を返す', async () => {
    const t = await setup({ scope: 'read:accounts', enabled: false });

    const response = await t.get(path);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Bluesky timeline is disabled' });
  });

  it('アカウントが無いとき 404、Bluesky のログイン失敗とそれ以外の失敗は 502 にする', async () => {
    const missing = await setup({
      scope: 'read:accounts',
      feedReader: { [method]: vi.fn(async () => RA.err(NOT_FOUND)) },
    });
    const login = await setup({
      scope: 'read:accounts',
      feedReader: { [method]: vi.fn(async () => RA.err(clientError({ kind: 'auth', status: 401 }))) },
    });
    const failing = await setup({
      scope: 'read:accounts',
      feedReader: { [method]: vi.fn(async () => RA.err(clientError())) },
    });

    const missingResponse = await missing.get(path);
    expect(missingResponse.status).toBe(404);
    expect(await missingResponse.json()).toEqual({ error: 'Profile not found' });
    const loginResponse = await login.get(path);
    expect(loginResponse.status).toBe(502);
    expect(await loginResponse.json()).toEqual({ error: 'Bluesky login failed' });
    const failingResponse = await failing.get(path);
    expect(failingResponse.status).toBe(502);
    expect(await failingResponse.json()).toEqual({ error: 'Bluesky request failed' });
  });
});

describe.each(
  [
    { name: 'follows', method: 'getFollows' },
    { name: 'followers', method: 'getFollowers' },
  ] as const,
)('GET /api/iori/v1/bluesky/profiles/:actor/$name', ({ name, method }) => {
  const path = `${PROFILES}/${DID}/${name}`;

  it('アカウントの一覧と cursor と自分の DID を返し、actor と cursor を渡す', async () => {
    const t = await setup({ scope: 'read:accounts', viewerDid: async () => RA.ok(OWN_DID) });

    const response = await t.get(`${path}?cursor=abc`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ actors: [member], cursor: 'next-cursor', viewerDid: OWN_DID });
    expect(t.reader[method]).toHaveBeenCalledExactlyOnceWith({ actor: DID, cursor: 'abc' });
  });

  it('続きが無いとき cursor を null にし、cursor を付けなければ undefined で呼ぶ', async () => {
    const t = await setup({
      scope: 'read:accounts',
      viewerDid: async () => RA.ok(OWN_DID),
      reader: { [method]: vi.fn(async () => RA.ok({ actors: [], cursor: undefined })) },
    });

    const response = await t.get(path);

    expect(await response.json()).toEqual({ actors: [], cursor: null, viewerDid: OWN_DID });
    expect(t.reader[method]).toHaveBeenCalledExactlyOnceWith({ actor: DID, cursor: undefined });
  });

  it('自分の DID が取れなければ viewerDid を空文字にする', async () => {
    const failed = await setup({
      scope: 'read:accounts',
      viewerDid: async () => RA.err(clientError({ status: 500 })),
    });
    const unset = await setup({ scope: 'read:accounts' });

    expect(await (await failed.get(path)).json()).toMatchObject({ viewerDid: '' });
    expect(await (await unset.get(path)).json()).toMatchObject({ viewerDid: '' });
  });

  it('認証なしは 401、read:accounts を満たさない scope は 403 にする', async () => {
    const t = await setup({ scope: 'read:statuses' });

    expect((await t.anonymous(path)).status).toBe(401);
    expect((await t.get(path)).status).toBe(403);
    expect(t.reader[method]).not.toHaveBeenCalled();
  });

  it('所有者でない利用者を 403 にし、Bluesky を呼ばない', async () => {
    const t = await setup({ scope: 'read:accounts', owner: false });

    const response = await t.get(path);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
    expect(t.reader[method]).not.toHaveBeenCalled();
  });

  it('無効のときは 409 を返す', async () => {
    const t = await setup({ scope: 'read:accounts', enabled: false });

    const response = await t.get(path);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Bluesky timeline is disabled' });
  });

  it('アカウントが無いとき 404、Bluesky のログイン失敗とそれ以外の失敗は 502 にする', async () => {
    const missing = await setup({
      scope: 'read:accounts',
      reader: { [method]: vi.fn(async () => RA.err(NOT_FOUND)) },
    });
    const login = await setup({
      scope: 'read:accounts',
      reader: { [method]: vi.fn(async () => RA.err(clientError({ kind: 'auth', status: 401 }))) },
    });
    const failing = await setup({
      scope: 'read:accounts',
      reader: { [method]: vi.fn(async () => RA.err(clientError())) },
    });

    const missingResponse = await missing.get(path);
    expect(missingResponse.status).toBe(404);
    expect(await missingResponse.json()).toEqual({ error: 'Profile not found' });
    const loginResponse = await login.get(path);
    expect(loginResponse.status).toBe(502);
    expect(await loginResponse.json()).toEqual({ error: 'Bluesky login failed' });
    const failingResponse = await failing.get(path);
    expect(failingResponse.status).toBe(502);
    expect(await failingResponse.json()).toEqual({ error: 'Bluesky request failed' });
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

  it('body の followUri の記録が自分の repo にあれば、createFollow を呼ばずにその uri を返す', async () => {
    const t = await setup({
      scope: 'write:follows',
      client: {
        getRecord: vi.fn(async () => RA.ok({ uri: FOLLOW_URI, cid: 'cid', rkey: '3kfollow', value: { subject: DID } })),
      },
    });

    const response = await t.send('POST', FOLLOWS, { did: DID, followUri: FOLLOW_URI });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ following: true, followUri: FOLLOW_URI });
    expect(t.client.getRecord).toHaveBeenCalledExactlyOnceWith('3kfollow', 'app.bsky.graph.follow');
    expect(t.client.createFollow).not.toHaveBeenCalled();
  });

  it('getProfile が古い viewer.following を返しても、記録が無ければ createFollow を呼ぶ', async () => {
    const t = await setup({
      scope: 'write:follows',
      reader: { getProfile: vi.fn(async () => RA.ok(profile({ viewerFollowingUri: FOLLOW_URI }))) },
    });

    const response = await t.send('POST', FOLLOWS, { did: DID });

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

  it('viewer.following が無くても、followUri をクエリで受け取れば deleteFollow を呼ぶ', async () => {
    const t = await setup({ scope: 'write:follows' });

    const response = await t.send(
      'DELETE',
      `${FOLLOWS}?did=${encodeURIComponent(DID)}&followUri=${encodeURIComponent(FOLLOW_URI)}`,
    );

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

describe('GET /api/iori/v1/bluesky/profile', () => {
  it('認証なしだと 401、read:accounts を満たさない scope だと 403 にする', async () => {
    const t = await setup({ scope: 'read:statuses' });

    expect((await t.anonymous(OWN_PROFILE)).status).toBe(401);
    expect((await t.get(OWN_PROFILE)).status).toBe(403);
    expect(t.reader.getProfile).not.toHaveBeenCalled();
  });

  it('所有者でない利用者を 403 にし、Bluesky を呼ばない', async () => {
    const t = await setup({ scope: 'read:accounts', owner: false });

    const response = await t.get(OWN_PROFILE);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
    expect(t.reader.getProfile).not.toHaveBeenCalled();
  });

  it('無効のときは 409 を返す', async () => {
    const t = await setup({ scope: 'read:accounts', enabled: false });

    const response = await t.get(OWN_PROFILE);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Bluesky timeline is disabled' });
  });

  it('自分の DID のプロフィールから、編集に使う項目だけを返す', async () => {
    const t = await setup({
      scope: 'read:accounts',
      reader: {
        getProfile: vi.fn(async () =>
          RA.ok(profile({ did: OWN_DID, banner: 'https://cdn.example/banner.jpg', viewerFollowingUri: FOLLOW_URI }))
        ),
      },
    });

    const response = await t.get(OWN_PROFILE);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      did: OWN_DID,
      handle: 'alice.bsky.social',
      displayName: 'Alice',
      description: 'hello\nworld',
      avatar: 'https://cdn.example/avatar.jpg',
      banner: 'https://cdn.example/banner.jpg',
    });
    expect(t.reader.getProfile).toHaveBeenCalledExactlyOnceWith(OWN_DID);
  });

  it('Bluesky のログインに失敗したら 502 と Bluesky login failed、それ以外の失敗は Bluesky request failed を返す', async () => {
    const login = await setup({ scope: 'read:accounts', ownDid: async () => RA.err(clientError({ kind: 'auth' })) });
    const failing = await setup({
      scope: 'read:accounts',
      reader: { getProfile: vi.fn(async () => RA.err(clientError())) },
    });

    const loginResponse = await login.get(OWN_PROFILE);
    expect(loginResponse.status).toBe(502);
    expect(await loginResponse.json()).toEqual({ error: 'Bluesky login failed' });
    const failingResponse = await failing.get(OWN_PROFILE);
    expect(failingResponse.status).toBe(502);
    expect(await failingResponse.json()).toEqual({ error: 'Bluesky request failed' });
  });
});

describe('PUT /api/iori/v1/bluesky/profile', () => {
  const form = (fields: Record<string, string | File> = {}): FormData => {
    const data = new FormData();
    data.set('display_name', '新名');
    data.set('description', '新紹介');
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
  };
  const png = (size: number, name = 'a.png', type = 'image/png') => new File([new Uint8Array(size)], name, { type });

  it('認証なしだと 401、Origin が違う Cookie だと 403 にし、Bluesky を呼ばない', async () => {
    const t = await setup({ scope: 'write:accounts' });

    expect((await t.anonymous(OWN_PROFILE, { method: 'PUT', headers: { Origin: ORIGIN }, body: form() })).status)
      .toBe(401);
    const evil = { Cookie: `sessionId=${t.sessionId}`, Origin: 'https://evil.example' };
    expect((await t.put(OWN_PROFILE, form(), evil)).status).toBe(403);
    expect(t.client.putProfileRecord).not.toHaveBeenCalled();
  });

  it('write:accounts を満たさない scope のトークンを 403 にする', async () => {
    const t = await setup({ scope: 'read:accounts' });

    expect((await t.put(OWN_PROFILE, form())).status).toBe(403);
    expect(t.client.putProfileRecord).not.toHaveBeenCalled();
  });

  it('所有者でない利用者を 403 にし、Bluesky を呼ばない', async () => {
    const t = await setup({ scope: 'write:accounts', owner: false });

    expect((await t.put(OWN_PROFILE, form())).status).toBe(403);
    expect(t.client.getProfileRecord).not.toHaveBeenCalled();
    expect(t.client.putProfileRecord).not.toHaveBeenCalled();
  });

  it('無効のときは 409 を返す', async () => {
    const t = await setup({ scope: 'write:accounts', enabled: false });

    expect((await t.put(OWN_PROFILE, form())).status).toBe(409);
  });

  it('入力が不正なら 422 と profile_invalid、理由を返し、Bluesky を呼ばない', async () => {
    const t = await setup({ scope: 'write:accounts' });

    const response = await t.put(OWN_PROFILE, form({ display_name: 'a'.repeat(65) }));

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: '表示名は64文字以内にしてください', code: 'profile_invalid' });
    const gif = await t.put(OWN_PROFILE, form({ avatar: png(3, 'a.gif', 'image/gif') }));
    expect(gif.status).toBe(422);
    expect(await gif.json()).toMatchObject({ code: 'profile_invalid' });
    expect(t.client.getProfileRecord).not.toHaveBeenCalled();
    expect(t.client.putProfileRecord).not.toHaveBeenCalled();
  });

  it('display_name か description が無ければ 422 にし、既存の値を消さない', async () => {
    const t = await setup({ scope: 'write:accounts' });
    const data = new FormData();
    data.set('description', '新紹介');

    const response = await t.put(OWN_PROFILE, data);

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: 'profile_invalid' });
    expect(t.client.putProfileRecord).not.toHaveBeenCalled();
  });

  it('文字列だけなら既存のキーを保持して putProfileRecord を呼び、uri と cid を返す', async () => {
    const t = await setup({ scope: 'write:accounts' });

    const response = await t.put(OWN_PROFILE, form());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ uri: OWN_PROFILE_URI, cid: 'bafynew' });
    expect(t.client.uploadBlob).not.toHaveBeenCalled();
    expect(t.client.putProfileRecord).toHaveBeenCalledExactlyOnceWith(
      {
        $type: 'app.bsky.actor.profile',
        displayName: '新名',
        description: '新紹介',
        pinnedPost: { uri: 'at://p' },
      },
      'bafycurrent',
    );
  });

  it('avatar と banner のファイルを uploadBlob で上げて record に入れる。サイズ 0 のファイルは未指定として扱う', async () => {
    const t = await setup({ scope: 'write:accounts' });

    const response = await t.put(OWN_PROFILE, form({ avatar: png(4), banner: png(0, 'empty.png') }));

    expect(response.status).toBe(200);
    expect(t.client.uploadBlob).toHaveBeenCalledExactlyOnceWith({ bytes: new Uint8Array(4), mimeType: 'image/png' });
    const record = vi.mocked(t.client.putProfileRecord).mock.calls[0]![0];
    expect(record).toMatchObject({ avatar: { $type: 'blob', ref: { $link: 'bafyblob' }, size: 4 } });
    expect(record).not.toHaveProperty('banner');
  });

  it('remove_avatar と remove_banner が \'true\' なら、アバターとバナーを削除する', async () => {
    const t = await setup({
      scope: 'write:accounts',
      client: {
        getProfileRecord: vi.fn(async () =>
          RA.ok({ cid: 'c', value: { avatar: { $type: 'blob' }, banner: { $type: 'blob' }, pinnedPost: 'keep' } })
        ),
      },
    });

    const response = await t.put(OWN_PROFILE, form({ remove_avatar: 'true', remove_banner: 'true' }));

    expect(response.status).toBe(200);
    const record = vi.mocked(t.client.putProfileRecord).mock.calls[0]![0];
    expect(record).toEqual({
      $type: 'app.bsky.actor.profile',
      displayName: '新名',
      description: '新紹介',
      pinnedPost: 'keep',
    });
  });

  it('Bluesky のログインに失敗したら 502 と Bluesky login failed、それ以外の失敗は Bluesky request failed を返す', async () => {
    const login = await setup({
      scope: 'write:accounts',
      client: { putProfileRecord: vi.fn(async () => RA.err(clientError({ kind: 'auth', status: 401 }))) },
    });
    const failing = await setup({
      scope: 'write:accounts',
      client: { uploadBlob: vi.fn(async () => RA.err(clientError())) },
    });

    const loginResponse = await login.put(OWN_PROFILE, form());
    expect(loginResponse.status).toBe(502);
    expect(await loginResponse.json()).toEqual({ error: 'Bluesky login failed' });
    const failingResponse = await failing.put(OWN_PROFILE, form({ avatar: png(2) }));
    expect(failingResponse.status).toBe(502);
    expect(await failingResponse.json()).toEqual({ error: 'Bluesky request failed' });
  });
});
