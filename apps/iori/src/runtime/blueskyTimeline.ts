import { createBlueskyClient } from '../adaptor/bluesky/blueskyClient.ts';
import { createBlueskyTimelineFetcher } from '../adaptor/bluesky/blueskyTimelineFetcher.ts';
import {
  createD1BlueskySessionResolver,
  createD1BlueskySessionSavedStore,
} from '../adaptor/d1/blueskyCrosspost/blueskySessionStore.ts';
import { createD1BlueskyLikeDeletedStore } from '../adaptor/d1/blueskyTimeline/blueskyLikeDeletedStore.ts';
import { createD1BlueskyLikeSavedStore } from '../adaptor/d1/blueskyTimeline/blueskyLikeSavedStore.ts';
import { createD1BlueskyLikeTargetResolver } from '../adaptor/d1/blueskyTimeline/blueskyLikeTargetResolver.ts';
import { createD1BlueskyTimelineItemsExpiredStore } from '../adaptor/d1/blueskyTimeline/blueskyTimelineItemsExpiredStore.ts';
import { createD1BlueskyTimelineItemsResolver } from '../adaptor/d1/blueskyTimeline/blueskyTimelineItemsResolver.ts';
import { createD1BlueskyTimelineItemsSavedStore } from '../adaptor/d1/blueskyTimeline/blueskyTimelineItemsSavedStore.ts';
import { createD1Db, type IoriD1Db } from '../adaptor/d1/client.ts';
import { createD1UserResolverByUsername } from '../adaptor/d1/user/userResolverByUsername.ts';
import type { BlueskyTimelineItemsResolver } from '../domain/blueskyTimeline/blueskyTimelineItem.ts';
import { Instant } from '../domain/instant/instant.ts';
import { CollectBlueskyTimelineUseCase } from '../useCase/collectBlueskyTimeline.ts';
import { IsDigestOwner } from '../useCase/isDigestOwner.ts';
import { LikeBlueskyPostUseCase } from '../useCase/likeBlueskyPost.ts';
import { UnlikeBlueskyPostUseCase } from '../useCase/unlikeBlueskyPost.ts';
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
  likeBlueskyPostUseCase: LikeBlueskyPostUseCase | undefined;
  unlikeBlueskyPostUseCase: UnlikeBlueskyPostUseCase | undefined;
  isDigestOwner: IsDigestOwner;
}>;

const createTimelineClient = (
  config: BlueskyCredentials,
  db: IoriD1Db,
  deps: Readonly<{ fetch?: typeof fetch }>,
) =>
  createBlueskyClient({
    identifier: config.identifier,
    appPassword: config.appPassword,
    sessionResolver: createD1BlueskySessionResolver(db),
    sessionStore: createD1BlueskySessionSavedStore(db),
    fetch: deps.fetch,
    now: Instant.now,
  });

export const createLikeBlueskyPostUseCases = (
  env: IoriWorkerEnv,
  db: IoriD1Db,
  deps: Readonly<{ fetch?: typeof fetch }> = {},
): Readonly<{ like: LikeBlueskyPostUseCase; unlike: UnlikeBlueskyPostUseCase }> | undefined => {
  const config = resolveBlueskyTimelineConfig(env);
  if (config === undefined) return undefined;
  const client = createTimelineClient(config, db, deps);
  const targetResolver = createD1BlueskyLikeTargetResolver(db);
  return {
    like: LikeBlueskyPostUseCase.create({
      client,
      targetResolver,
      savedStore: createD1BlueskyLikeSavedStore(db),
      now: Instant.now,
    }),
    unlike: UnlikeBlueskyPostUseCase.create({
      client,
      targetResolver,
      deletedStore: createD1BlueskyLikeDeletedStore(db),
    }),
  };
};

export const createCollectBlueskyTimelineUseCase = (
  env: IoriWorkerEnv,
  deps: Readonly<{ db?: IoriD1Db; fetch?: typeof fetch }> = {},
): CollectBlueskyTimelineUseCase | undefined => {
  const config = resolveBlueskyTimelineConfig(env);
  if (config === undefined) return undefined;
  const db = deps.db ?? createD1Db(env.DB);
  const now = Instant.now;
  return CollectBlueskyTimelineUseCase.create({
    fetcher: createBlueskyTimelineFetcher({ client: createTimelineClient(config, db, deps), now }),
    savedStore: createD1BlueskyTimelineItemsSavedStore(db),
    expiredStore: createD1BlueskyTimelineItemsExpiredStore(db),
    now,
  });
};

export const createBlueskyTimelineRuntimePorts = (
  env: IoriWorkerEnv,
  db: IoriD1Db,
  deps: Readonly<{ fetch?: typeof fetch }> = {},
): BlueskyTimelineRuntimePorts => {
  const likes = createLikeBlueskyPostUseCases(env, db, deps);
  return {
    blueskyTimelineItemsResolver: createD1BlueskyTimelineItemsResolver(db),
    collectBlueskyTimelineUseCase: createCollectBlueskyTimelineUseCase(env, { db, fetch: deps.fetch }),
    likeBlueskyPostUseCase: likes?.like,
    unlikeBlueskyPostUseCase: likes?.unlike,
    isDigestOwner: IsDigestOwner.create({ userResolverByUsername: createD1UserResolverByUsername(db) }),
  };
};
