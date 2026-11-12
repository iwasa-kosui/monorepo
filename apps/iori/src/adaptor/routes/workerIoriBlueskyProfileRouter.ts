import type { RA } from '@iwasa-kosui/result';
import { type Context, Hono } from 'hono';

import { Scope } from '../../domain/oauth/scope.ts';
import type { BlueskyClientError } from '../../ports/blueskyClient.ts';
import type { BlueskyProfile, BlueskyProfileNotFound } from '../../ports/blueskyProfileReader.ts';
import type { FollowBlueskyActorUseCase } from '../../useCase/followBlueskyActor.ts';
import type { GetBlueskyProfileUseCase } from '../../useCase/getBlueskyProfile.ts';
import type { IsDigestOwner } from '../../useCase/isDigestOwner.ts';
import type { ListBlueskyActorLikesUseCase } from '../../useCase/listBlueskyActorLikes.ts';
import type { ListBlueskyAuthorFeedUseCase } from '../../useCase/listBlueskyAuthorFeed.ts';
import type { UnfollowBlueskyActorUseCase } from '../../useCase/unfollowBlueskyActor.ts';
import { handleInternalError } from './helper/mastodonErrors.ts';
import { bodyString, readRequestBody } from './helper/requestBody.ts';
import { requireSameOriginForCookie } from './helper/sameOrigin.ts';
import { getMastodonPrincipal, type MastodonAuthEnv, type MastodonAuthn } from './mastodonAuthn.ts';
import { type IoriBlueskyTimelineItemBody, resolveViewerDid, toItemBody } from './workerIoriBlueskyRouter.ts';

export type WorkerIoriBlueskyProfileRouterDeps = Readonly<{
  authn: MastodonAuthn;
  getBlueskyProfileUseCase: GetBlueskyProfileUseCase | undefined;
  listBlueskyAuthorFeedUseCase: ListBlueskyAuthorFeedUseCase | undefined;
  listBlueskyActorLikesUseCase: ListBlueskyActorLikesUseCase | undefined;
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

export type IoriBlueskyFollowResponse = Readonly<{ following: true; followUri: string }>;

export type IoriBlueskyUnfollowResponse = Readonly<{ following: false }>;

const readAccounts = Scope.orThrow('read:accounts');
const writeFollows = Scope.orThrow('write:follows');
const forbidden = { error: 'Forbidden' } as const;
const disabled = { error: 'Bluesky timeline is disabled' } as const;

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

const failure = (c: Context, error: BlueskyClientError | BlueskyProfileNotFound) => {
  if (error.type === 'BlueskyProfileNotFound') return c.json({ error: 'Profile not found' }, 404);
  return c.json({ error: error.kind === 'auth' ? 'Bluesky login failed' : 'Bluesky request failed' }, 502);
};

const isDid = (value: string | undefined): value is string => value !== undefined && value.startsWith('did:');

export const createWorkerIoriBlueskyProfileRouter = ({
  authn,
  getBlueskyProfileUseCase,
  listBlueskyAuthorFeedUseCase,
  listBlueskyActorLikesUseCase,
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
      return page.ok
        ? c.json(
          {
            items: page.val.items.map(toItemBody),
            cursor: page.val.cursor ?? null,
          } satisfies IoriBlueskyLikedPostsResponse,
        )
        : failure(c, page.err);
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
