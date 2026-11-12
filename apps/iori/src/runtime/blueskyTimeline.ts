import { createBlueskyClient } from '../adaptor/bluesky/blueskyClient.ts';
import { createBlueskyPostCidResolver } from '../adaptor/bluesky/blueskyPostCidResolver.ts';
import { createBlueskyPostThreadFetcher } from '../adaptor/bluesky/blueskyPostThreadFetcher.ts';
import { createBlueskySearch } from '../adaptor/bluesky/blueskySearch.ts';
import { createBlueskyTimelineFetcher } from '../adaptor/bluesky/blueskyTimelineFetcher.ts';
import { createBlueskyViewerRepostResolver } from '../adaptor/bluesky/blueskyViewerRepostResolver.ts';
import {
  createD1BlueskyLoginFailureDeletedStore,
  createD1BlueskyLoginFailureResolver,
  createD1BlueskyLoginFailureSavedStore,
} from '../adaptor/d1/blueskyCrosspost/blueskyLoginFailureStore.ts';
import {
  createD1BlueskySessionResolver,
  createD1BlueskySessionSavedStore,
} from '../adaptor/d1/blueskyCrosspost/blueskySessionStore.ts';
import { createD1BlueskySyncStatusResolver } from '../adaptor/d1/blueskySyncStatus/blueskySyncStatusStore.ts';
import { createD1BlueskyLikeDeletedStore } from '../adaptor/d1/blueskyTimeline/blueskyLikeDeletedStore.ts';
import { createD1BlueskyLikeSavedStore } from '../adaptor/d1/blueskyTimeline/blueskyLikeSavedStore.ts';
import { createD1BlueskyLikeTargetResolver } from '../adaptor/d1/blueskyTimeline/blueskyLikeTargetResolver.ts';
import { createD1BlueskyLikeUriResolver } from '../adaptor/d1/blueskyTimeline/blueskyLikeUriResolver.ts';
import { createD1BlueskyRepostDeletedStore } from '../adaptor/d1/blueskyTimeline/blueskyRepostDeletedStore.ts';
import { createD1BlueskyRepostSavedStore } from '../adaptor/d1/blueskyTimeline/blueskyRepostSavedStore.ts';
import { createD1BlueskyRepostTargetResolver } from '../adaptor/d1/blueskyTimeline/blueskyRepostTargetResolver.ts';
import { createD1BlueskyRepostUriResolver } from '../adaptor/d1/blueskyTimeline/blueskyRepostUriResolver.ts';
import { createD1BlueskyTimelineExistingFeedItemIdsResolver } from '../adaptor/d1/blueskyTimeline/blueskyTimelineExistingFeedItemIdsResolver.ts';
import { createD1BlueskyTimelineItemsExpiredStore } from '../adaptor/d1/blueskyTimeline/blueskyTimelineItemsExpiredStore.ts';
import { createD1BlueskyTimelineItemsResolver } from '../adaptor/d1/blueskyTimeline/blueskyTimelineItemsResolver.ts';
import { createD1BlueskyTimelineItemsSavedStore } from '../adaptor/d1/blueskyTimeline/blueskyTimelineItemsSavedStore.ts';
import { createD1BlueskyViewerLikesSyncedStore } from '../adaptor/d1/blueskyTimeline/blueskyViewerLikesSyncedStore.ts';
import { createD1BlueskyViewerRepostsSyncedStore } from '../adaptor/d1/blueskyTimeline/blueskyViewerRepostsSyncedStore.ts';
import { createD1Db, type IoriD1Db } from '../adaptor/d1/client.ts';
import { createD1UserResolverByUsername } from '../adaptor/d1/user/userResolverByUsername.ts';
import type { BlueskyLoginFailureResolver } from '../domain/blueskyCrosspost/blueskyCrosspost.ts';
import type { BlueskySyncStatusResolver } from '../domain/blueskySyncStatus/blueskySyncStatus.ts';
import type { BlueskyTimelineItemsResolver } from '../domain/blueskyTimeline/blueskyTimelineItem.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { BlueskyPostThreadFetcher } from '../ports/blueskyPostThreadFetcher.ts';
import type { BlueskySearch } from '../ports/blueskySearch.ts';
import { CollectBlueskyTimelineUseCase } from '../useCase/collectBlueskyTimeline.ts';
import { ExpireBlueskyTimelineUseCase } from '../useCase/expireBlueskyTimeline.ts';
import { IsDigestOwner } from '../useCase/isDigestOwner.ts';
import { LikeBlueskyPostUseCase } from '../useCase/likeBlueskyPost.ts';
import { MarkBlueskyNotificationsSeenUseCase } from '../useCase/markBlueskyNotificationsSeen.ts';
import { ReplyToBlueskyPostUseCase } from '../useCase/replyToBlueskyPost.ts';
import { RepostBlueskyPostUseCase } from '../useCase/repostBlueskyPost.ts';
import { UndoRepostBlueskyPostUseCase } from '../useCase/undoRepostBlueskyPost.ts';
import { UnlikeBlueskyPostUseCase } from '../useCase/unlikeBlueskyPost.ts';
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
  blueskyTimelineEnabled: boolean;
  blueskySyncStatusResolver: BlueskySyncStatusResolver;
  blueskyLoginFailureResolver: BlueskyLoginFailureResolver;
  likeBlueskyPostUseCase: LikeBlueskyPostUseCase | undefined;
  unlikeBlueskyPostUseCase: UnlikeBlueskyPostUseCase | undefined;
  repostBlueskyPostUseCase: RepostBlueskyPostUseCase | undefined;
  undoRepostBlueskyPostUseCase: UndoRepostBlueskyPostUseCase | undefined;
  blueskyPostThreadFetcher: BlueskyPostThreadFetcher | undefined;
  replyToBlueskyPostUseCase: ReplyToBlueskyPostUseCase | undefined;
  markBlueskyNotificationsSeenUseCase: MarkBlueskyNotificationsSeenUseCase | undefined;
  blueskySearch: BlueskySearch | undefined;
  isDigestOwner: IsDigestOwner;
}>;

