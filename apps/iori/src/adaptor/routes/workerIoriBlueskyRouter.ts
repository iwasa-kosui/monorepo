import { type Context, Hono } from 'hono';

import type { BlueskyLoginFailureResolver } from '../../domain/blueskyCrosspost/blueskyCrosspost.ts';
import {
  type BlueskyConnectionStatus,
  type BlueskySyncStatusResolver,
  toBlueskyConnectionStatus,
} from '../../domain/blueskySyncStatus/blueskySyncStatus.ts';
import type { BlueskyLikeTargetNotFound } from '../../domain/blueskyTimeline/blueskyLike.ts';
import type { BlueskyRepostTargetNotFound } from '../../domain/blueskyTimeline/blueskyRepost.ts';
import {
  BLUESKY_TIMELINE_DEFAULT_LIMIT,
  BLUESKY_TIMELINE_MAX_LIMIT,
  type BlueskyTimelineEmbed,
  type BlueskyTimelineFacet,
  type BlueskyTimelineItem,
  type BlueskyTimelineItemsResolver,
} from '../../domain/blueskyTimeline/blueskyTimelineItem.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { Scope } from '../../domain/oauth/scope.ts';
import type { BlueskyClientError } from '../../ports/blueskyClient.ts';
import type { IsDigestOwner } from '../../useCase/isDigestOwner.ts';
import type { LikeBlueskyPostUseCase } from '../../useCase/likeBlueskyPost.ts';
import type { RepostBlueskyPostUseCase } from '../../useCase/repostBlueskyPost.ts';
import type { UndoRepostBlueskyPostUseCase } from '../../useCase/undoRepostBlueskyPost.ts';
import type { UnlikeBlueskyPostUseCase } from '../../useCase/unlikeBlueskyPost.ts';
import { BLUESKY_LOGIN_RETRY_COOLDOWN_MS } from '../bluesky/blueskyClient.ts';
import { handleInternalError, internalServerError } from './helper/mastodonErrors.ts';
import { bodyString, readRequestBody } from './helper/requestBody.ts';
import { requireSameOriginForCookie } from './helper/sameOrigin.ts';
import { getMastodonPrincipal, type MastodonAuthEnv, type MastodonAuthn } from './mastodonAuthn.ts';

export type WorkerIoriBlueskyRouterDeps = Readonly<{
  authn: MastodonAuthn;
  blueskyTimelineItemsResolver: BlueskyTimelineItemsResolver;
  blueskyTimelineEnabled: boolean;
  blueskySyncStatusResolver: BlueskySyncStatusResolver;
  blueskyLoginFailureResolver: BlueskyLoginFailureResolver;
  now?: () => Instant;
  likeBlueskyPostUseCase: LikeBlueskyPostUseCase | undefined;
  unlikeBlueskyPostUseCase: UnlikeBlueskyPostUseCase | undefined;
  repostBlueskyPostUseCase: RepostBlueskyPostUseCase | undefined;
  undoRepostBlueskyPostUseCase: UndoRepostBlueskyPostUseCase | undefined;
  isDigestOwner: IsDigestOwner;
}>;

export type IoriBlueskyTimelineItemBody = Readonly<{
  feedItemId: string;
  uri: string;
  cid: string;
  authorDid: string;
  authorHandle: string;
  authorDisplayName: string | null;
  authorAvatar: string | null;
  text: string;
  facets: readonly BlueskyTimelineFacet[];
  embed: BlueskyTimelineEmbed | null;
  replyParentUri: string | null;
  replyParentAuthorHandle: string | null;
  repostedByDid: string | null;
  repostedByHandle: string | null;
  postedAt: number;
  indexedAt: number;
  liked: boolean;
  reposted: boolean;
}>;

export type IoriBlueskyTimelineResponse = Readonly<{
  enabled: boolean;
  items: readonly IoriBlueskyTimelineItemBody[];
  nextBefore: number | null;
  nextBeforeId: string | null;
}>;

type IsoInstant = string | null;

export type IoriBlueskyScopeStatusBody = Readonly<{
  state: BlueskyConnectionStatus['timeline']['state'];
  lastSucceededAt: IsoInstant;
  lastFailedAt: IsoInstant;
  failureKind: BlueskyConnectionStatus['timeline']['failureKind'];
  failureCode: string | null;
}>;

export type IoriBlueskyStatusResponse =
  | Readonly<{ enabled: false }>
  | Readonly<{
    enabled: true;
    timeline: IoriBlueskyScopeStatusBody;
    notifications: IoriBlueskyScopeStatusBody;
    login: Readonly<{ state: 'ok' }> | Readonly<{ state: 'waiting'; failedAt: string; retryAt: string }>;
  }>;

export type IoriBlueskyLikeResponse = Readonly<{ liked: boolean }>;

export type IoriBlueskyRepostResponse = Readonly<{ reposted: boolean }>;

