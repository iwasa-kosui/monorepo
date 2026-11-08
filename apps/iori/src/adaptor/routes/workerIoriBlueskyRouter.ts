import { Hono } from 'hono';

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
import type { CollectBlueskyTimelineUseCase } from '../../useCase/collectBlueskyTimeline.ts';
import { handleInternalError, internalServerError } from './helper/mastodonErrors.ts';
import { requireSameOriginForCookie } from './helper/sameOrigin.ts';
import type { MastodonAuthEnv, MastodonAuthn } from './mastodonAuthn.ts';

export type WorkerIoriBlueskyRouterDeps = Readonly<{
  authn: MastodonAuthn;
  blueskyTimelineItemsResolver: BlueskyTimelineItemsResolver;
  collectBlueskyTimelineUseCase: CollectBlueskyTimelineUseCase | undefined;
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
}>;

export type IoriBlueskyTimelineResponse = Readonly<{
  enabled: boolean;
  items: readonly IoriBlueskyTimelineItemBody[];
  nextBefore: number | null;
  nextBeforeId: string | null;
}>;

export type IoriBlueskyTimelineRefreshResponse = Readonly<{
  pages: number;
  fetched: number;
  saved: number;
  dropped: number;
}>;

const readStatuses = Scope.orThrow('read:statuses');
const writeAccounts = Scope.orThrow('write:accounts');
const integerPattern = /^\d+$/;

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
});

export const createWorkerIoriBlueskyRouter = ({
  authn,
  blueskyTimelineItemsResolver,
  collectBlueskyTimelineUseCase,
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
      const resolved = await blueskyTimelineItemsResolver.resolve({
        limit: limit + 1,
        before: before?.ok ? before.val : undefined,
        beforeId,
      });
      if (!resolved.ok) return c.json(internalServerError, 500);
      const page = resolved.val.slice(0, limit);
      const last = resolved.val.length > limit ? page.at(-1) : undefined;
      return c.json(
        {
          enabled: collectBlueskyTimelineUseCase !== undefined,
          items: page.map(toItemBody),
          nextBefore: last?.indexedAt ?? null,
          nextBeforeId: last?.feedItemId ?? null,
        } satisfies IoriBlueskyTimelineResponse,
      );
    })
    .post(
      '/iori/v1/bluesky/timeline/refresh',
      requireSameOriginForCookie,
      authn.requireUser(writeAccounts),
      async (c) => {
        if (collectBlueskyTimelineUseCase === undefined) {
          return c.json({ error: 'Bluesky timeline is disabled' }, 409);
        }
        const collected = await collectBlueskyTimelineUseCase.run();
        return collected.ok
          ? c.json(collected.val satisfies IoriBlueskyTimelineRefreshResponse)
          : c.json({ error: 'Bluesky request failed' }, 502);
      },
    );