export const createTimelineClient = (
  config: BlueskyCredentials,
  db: IoriD1Db,
  deps: Readonly<{ fetch?: typeof fetch; holdLoginAfterFailure?: boolean }>,
) =>
  createBlueskyClient({
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
  const likeUriResolver = createD1BlueskyLikeUriResolver(db);
  return {
    like: LikeBlueskyPostUseCase.create({
      client,
      targetResolver,
      likeUriResolver,
      cidResolver: createBlueskyPostCidResolver({ client }),
      savedStore: createD1BlueskyLikeSavedStore(db),
      now: Instant.now,
    }),
    unlike: UnlikeBlueskyPostUseCase.create({
      client,
      targetResolver,
      likeUriResolver,
      cidResolver: createBlueskyPostCidResolver({ client }),
      deletedStore: createD1BlueskyLikeDeletedStore(db),
    }),
  };
};

export const createRepostBlueskyPostUseCases = (
  env: IoriWorkerEnv,
  db: IoriD1Db,
  deps: Readonly<{ fetch?: typeof fetch }> = {},
): Readonly<{ repost: RepostBlueskyPostUseCase; undoRepost: UndoRepostBlueskyPostUseCase }> | undefined => {
  const config = resolveBlueskyTimelineConfig(env);
  if (config === undefined) return undefined;
  const client = createTimelineClient(config, db, deps);
  const targetResolver = createD1BlueskyRepostTargetResolver(db);
  const repostUriResolver = createD1BlueskyRepostUriResolver(db);
  return {
    repost: RepostBlueskyPostUseCase.create({
      client,
      targetResolver,
      repostUriResolver,
      cidResolver: createBlueskyPostCidResolver({ client }),
      viewerRepostResolver: createBlueskyViewerRepostResolver({ client }),
      savedStore: createD1BlueskyRepostSavedStore(db),
      now: Instant.now,
    }),
    undoRepost: UndoRepostBlueskyPostUseCase.create({
      client,
      targetResolver,
      repostUriResolver,
      cidResolver: createBlueskyPostCidResolver({ client }),
      deletedStore: createD1BlueskyRepostDeletedStore(db),
    }),
  };
};

export const createReplyToBlueskyPostUseCase = (
  env: IoriWorkerEnv,
  db: IoriD1Db,
  deps: Readonly<{ fetch?: typeof fetch }> = {},
): ReplyToBlueskyPostUseCase | undefined => {
  const config = resolveBlueskyTimelineConfig(env);
  if (config === undefined) return undefined;
  const client = createTimelineClient(config, db, deps);
  return ReplyToBlueskyPostUseCase.create({
    client,
    query: client.query,
    targetResolver: createD1BlueskyLikeTargetResolver(db),
    now: Instant.now,
  });
};

export const createMarkBlueskyNotificationsSeenUseCase = (
  env: IoriWorkerEnv,
  db: IoriD1Db,
  deps: Readonly<{ fetch?: typeof fetch }> = {},
): MarkBlueskyNotificationsSeenUseCase | undefined => {
  const config = resolveBlueskyTimelineConfig(env);
  if (config === undefined) return undefined;
  return MarkBlueskyNotificationsSeenUseCase.create({
    client: createTimelineClient(config, db, deps),
    now: Instant.now,
  });
};

export const createCollectBlueskyTimelineUseCase = (
  env: IoriWorkerEnv,
  deps: Readonly<{ db?: IoriD1Db; fetch?: typeof fetch; holdLoginAfterFailure?: boolean }> = {},
): CollectBlueskyTimelineUseCase | undefined => {
  const config = resolveBlueskyTimelineConfig(env);
  if (config === undefined) return undefined;
  const db = deps.db ?? createD1Db(env.DB);
  const now = Instant.now;
  return CollectBlueskyTimelineUseCase.create({
    fetcher: createBlueskyTimelineFetcher({ client: createTimelineClient(config, db, deps), now }),
    existingResolver: createD1BlueskyTimelineExistingFeedItemIdsResolver(db),
    savedStore: createD1BlueskyTimelineItemsSavedStore(db),
    viewerLikesStore: createD1BlueskyViewerLikesSyncedStore(db),
    viewerRepostsStore: createD1BlueskyViewerRepostsSyncedStore(db),
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

export const createBlueskyTimelineRuntimePorts = (
  env: IoriWorkerEnv,
  db: IoriD1Db,
  deps: Readonly<{ fetch?: typeof fetch }> = {},
): BlueskyTimelineRuntimePorts => {
  const likes = createLikeBlueskyPostUseCases(env, db, deps);
  const reposts = createRepostBlueskyPostUseCases(env, db, deps);
  const config = resolveBlueskyTimelineConfig(env);
  return {
    blueskyTimelineItemsResolver: createD1BlueskyTimelineItemsResolver(db),
    blueskyTimelineEnabled: config !== undefined,
    blueskySyncStatusResolver: createD1BlueskySyncStatusResolver(db),
    blueskyLoginFailureResolver: createD1BlueskyLoginFailureResolver(db, BLUESKY_TIMELINE_LOGIN_FAILURE_SCOPE),
    likeBlueskyPostUseCase: likes?.like,
    unlikeBlueskyPostUseCase: likes?.unlike,
    repostBlueskyPostUseCase: reposts?.repost,
    undoRepostBlueskyPostUseCase: reposts?.undoRepost,
    blueskyPostThreadFetcher: config === undefined
      ? undefined
      : createBlueskyPostThreadFetcher({ client: createTimelineClient(config, db, deps), now: Instant.now }),
    replyToBlueskyPostUseCase: createReplyToBlueskyPostUseCase(env, db, deps),
    markBlueskyNotificationsSeenUseCase: createMarkBlueskyNotificationsSeenUseCase(env, db, deps),
    blueskySearch: config === undefined
      ? undefined
      : createBlueskySearch({ client: createTimelineClient(config, db, deps), now: Instant.now }),
    isDigestOwner: IsDigestOwner.create({ userResolverByUsername: createD1UserResolverByUsername(db) }),
  };
};
