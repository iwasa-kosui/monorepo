import type { RA } from '@iwasa-kosui/result';
import { type Context, Hono } from 'hono';

import { blueskyFeedKindOf } from '../../domain/blueskyFeed/blueskyFeedUri.ts';
import { Scope } from '../../domain/oauth/scope.ts';
import type { BlueskyClientError } from '../../ports/blueskyClient.ts';
import type { BlueskyFeedNotFound, BlueskySavedFeed } from '../../ports/blueskyFeedReader.ts';
import type { BlueskyProfile, BlueskyProfileNotFound } from '../../ports/blueskyProfileReader.ts';
import type { FollowBlueskyActorUseCase } from '../../useCase/followBlueskyActor.ts';
import type { GetBlueskyFeedInfoUseCase } from '../../useCase/getBlueskyFeedInfo.ts';
import type { GetBlueskyProfileUseCase } from '../../useCase/getBlueskyProfile.ts';
import type { IsDigestOwner } from '../../useCase/isDigestOwner.ts';
import type { ListBlueskyActorFeedsUseCase } from '../../useCase/listBlueskyActorFeeds.ts';
import type { ListBlueskyActorLikesUseCase } from '../../useCase/listBlueskyActorLikes.ts';
import type { ListBlueskyActorListsUseCase } from '../../useCase/listBlueskyActorLists.ts';
import type { ListBlueskyAuthorFeedUseCase } from '../../useCase/listBlueskyAuthorFeed.ts';
import type { ListBlueskyFeedPostsUseCase } from '../../useCase/listBlueskyFeedPosts.ts';
import type { ListBlueskyListMembersUseCase } from '../../useCase/listBlueskyListMembers.ts';
import type { ListBlueskySavedFeedsUseCase } from '../../useCase/listBlueskySavedFeeds.ts';
import type { BlueskyFeedUrlInvalid, ResolveBlueskyFeedUrlUseCase } from '../../useCase/resolveBlueskyFeedUrl.ts';
import type { UnfollowBlueskyActorUseCase } from '../../useCase/unfollowBlueskyActor.ts';
import { handleInternalError } from './helper/mastodonErrors.ts';
import { bodyString, readRequestBody } from './helper/requestBody.ts';
import { requireSameOriginForCookie } from './helper/sameOrigin.ts';
import { getMastodonPrincipal, type MastodonAuthEnv, type MastodonAuthn } from './mastodonAuthn.ts';
import {
  type IoriBlueskyActorBody,
  type IoriBlueskyTimelineItemBody,
  resolveViewerDid,
  toItemBody,
} from './workerIoriBlueskyRouter.ts';

export type WorkerIoriBlueskyProfileRouterDeps = Readonly<{
  authn: MastodonAuthn;
  getBlueskyProfileUseCase: GetBlueskyProfileUseCase | undefined;
  listBlueskyAuthorFeedUseCase: ListBlueskyAuthorFeedUseCase | undefined;
  listBlueskyActorLikesUseCase: ListBlueskyActorLikesUseCase | undefined;
  listBlueskySavedFeedsUseCase: ListBlueskySavedFeedsUseCase | undefined;
  listBlueskyFeedPostsUseCase: ListBlueskyFeedPostsUseCase | undefined;
  getBlueskyFeedInfoUseCase: GetBlueskyFeedInfoUseCase | undefined;
  resolveBlueskyFeedUrlUseCase: ResolveBlueskyFeedUrlUseCase | undefined;
  listBlueskyListMembersUseCase: ListBlueskyListMembersUseCase | undefined;
  listBlueskyActorFeedsUseCase: ListBlueskyActorFeedsUseCase | undefined;
  listBlueskyActorListsUseCase: ListBlueskyActorListsUseCase | undefined;
  followBlueskyActorUseCase: FollowBlueskyActorUseCase | undefined;
  unfollowBlueskyActorUseCase: UnfollowBlueskyActorUseCase | undefined;
  viewerDid?: (() => RA<string, BlueskyClientError>) | undefined;
  isDigestOwner: IsDigestOwner;
}>;

export type IoriBlueskyProfileBody = Readonly<{
  did: string;
  handle: string;
  displayName: string | null;
  description: string | null;
  avatar: string | null;
  banner: string | null;
  followersCount: number;
  followsCount: number;
  postsCount: number;
  following: boolean;
  followedBy: boolean;
  followUri: string | null;
  isSelf: boolean;
}>;