const readStatuses = Scope.orThrow('read:statuses');
const writeFavourites = Scope.orThrow('write:favourites');
const writeStatuses = Scope.orThrow('write:statuses');
const integerPattern = /^\d+$/;
const forbidden = { error: 'Forbidden' } as const;

const toItemBody = (item: BlueskyTimelineItem): IoriBlueskyTimelineItemBody => ({
  feedItemId: item.feedItemId,
  uri: item.uri,
  cid: item.cid,
  authorDid: item.authorDid,
  authorHandle: item.authorHandle,
  authorDisplayName: item.authorDisplayName,
  authorAvatar: item.authorAvatar,
  text: item.text,
  facets: item.facets,
  embed: item.embed,
  replyParentUri: item.replyParentUri,
  replyParentAuthorHandle: item.replyParentAuthorHandle,
  repostedByDid: item.repostedByDid,
  repostedByHandle: item.repostedByHandle,
  postedAt: item.postedAt,
  indexedAt: item.indexedAt,
  liked: item.liked,
  reposted: item.reposted,
});

const iso = (at: number | null): IsoInstant => at === null ? null : new Date(at).toISOString();

const toScopeBody = (scope: BlueskyConnectionStatus['timeline']): IoriBlueskyScopeStatusBody => ({
  state: scope.state,
  lastSucceededAt: iso(scope.lastSucceededAt),
  lastFailedAt: iso(scope.lastFailedAt),
  failureKind: scope.failureKind,
  failureCode: scope.failureCode,
});

export const clientFailure = (c: Context, error: BlueskyClientError) =>
  c.json({ error: error.kind === 'auth' ? 'Bluesky login failed' : 'Bluesky request failed' }, 502);

const likeFailure = (c: Context, error: BlueskyClientError | BlueskyLikeTargetNotFound) =>
  error.type === 'BlueskyLikeTargetNotFound'
    ? c.json({ error: 'Record not found' }, 404)
    : clientFailure(c, error);

const repostFailure = (c: Context, error: BlueskyClientError | BlueskyRepostTargetNotFound) =>
  error.type === 'BlueskyRepostTargetNotFound'
    ? c.json({ error: 'Record not found' }, 404)
    : clientFailure(c, error);

