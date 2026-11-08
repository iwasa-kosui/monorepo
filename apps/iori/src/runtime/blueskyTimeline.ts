import { createBlueskyClient } from '../adaptor/bluesky/blueskyClient.ts';
import { createBlueskyTimelineFetcher } from '../adaptor/bluesky/blueskyTimelineFetcher.ts';
import {
  createD1BlueskyLoginFailureDeletedStore,
  createD1BlueskyLoginFailureResolver,
  createD1BlueskyLoginFailureSavedStore,
} from '../adaptor/d1/blueskyCrosspost/blueskyLoginFailureStore.ts';
import {
  createD1BlueskySessionResolver,
  createD1BlueskySessionSavedStore,
} from '../adaptor/d1/blueskyCrosspost/blueskySessionStore.ts';
import { createD1BlueskyTimelineExistingFeedItemIdsResolver } from '../adaptor/d1/blueskyTimeline/blueskyTimelineExistingFeedItemIdsResolver.ts';
import { createD1BlueskyTimelineItemsExpiredStore } from '../adaptor/d1/blueskyTimeline/blueskyTimelineItemsExpiredStore.ts';
import { createD1BlueskyTimelineItemsResolver } from '../adaptor/d1/blueskyTimeline/blueskyTimelineItemsResolver.ts';
import { createD1BlueskyTimelineItemsSavedStore } from '../adaptor/d1/blueskyTimeline/blueskyTimelineItemsSavedStore.ts';
import { createD1Db, type IoriD1Db } from '../adaptor/d1/client.ts';
import type { BlueskyTimelineItemsResolver } from '../domain/blueskyTimeline/blueskyTimelineItem.ts';
import { Instant } from '../domain/instant/instant.ts';
import { CollectBlueskyTimelineUseCase } from '../useCase/collectBlueskyTimeline.ts';
import { ExpireBlueskyTimelineUseCase } from '../useCase/expireBlueskyTimeline.ts';
import { RefreshBlueskyTimelineUseCase } from '../useCase/refreshBlueskyTimeline.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';
import { type BlueskyCredentials, resolveBlueskyCredentials } from './blueskyCrosspost.ts';

export const BLUESKY_TIMELINE_ENABLED_VALUE = 'enabled';
export const BLUESKY_TIMELINE_LOGIN_FAILURE_SCOPE = 'timeline';

export const resolveBlueskyTimelineConfig = (
  env: Pick<IoriWorkerEnv, 'IORI_BLUESKY_TIMELINE' | 'BLUESKY_IDENTIFIER' | 'BLUESKY_APP_PASSWORD'>,
): BlueskyCredentials | undefined =>
  env.IORI_BLUESKY_TIMELINE === BLUESKY_TIMELINE_ENABLED_VALUE ? resolveBlueskyCredentials(env) : undefined;

export type BlueskyTimelineRuntimePorts = Readonly<{
  blueskyTimelineItemsResolver: BlueskyTimelineItemsResolver;
  collectBlueskyTimelineUseCase: CollectBlueskyTimelineUseCase | undefined;
}>;

export const createCollectBlueskyTimelineUseCase = (
  env: IoriWorkerEnv,
  deps: Readonly<{ db?: IoriD1Db; fetch?: typeof fetch; holdLoginAfterFailure?: boolean }> = {},
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
        loginFailure: deps.holdLoginAfterFailure === true
          ? {
            resolver: createD1BlueskyLoginFailureResolver(db, BLUESKY_TIMELINE_LOGIN_FAILURE_SCOPE),
            savedStore: createD1BlueskyLoginFailureSavedStore(db, BLUESKY_TIMELINE_LOGIN_FAILURE_SCOPE),
            deletedStore: createD1BlueskyLoginFailureDeletedStore(db, BLUESKY_TIMELINE_LOGIN_FAILURE_SCOPE),
          }
          : undefined,
        fetch: deps.fetch,
        now,
      }),
      now,
    }),
    existingResolver: createD1BlueskyTimelineExistingFeedItemIdsResolver(db),
    savedStore: createD1BlueskyTimelineItemsSavedStore(db),
    now,
  });
};

export const createExpireBlueskyTimelineUseCase = (
  env: IoriWorkerEnv,
  deps: Readonly<{ db?: IoriD1Db }> = {},
): ExpireBlueskyTimelineUseCase | undefined => {
  if (resolveBlueskyTimelineConfig(env) === undefined) return undefined;
  return ExpireBlueskyTimelineUseCase.create({
    expiredStore: createD1BlueskyTimelineItemsExpiredStore(deps.db ?? createD1Db(env.DB)),
    now: Instant.now,
  });
};

const createRefreshBlueskyTimelineUseCase = (
  env: IoriWorkerEnv,
  deps: Readonly<{ db: IoriD1Db; fetch?: typeof fetch }>,
): RefreshBlueskyTimelineUseCase | undefined => {
  const collect = createCollectBlueskyTimelineUseCase(env, deps);
  const expire = createExpireBlueskyTimelineUseCase(env, deps);
  return collect === undefined || expire === undefined
    ? undefined
    : RefreshBlueskyTimelineUseCase.create({ collect, expire });
};

export const createBlueskyTimelineRuntimePorts = (
  env: IoriWorkerEnv,
  db: IoriD1Db,
  deps: Readonly<{ fetch?: typeof fetch }> = {},
): BlueskyTimelineRuntimePorts => ({
  blueskyTimelineItemsResolver: createD1BlueskyTimelineItemsResolver(db),
  collectBlueskyTimelineUseCase: createRefreshBlueskyTimelineUseCase(env, { db, fetch: deps.fetch }),
});