export type IoriBlueskyAuthorFeedResponse = Readonly<{
  items: readonly IoriBlueskyTimelineItemBody[];
  cursor: string | null;
  unavailable: 'blocked' | null;
}>;

export type IoriBlueskyLikedPostsResponse = Readonly<{
  items: readonly IoriBlueskyTimelineItemBody[];
  cursor: string | null;
}>;

export type IoriBlueskySavedFeedsResponse = Readonly<{ feeds: readonly BlueskySavedFeed[] }>;

export type IoriBlueskyFeedPostsResponse = Readonly<{
  items: readonly IoriBlueskyTimelineItemBody[];
  cursor: string | null;
}>;

export type IoriBlueskyFeedInfoResponse = BlueskySavedFeed;

export type IoriBlueskyFeedResolveResponse = Readonly<{ uri: string }>;

export type IoriBlueskyListMembersResponse = Readonly<{
  actors: readonly IoriBlueskyActorBody[];
  cursor: string | null;
}>;

export type IoriBlueskyActorFeedsResponse = Readonly<{
  feeds: readonly BlueskySavedFeed[];
  cursor: string | null;
}>;

export type IoriBlueskyActorListsResponse = Readonly<{
  lists: readonly BlueskySavedFeed[];
  cursor: string | null;
}>;

export type IoriBlueskyFollowResponse = Readonly<{ following: true; followUri: string }>;

export type IoriBlueskyUnfollowResponse = Readonly<{ following: false }>;

const readAccounts = Scope.orThrow('read:accounts');
const writeFollows = Scope.orThrow('write:follows');
const forbidden = { error: 'Forbidden' } as const;
const disabled = { error: 'Bluesky timeline is disabled' } as const;

const feedProviderFailed = { error: 'Feed provider failed' } as const;

const isFeedProviderFailure = (error: BlueskyClientError | BlueskyFeedNotFound): boolean =>
  error.type === 'BlueskyClientError' && error.kind === 'http' && error.status !== undefined
  && (error.status >= 500 || error.status === 400 || error.status === 401);

const toProfileBody = (profile: BlueskyProfile, isSelf: boolean): IoriBlueskyProfileBody => ({
  did: profile.did,
  handle: profile.handle,
  displayName: profile.displayName,
  description: profile.description,
  avatar: profile.avatar,
  banner: profile.banner,
  followersCount: profile.followersCount,
  followsCount: profile.followsCount,
  postsCount: profile.postsCount,
  following: profile.viewerFollowingUri !== undefined,
  followedBy: profile.viewerFollowedBy,
  followUri: profile.viewerFollowingUri ?? null,
  isSelf,
});

const failure = (
  c: Context,
  error: BlueskyClientError | BlueskyProfileNotFound | BlueskyFeedNotFound | BlueskyFeedUrlInvalid,
) => {
  if (error.type === 'BlueskyProfileNotFound') return c.json({ error: 'Profile not found' }, 404);
  if (error.type === 'BlueskyFeedNotFound') return c.json({ error: 'Feed not found' }, 404);
  if (error.type === 'BlueskyFeedUrlInvalid') return c.json({ error: 'Validation failed: url' }, 400);
  return c.json({ error: error.kind === 'auth' ? 'Bluesky login failed' : 'Bluesky request failed' }, 502);
};

const isDid = (value: string | undefined): value is string => value !== undefined && value.startsWith('did:');

