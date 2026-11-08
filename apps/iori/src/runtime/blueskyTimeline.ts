import { createBlueskyClient } from '../adaptor/bluesky/blueskyClient.ts';
import { createBlueskyTimelineFetcher } from '../adaptor/bluesky/blueskyTimelineFetcher.ts';
import {
  createD1BlueskySessionResolver,
  createD1BlueskySessionSavedStore,
} from '../adaptor/d1/blueskyCrosspost/blueskySessionStore.ts';
import { createD1BlueskyTimelineItemsExpiredStore } from '../adaptor/d1/blueskyTimeline/blueskyTimelineItemsExpiredStore.ts';
import { createD1BlueskyTimelineItemsResolver } from '../adaptor/d1/blueskyTimeline/blueskyTimelineItemsResolver.ts';
import { createD1BlueskyTimelineItemsSavedStore } from '../adaptor/d1/blueskyTimeline/blueskyTimelineItemsSavedStore.ts';
import { createD1Db, type IoriD1Db } from '../adaptor/d1/client.ts';
import { createD1UserResolverByUsername } from '../adaptor/d1/user/userResolverByUsername.ts';
import type { BlueskyTimelineItemsResolver } from '../domain/blueskyTimeline/blueskyTimelineItem.ts';
import { Instant } from '../domain/instant/instant.ts';
import { CollectBlueskyTimelineUseCase } from '../useCase/collectBlueskyTimeline.ts';
import { IsDigestOwner } from '../useCase/isDigestOwner.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';
import { type BlueskyCredentials, resolveBlueskyCredentials } from './blueskyCrosspost.ts';

export const BLUESKY_TIMELINE_ENABLED_VALUE = 'enabled';

export const resolveBlueskyTimelineConfig = (
  env: Pick<IoriWorkerEnv, 'IORI_BLUESKY_TIMELINE' | 'BLUESKY_IDENTIFIER' | 'BLUESKY_APP_PASSWORD'>,
): BlueskyCredentials | undefined =>
  env.IORI_BLUESKY_TIMELINE === BLUESKY_TIMELINE_ENABLED_VALUE ? resolveBlueskyCredentials(env) : undefined;

export type BlueskyTimelineRuntimePorts = Readonly<{
  blueskyTimelineItemsResolver: BlueskyTimelineItemsResolver;
  collectBlueskyTimelineUseCase: CollectBlueskyTimelineUseCase | undefined;
  isDigestOwner: IsDigestOwner;
}>;

export const createCollectBlueskyTimelineUseCase = (
  env: IoriWorkerEnv,
  deps: Readonly<{ db?: IoriD1Db; fetch?: typeof fetch }> = {},
): CollectBlueskyTimelineUseCase | undefined => {
  const config = resolveBlueskyTimelineConfig(env);
  if (config === undefined) return undefined;
  const db = deps.db ?? createD1Db(env.DB);
  const now = Instant.now;
  return CollectBlueskyTimelineUseCase.create({
    fetcher: createBlueskyTimelineFetcher({
      client: createBlueskyClient({
        identifier: config.identifier,
        appPassword: config.appPassword,
        sessionResolver: createD1BlueskySessionResolver(db),
        sessionStore: createD1BlueskySessionSavedStore(db),
        fetch: deps.fetch,
        now,
      }),
      now,
    }),
    savedStore: createD1BlueskyTimelineItemsSavedStore(db),
    expiredStore: createD1BlueskyTimelineItemsExpiredStore(db),
    now,
  });
};

export const createBlueskyTimelineRuntimePorts = (
  env: IoriWorkerEnv,
  db: IoriD1Db,
  deps: Readonly<{ fetch?: typeof fetch }> = {},
): BlueskyTimelineRuntimePorts => ({
  blueskyTimelineItemsResolver: createD1BlueskyTimelineItemsResolver(db),
  collectBlueskyTimelineUseCase: createCollectBlueskyTimelineUseCase(env, { db, fetch: deps.fetch }),
  isDigestOwner: IsDigestOwner.create({ userResolverByUsername: createD1UserResolverByUsername(db) }),
});