export const createWorkerIoriBlueskyRouter = ({
  authn,
  blueskyTimelineItemsResolver,
  blueskyTimelineEnabled,
  blueskySyncStatusResolver,
  blueskyLoginFailureResolver,
  now = Instant.now,
  likeBlueskyPostUseCase,
  unlikeBlueskyPostUseCase,
  repostBlueskyPostUseCase,
  undoRepostBlueskyPostUseCase,
  isDigestOwner,
}: WorkerIoriBlueskyRouterDeps): Hono<MastodonAuthEnv> =>
  new Hono<MastodonAuthEnv>()
    .onError(handleInternalError)
    .get('/iori/v1/bluesky/timeline', authn.requireUser(readStatuses), async (c) => {
      const limitParam = c.req.query('limit');
      if (limitParam !== undefined && (!integerPattern.test(limitParam) || Number(limitParam) < 1)) {
        return c.json({ error: 'Validation failed: limit' }, 400);
      }
      const limit = limitParam === undefined
        ? BLUESKY_TIMELINE_DEFAULT_LIMIT
        : Math.min(Number(limitParam), BLUESKY_TIMELINE_MAX_LIMIT);
      const beforeParam = c.req.query('before');
      const before = beforeParam === undefined || !integerPattern.test(beforeParam)
        ? undefined
        : Instant.of(Number(beforeParam));
      if (beforeParam !== undefined && (before === undefined || !before.ok)) {
        return c.json({ error: 'Validation failed: before' }, 400);
      }
      const beforeId = c.req.query('beforeId');
      if (beforeId !== undefined && (beforeId === '' || before === undefined)) {
        return c.json({ error: 'Validation failed: beforeId' }, 400);
      }
      const scope = c.req.query('scope');
      if (scope !== undefined && scope !== 'home') {
        return c.json({ error: 'Validation failed: scope' }, 400);
      }
      const enabled = blueskyTimelineEnabled;
      const isOwner = await isDigestOwner(getMastodonPrincipal(c)?.userId ?? undefined);
      if (scope === undefined && !isOwner) return c.json(forbidden, 403);
      if (scope === 'home' && !isOwner) {
        return c.json(
          { enabled, items: [], nextBefore: null, nextBeforeId: null } satisfies IoriBlueskyTimelineResponse,
        );
      }
      const resolved = await blueskyTimelineItemsResolver.resolve({
        limit: limit + 1,
        before: before?.ok ? before.val : undefined,
        beforeId,
        excludeCrossposted: scope === 'home',
      });
      if (!resolved.ok) return c.json(internalServerError, 500);
      const page = resolved.val.slice(0, limit);
      const last = resolved.val.length > limit ? page.at(-1) : undefined;
      return c.json(
        {
          enabled,
          items: page.map(toItemBody),
          nextBefore: last?.indexedAt ?? null,
          nextBeforeId: last?.feedItemId ?? null,
        } satisfies IoriBlueskyTimelineResponse,
      );
    })
    .get('/iori/v1/bluesky/status', authn.requireUser(readStatuses), async (c) => {
      const isOwner = await isDigestOwner(getMastodonPrincipal(c)?.userId ?? undefined);
      if (!blueskyTimelineEnabled || !isOwner) {
        return c.json({ enabled: false } satisfies IoriBlueskyStatusResponse);
      }
      const [records, loginFailedAt] = await Promise.all([
        blueskySyncStatusResolver.resolve(),
        blueskyLoginFailureResolver.resolve(),
      ]);
      if (!records.ok || !loginFailedAt.ok) return c.json(internalServerError, 500);
      const status = toBlueskyConnectionStatus({
        records: records.val,
        loginFailedAt: loginFailedAt.val,
        now: now(),
        loginCooldownMs: BLUESKY_LOGIN_RETRY_COOLDOWN_MS,
      });
      return c.json(
        {
          enabled: true,
          timeline: toScopeBody(status.timeline),
          notifications: toScopeBody(status.notifications),
          login: status.login.state === 'waiting'
            ? {
              state: 'waiting',
              failedAt: new Date(status.login.failedAt).toISOString(),
              retryAt: new Date(status.login.retryAt).toISOString(),
            }
            : { state: 'ok' },
        } satisfies IoriBlueskyStatusResponse,
      );
    })
    .post(
      '/iori/v1/bluesky/likes',
      requireSameOriginForCookie,
      authn.requireUser(writeFavourites),
      async (c) => {
        if (!await isDigestOwner(getMastodonPrincipal(c)?.userId ?? undefined)) {
          return c.json(forbidden, 403);
        }
        if (likeBlueskyPostUseCase === undefined) {
          return c.json({ error: 'Bluesky timeline is disabled' }, 409);
        }
        const feedItemId = bodyString(await readRequestBody(c), 'feedItemId');
        if (feedItemId === undefined || feedItemId === '') {
          return c.json({ error: 'Validation failed: feedItemId' }, 400);
        }
        const liked = await likeBlueskyPostUseCase.run({ feedItemId });
        return liked.ok
          ? c.json(liked.val satisfies IoriBlueskyLikeResponse)
          : likeFailure(c, liked.err);
      },
    )
    .delete(
      '/iori/v1/bluesky/likes',
      requireSameOriginForCookie,
      authn.requireUser(writeFavourites),
      async (c) => {
        if (!await isDigestOwner(getMastodonPrincipal(c)?.userId ?? undefined)) {
          return c.json(forbidden, 403);
        }
        if (unlikeBlueskyPostUseCase === undefined) {
          return c.json({ error: 'Bluesky timeline is disabled' }, 409);
        }
        const feedItemId = c.req.query('feedItemId');
        if (feedItemId === undefined || feedItemId === '') {
          return c.json({ error: 'Validation failed: feedItemId' }, 400);
        }
        const unliked = await unlikeBlueskyPostUseCase.run({ feedItemId });
        return unliked.ok
          ? c.json(unliked.val satisfies IoriBlueskyLikeResponse)
          : likeFailure(c, unliked.err);
      },
    )
    .post(
      '/iori/v1/bluesky/reposts',
      requireSameOriginForCookie,
      authn.requireUser(writeStatuses),
      async (c) => {
        if (!await isDigestOwner(getMastodonPrincipal(c)?.userId ?? undefined)) {
          return c.json(forbidden, 403);
        }
        if (repostBlueskyPostUseCase === undefined) {
          return c.json({ error: 'Bluesky timeline is disabled' }, 409);
        }
        const feedItemId = bodyString(await readRequestBody(c), 'feedItemId');
        if (feedItemId === undefined || feedItemId === '') {
          return c.json({ error: 'Validation failed: feedItemId' }, 400);
        }
        const reposted = await repostBlueskyPostUseCase.run({ feedItemId });
        return reposted.ok
          ? c.json(reposted.val satisfies IoriBlueskyRepostResponse)
          : repostFailure(c, reposted.err);
      },
    )
    .delete(
      '/iori/v1/bluesky/reposts',
      requireSameOriginForCookie,
      authn.requireUser(writeStatuses),
      async (c) => {
        if (!await isDigestOwner(getMastodonPrincipal(c)?.userId ?? undefined)) {
          return c.json(forbidden, 403);
        }
        if (undoRepostBlueskyPostUseCase === undefined) {
          return c.json({ error: 'Bluesky timeline is disabled' }, 409);
        }
        const feedItemId = c.req.query('feedItemId');
        if (feedItemId === undefined || feedItemId === '') {
          return c.json({ error: 'Validation failed: feedItemId' }, 400);
        }
        const unreposted = await undoRepostBlueskyPostUseCase.run({ feedItemId });
        return unreposted.ok
          ? c.json(unreposted.val satisfies IoriBlueskyRepostResponse)
          : repostFailure(c, unreposted.err);
      },
    );