export const createWorkerIoriBlueskyProfileRouter = ({
  authn,
  getBlueskyProfileUseCase,
  listBlueskyAuthorFeedUseCase,
  listBlueskyActorLikesUseCase,
  listBlueskySavedFeedsUseCase,
  listBlueskyFeedPostsUseCase,
  getBlueskyFeedInfoUseCase,
  resolveBlueskyFeedUrlUseCase,
  listBlueskyListMembersUseCase,
  listBlueskyActorFeedsUseCase,
  listBlueskyActorListsUseCase,
  followBlueskyActorUseCase,
  unfollowBlueskyActorUseCase,
  viewerDid,
  isDigestOwner,
}: WorkerIoriBlueskyProfileRouterDeps): Hono<MastodonAuthEnv> =>
  new Hono<MastodonAuthEnv>()
    .onError(handleInternalError)
    .get('/iori/v1/bluesky/profiles/:actor', authn.requireUser(readAccounts), async (c) => {
      if (!await isDigestOwner(getMastodonPrincipal(c)?.userId ?? undefined)) return c.json(forbidden, 403);
      if (getBlueskyProfileUseCase === undefined) return c.json(disabled, 409);
      const profile = await getBlueskyProfileUseCase.run({ actor: c.req.param('actor') });
      if (!profile.ok) return failure(c, profile.err);
      const viewer = viewerDid === undefined ? undefined : await viewerDid();
      return c.json(
        toProfileBody(
          profile.val,
          viewer?.ok === true && viewer.val === profile.val.did,
        ) satisfies IoriBlueskyProfileBody,
      );
    })
    .get('/iori/v1/bluesky/profiles/:actor/feed', authn.requireUser(readAccounts), async (c) => {
      if (!await isDigestOwner(getMastodonPrincipal(c)?.userId ?? undefined)) return c.json(forbidden, 403);
      if (listBlueskyAuthorFeedUseCase === undefined) return c.json(disabled, 409);
      const page = await listBlueskyAuthorFeedUseCase.run({
        actor: c.req.param('actor'),
        cursor: c.req.query('cursor') || undefined,
      });
      if (!page.ok) return failure(c, page.err);
      const viewer = await resolveViewerDid(viewerDid);
      return c.json(
        {
          items: page.val.items.map((item) => toItemBody(item, viewer)),
          cursor: page.val.cursor ?? null,
          unavailable: page.val.unavailable,
        } satisfies IoriBlueskyAuthorFeedResponse,
      );
    })
    .get('/iori/v1/bluesky/liked-posts', authn.requireUser(readAccounts), async (c) => {
      if (!await isDigestOwner(getMastodonPrincipal(c)?.userId ?? undefined)) return c.json(forbidden, 403);
      if (listBlueskyActorLikesUseCase === undefined) return c.json(disabled, 409);
      const page = await listBlueskyActorLikesUseCase.run({ cursor: c.req.query('cursor') || undefined });
      if (!page.ok) return failure(c, page.err);
      const viewer = await resolveViewerDid(viewerDid);
      return c.json(
        {
          items: page.val.items.map((item) => toItemBody(item, viewer)),
          cursor: page.val.cursor ?? null,
        } satisfies IoriBlueskyLikedPostsResponse,
      );
    })
    .get('/iori/v1/bluesky/feeds', authn.requireUser(readAccounts), async (c) => {
      if (!await isDigestOwner(getMastodonPrincipal(c)?.userId ?? undefined)) return c.json(forbidden, 403);
      if (listBlueskySavedFeedsUseCase === undefined) return c.json(disabled, 409);
      const saved = await listBlueskySavedFeedsUseCase.run();
      if (!saved.ok) return failure(c, saved.err);
      return c.json({ feeds: saved.val.feeds } satisfies IoriBlueskySavedFeedsResponse);
    })
    .get('/iori/v1/bluesky/feeds/posts', authn.requireUser(readAccounts), async (c) => {
      if (!await isDigestOwner(getMastodonPrincipal(c)?.userId ?? undefined)) return c.json(forbidden, 403);
      if (listBlueskyFeedPostsUseCase === undefined) return c.json(disabled, 409);
      const uri = c.req.query('uri');
      if (uri === undefined || blueskyFeedKindOf(uri) === undefined) {
        return c.json({ error: 'Validation failed: uri' }, 400);
      }
      const page = await listBlueskyFeedPostsUseCase.run({ uri, cursor: c.req.query('cursor') || undefined });
      if (!page.ok) return isFeedProviderFailure(page.err) ? c.json(feedProviderFailed, 502) : failure(c, page.err);
      const viewer = await resolveViewerDid(viewerDid);
      return c.json(
        {
          items: page.val.items.map((item) => toItemBody(item, viewer)),
          cursor: page.val.cursor ?? null,
        } satisfies IoriBlueskyFeedPostsResponse,
      );
    })
    .get('/iori/v1/bluesky/feeds/info', authn.requireUser(readAccounts), async (c) => {
      if (!await isDigestOwner(getMastodonPrincipal(c)?.userId ?? undefined)) return c.json(forbidden, 403);
      if (getBlueskyFeedInfoUseCase === undefined) return c.json(disabled, 409);
      const uri = c.req.query('uri');
      if (uri === undefined || blueskyFeedKindOf(uri) === undefined) {
        return c.json({ error: 'Validation failed: uri' }, 400);
      }
      const info = await getBlueskyFeedInfoUseCase.run({ uri });
      return info.ok ? c.json(info.val satisfies IoriBlueskyFeedInfoResponse) : failure(c, info.err);
    })
    .get('/iori/v1/bluesky/feeds/resolve', authn.requireUser(readAccounts), async (c) => {
      if (!await isDigestOwner(getMastodonPrincipal(c)?.userId ?? undefined)) return c.json(forbidden, 403);
      if (resolveBlueskyFeedUrlUseCase === undefined) return c.json(disabled, 409);
      const resolved = await resolveBlueskyFeedUrlUseCase.run({ url: c.req.query('url') ?? '' });
      return resolved.ok
        ? c.json({ uri: resolved.val.uri } satisfies IoriBlueskyFeedResolveResponse)
        : failure(c, resolved.err);
    })
    .get('/iori/v1/bluesky/lists/members', authn.requireUser(readAccounts), async (c) => {
      if (!await isDigestOwner(getMastodonPrincipal(c)?.userId ?? undefined)) return c.json(forbidden, 403);
      if (listBlueskyListMembersUseCase === undefined) return c.json(disabled, 409);
      const uri = c.req.query('uri');
      if (uri === undefined || blueskyFeedKindOf(uri) !== 'list') {
        return c.json({ error: 'Validation failed: uri' }, 400);
      }
      const page = await listBlueskyListMembersUseCase.run({ uri, cursor: c.req.query('cursor') || undefined });
      if (!page.ok) return failure(c, page.err);
      return c.json(
        { actors: page.val.actors, cursor: page.val.cursor ?? null } satisfies IoriBlueskyListMembersResponse,
      );
    })
    .get('/iori/v1/bluesky/profiles/:actor/feeds', authn.requireUser(readAccounts), async (c) => {
      if (!await isDigestOwner(getMastodonPrincipal(c)?.userId ?? undefined)) return c.json(forbidden, 403);
      if (listBlueskyActorFeedsUseCase === undefined) return c.json(disabled, 409);
      const page = await listBlueskyActorFeedsUseCase.run({
        actor: c.req.param('actor'),
        cursor: c.req.query('cursor') || undefined,
      });
      if (!page.ok) return failure(c, page.err);
      return c.json({ feeds: page.val.feeds, cursor: page.val.cursor ?? null } satisfies IoriBlueskyActorFeedsResponse);
    })
    .get('/iori/v1/bluesky/profiles/:actor/lists', authn.requireUser(readAccounts), async (c) => {
      if (!await isDigestOwner(getMastodonPrincipal(c)?.userId ?? undefined)) return c.json(forbidden, 403);
      if (listBlueskyActorListsUseCase === undefined) return c.json(disabled, 409);
      const page = await listBlueskyActorListsUseCase.run({
        actor: c.req.param('actor'),
        cursor: c.req.query('cursor') || undefined,
      });
      if (!page.ok) return failure(c, page.err);
      return c.json({ lists: page.val.feeds, cursor: page.val.cursor ?? null } satisfies IoriBlueskyActorListsResponse);
    })
    .post(
      '/iori/v1/bluesky/follows',
      requireSameOriginForCookie,
      authn.requireUser(writeFollows),
      async (c) => {
        if (!await isDigestOwner(getMastodonPrincipal(c)?.userId ?? undefined)) return c.json(forbidden, 403);
        if (followBlueskyActorUseCase === undefined) return c.json(disabled, 409);
        const body = await readRequestBody(c);
        const did = bodyString(body, 'did');
        if (!isDid(did)) return c.json({ error: 'Validation failed: did' }, 400);
        const followed = await followBlueskyActorUseCase.run({
          did,
          followUri: bodyString(body, 'followUri') || undefined,
        });
        return followed.ok ? c.json(followed.val satisfies IoriBlueskyFollowResponse) : failure(c, followed.err);
      },
    )
    .delete(
      '/iori/v1/bluesky/follows',
      requireSameOriginForCookie,
      authn.requireUser(writeFollows),
      async (c) => {
        if (!await isDigestOwner(getMastodonPrincipal(c)?.userId ?? undefined)) return c.json(forbidden, 403);
        if (unfollowBlueskyActorUseCase === undefined) return c.json(disabled, 409);
        const did = c.req.query('did');
        if (!isDid(did)) return c.json({ error: 'Validation failed: did' }, 400);
        const unfollowed = await unfollowBlueskyActorUseCase.run({
          did,
          followUri: c.req.query('followUri') || undefined,
        });
        return unfollowed.ok
          ? c.json(unfollowed.val satisfies IoriBlueskyUnfollowResponse)
          : failure(c, unfollowed.err);
      },
    );
