import type { RA } from '@iwasa-kosui/result';

import { createBlueskyChat } from '../adaptor/bluesky/blueskyChat.ts';
import { createBlueskyClient } from '../adaptor/bluesky/blueskyClient.ts';
import { createBlueskyPostCidResolver } from '../adaptor/bluesky/blueskyPostCidResolver.ts';
import { createBlueskyPostThreadFetcher } from '../adaptor/bluesky/blueskyPostThreadFetcher.ts';
import { createBlueskySearch } from '../adaptor/bluesky/blueskySearch.ts';
import { createBlueskyTimelineFetcher } from '../adaptor/bluesky/blueskyTimelineFetcher.ts';
import { createBlueskyViewerRepostResolver } from '../adaptor/bluesky/blueskyViewerRepostResolver.ts';
import { createBlueskyThumbnailFetcher } from '../adaptor/bluesky/thumbnailFetcher.ts';
import {
  createD1BlueskyLoginFailureDeletedStore,
  createD1BlueskyLoginFailureResolver,
  createD1BlueskyLoginFailureSavedStore,
} from '../adaptor/d1/blueskyCrosspost/blueskyLoginFailureStore.ts';
import {
  createD1BlueskySessionResolver,
  createD1BlueskySessionSavedStore,
} from '../adaptor/d1/blueskyCrosspost/blueskySessionStore.ts';
import { createD1PostIdsResolverByBlueskyUris } from '../adaptor/d1/blueskyNotification/postIdsResolverByBlueskyUris.ts';
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
import { createD1BlueskyTimelineItemsDeletedStore } from '../adaptor/d1/blueskyTimeline/blueskyTimelineItemsDeletedStore.ts';
import { createD1BlueskyTimelineItemsExpiredStore } from '../adaptor/d1/blueskyTimeline/blueskyTimelineItemsExpiredStore.ts';
import { createD1BlueskyTimelineItemsResolver } from '../adaptor/d1/blueskyTimeline/blueskyTimelineItemsResolver.ts';
import { createD1BlueskyTimelineItemsSavedStore } from '../adaptor/d1/blueskyTimeline/blueskyTimelineItemsSavedStore.ts';
import { createD1BlueskyViewerBookmarksSyncedStore } from '../adaptor/d1/blueskyTimeline/blueskyViewerBookmarksSyncedStore.ts';
import { createD1BlueskyViewerLikesSyncedStore } from '../adaptor/d1/blueskyTimeline/blueskyViewerLikesSyncedStore.ts';
import { createD1BlueskyViewerRepostsSyncedStore } from '../adaptor/d1/blueskyTimeline/blueskyViewerRepostsSyncedStore.ts';
import { createD1Db, type IoriD1Db } from '../adaptor/d1/client.ts';
import { createOgpFetcher } from '../adaptor/ogp/ogpFetcher.ts';
import type { BlueskyLoginFailureResolver } from '../domain/blueskyCrosspost/blueskyCrosspost.ts';
import type { BlueskySyncStatusResolver } from '../domain/blueskySyncStatus/blueskySyncStatus.ts';
import type { BlueskyTimelineItemsResolver } from '../domain/blueskyTimeline/blueskyTimelineItem.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { BlueskyClientError } from '../ports/blueskyClient.ts';
import type { BlueskyPostThreadFetcher } from '../ports/blueskyPostThreadFetcher.ts';
import type { BlueskySearch } from '../ports/blueskySearch.ts';
import { BlueskyChatUseCases } from '../useCase/blueskyChat.ts';
import { CollectBlueskyTimelineUseCase } from '../useCase/collectBlueskyTimeline.ts';
import { DeleteOwnBlueskyPostUseCase } from '../useCase/deleteOwnBlueskyPost.ts';
import type { DeletePostUseCase } from '../useCase/deletePost.ts';
import { ExpireBlueskyTimelineUseCase } from '../useCase/expireBlueskyTimeline.ts';
import { LikeBlueskyPostUseCase } from '../useCase/likeBlueskyPost.ts';
import { MarkBlueskyNotificationsSeenUseCase } from '../useCase/markBlueskyNotificationsSeen.ts';
import { PostToBlueskyUseCase } from '../useCase/postToBluesky.ts';
import { QuoteBlueskyPostUseCase } from '../useCase/quoteBlueskyPost.ts';
import { ReplyToBlueskyPostUseCase } from '../useCase/replyToBlueskyPost.ts';
import { RepostBlueskyPostUseCase } from '../useCase/repostBlueskyPost.ts';
import { UndoRepostBlueskyPostUseCase } from '../useCase/undoRepostBlueskyPost.ts';
import { UnlikeBlueskyPostUseCase } from '../useCase/unlikeBlueskyPost.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';
import {
  BLUESKY_CREDENTIAL_LOGIN_FAILURE_SCOPE,
  type BlueskyAccountConfig,
  type BlueskyRuntimeConfig,
  createBlueskyCredentialResolver,
  resolveBlueskyRuntimeConfig,
} from './blueskyCredential.ts';

export const BLUESKY_TIMELINE_ENABLED_VALUE = 'enabled';
export const BLUESKY_TIMELINE_LOGIN_FAILURE_SCOPE = BLUESKY_CREDENTIAL_LOGIN_FAILURE_SCOPE;

export const resolveBlueskyTimelineConfig = (
  env: Pick<
    IoriWorkerEnv,
    'IORI_BLUESKY_TIMELINE' | 'BLUESKY_IDENTIFIER' | 'BLUESKY_APP_PASSWORD' | 'BLUESKY_CREDENTIAL_KEY'
  >,
): BlueskyRuntimeConfig | undefined =>
  env.IORI_BLUESKY_TIMELINE === BLUESKY_TIMELINE_ENABLED_VALUE ? resolveBlueskyRuntimeConfig(env) : undefined;

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
  postToBlueskyUseCase: PostToBlueskyUseCase | undefined;
  deleteOwnBlueskyPostUseCase: DeleteOwnBlueskyPostUseCase | undefined;
  quoteBlueskyPostUseCase: QuoteBlueskyPostUseCase | undefined;
  markBlueskyNotificationsSeenUseCase: MarkBlueskyNotificationsSeenUseCase | undefined;
  blueskySearch: BlueskySearch | undefined;
  blueskyChat: BlueskyChatUseCases | undefined;
  viewerDid: (() => RA<string, BlueskyClientError>) | undefined;
}>;

export const createTimelineClient = (
  account: BlueskyAccountConfig,
  db: IoriD1Db,
  deps: Readonly<{ fetch?: typeof fetch; holdLoginAfterFailure?: boolean }>,
) =>
  createBlueskyClient({
    resolveCredentials: createBlueskyCredentialResolver(account, db),
    sessionResolver: createD1BlueskySessionResolver(db, account.userId),
    sessionStore: createD1BlueskySessionSavedStore(db, account.userId),
    loginFailure: deps.holdLoginAfterFailure === true
      ? {
        resolver: createD1BlueskyLoginFailureResolver(db, account.userId, BLUESKY_TIMELINE_LOGIN_FAILURE_SCOPE),
        savedStore: createD1BlueskyLoginFailureSavedStore(db, account.userId, BLUESKY_TIMELINE_LOGIN_FAILURE_SCOPE),
        deletedStore: createD1BlueskyLoginFailureDeletedStore(db, account.userId, BLUESKY_TIMELINE_LOGIN_FAILURE_SCOPE),
      }
      : undefined,
    fetch: deps.fetch,
    now: Instant.now,
  });

export const createLikeBlueskyPostUseCases = (
  env: IoriWorkerEnv,
  account: BlueskyAccountConfig,
  db: IoriD1Db,
  deps: Readonly<{ fetch?: typeof fetch }> = {},
): Readonly<{ like: LikeBlueskyPostUseCase; unlike: UnlikeBlueskyPostUseCase }> | undefined => {
  const config = resolveBlueskyTimelineConfig(env);
  if (config === undefined) return undefined;
  const client = createTimelineClient(account, db, deps);
  const targetResolver = createD1BlueskyLikeTargetResolver(db, account.userId);
  const likeUriResolver = createD1BlueskyLikeUriResolver(db, account.userId);
  return {
    like: LikeBlueskyPostUseCase.create({
      client,
      targetResolver,
      likeUriResolver,
      cidResolver: createBlueskyPostCidResolver({ client }),
      savedStore: createD1BlueskyLikeSavedStore(db, account.userId),
      now: Instant.now,
    }),
    unlike: UnlikeBlueskyPostUseCase.create({
      client,
      targetResolver,
      likeUriResolver,
      cidResolver: createBlueskyPostCidResolver({ client }),
      deletedStore: createD1BlueskyLikeDeletedStore(db, account.userId),
    }),
  };
};

export const createRepostBlueskyPostUseCases = (
  env: IoriWorkerEnv,
  account: BlueskyAccountConfig,
  db: IoriD1Db,
  deps: Readonly<{ fetch?: typeof fetch }> = {},
): Readonly<{ repost: RepostBlueskyPostUseCase; undoRepost: UndoRepostBlueskyPostUseCase }> | undefined => {
  const config = resolveBlueskyTimelineConfig(env);
  if (config === undefined) return undefined;
  const client = createTimelineClient(account, db, deps);
  const targetResolver = createD1BlueskyRepostTargetResolver(db, account.userId);
  const repostUriResolver = createD1BlueskyRepostUriResolver(db, account.userId);
  return {
    repost: RepostBlueskyPostUseCase.create({
      client,
      targetResolver,
      repostUriResolver,
      cidResolver: createBlueskyPostCidResolver({ client }),
      viewerRepostResolver: createBlueskyViewerRepostResolver({ client }),
      savedStore: createD1BlueskyRepostSavedStore(db, account.userId),
      now: Instant.now,
    }),
    undoRepost: UndoRepostBlueskyPostUseCase.create({
      client,
      targetResolver,
      repostUriResolver,
      cidResolver: createBlueskyPostCidResolver({ client }),
      deletedStore: createD1BlueskyRepostDeletedStore(db, account.userId),
    }),
  };
};

const createLinkPreviewDeps = (deps: Readonly<{ fetch?: typeof fetch }>) => ({
  ogpFetcher: createOgpFetcher({ fetch: deps.fetch }),
  thumbnailFetcher: createBlueskyThumbnailFetcher({ fetch: deps.fetch }),
});

export const createReplyToBlueskyPostUseCase = (
  env: IoriWorkerEnv,
  account: BlueskyAccountConfig,
  db: IoriD1Db,
  deps: Readonly<{ fetch?: typeof fetch }> = {},
): ReplyToBlueskyPostUseCase | undefined => {
  const config = resolveBlueskyTimelineConfig(env);
  if (config === undefined) return undefined;
  const client = createTimelineClient(account, db, deps);
  return ReplyToBlueskyPostUseCase.create({
    client,
    query: client.query,
    targetResolver: createD1BlueskyLikeTargetResolver(db, account.userId),
    now: Instant.now,
    linkPreview: createLinkPreviewDeps(deps),
  });
};

export const createPostToBlueskyUseCase = (
  env: IoriWorkerEnv,
  account: BlueskyAccountConfig,
  db: IoriD1Db,
  deps: Readonly<{ fetch?: typeof fetch }> = {},
): PostToBlueskyUseCase | undefined => {
  const config = resolveBlueskyRuntimeConfig(env);
  if (config === undefined) return undefined;
  const client = createTimelineClient(account, db, deps);
  return PostToBlueskyUseCase.create({
    client,
    query: client.query,
    now: Instant.now,
    linkPreview: createLinkPreviewDeps(deps),
  });
};

export const createDeleteOwnBlueskyPostUseCase = (
  env: IoriWorkerEnv,
  account: BlueskyAccountConfig,
  db: IoriD1Db,
  deps: Readonly<{ fetch?: typeof fetch; deletePost: DeletePostUseCase }>,
): DeleteOwnBlueskyPostUseCase | undefined => {
  const config = resolveBlueskyRuntimeConfig(env);
  if (config === undefined) return undefined;
  return DeleteOwnBlueskyPostUseCase.create({
    client: createTimelineClient(account, db, deps),
    postIdsResolver: createD1PostIdsResolverByBlueskyUris(db, account.userId),
    deletePost: deps.deletePost,
    timelineItemsDeletedStore: createD1BlueskyTimelineItemsDeletedStore(db),
  });
};

export const createQuoteBlueskyPostUseCase = (
  env: IoriWorkerEnv,
  account: BlueskyAccountConfig,
  db: IoriD1Db,
  deps: Readonly<{ fetch?: typeof fetch }> = {},
): QuoteBlueskyPostUseCase | undefined => {
  const config = resolveBlueskyTimelineConfig(env);
  if (config === undefined) return undefined;
  const client = createTimelineClient(account, db, deps);
  return QuoteBlueskyPostUseCase.create({
    client,
    query: client.query,
    now: Instant.now,
    linkPreview: createLinkPreviewDeps(deps),
  });
};

export const createMarkBlueskyNotificationsSeenUseCase = (
  env: IoriWorkerEnv,
  account: BlueskyAccountConfig,
  db: IoriD1Db,
  deps: Readonly<{ fetch?: typeof fetch }> = {},
): MarkBlueskyNotificationsSeenUseCase | undefined => {
  const config = resolveBlueskyTimelineConfig(env);
  if (config === undefined) return undefined;
  return MarkBlueskyNotificationsSeenUseCase.create({
    client: createTimelineClient(account, db, deps),
    now: Instant.now,
  });
};

export const createCollectBlueskyTimelineUseCase = (
  env: IoriWorkerEnv,
  account: BlueskyAccountConfig,
  deps: Readonly<{ db?: IoriD1Db; fetch?: typeof fetch; holdLoginAfterFailure?: boolean }> = {},
): CollectBlueskyTimelineUseCase | undefined => {
  const config = resolveBlueskyTimelineConfig(env);
  if (config === undefined) return undefined;
  const db = deps.db ?? createD1Db(env.DB);
  const now = Instant.now;
  return CollectBlueskyTimelineUseCase.create({
    fetcher: createBlueskyTimelineFetcher({ client: createTimelineClient(account, db, deps), now }),
    existingResolver: createD1BlueskyTimelineExistingFeedItemIdsResolver(db, account.userId),
    savedStore: createD1BlueskyTimelineItemsSavedStore(db, account.userId),
    viewerLikesStore: createD1BlueskyViewerLikesSyncedStore(db, account.userId),
    viewerRepostsStore: createD1BlueskyViewerRepostsSyncedStore(db, account.userId),
    viewerBookmarksStore: createD1BlueskyViewerBookmarksSyncedStore(db, account.userId),
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

const createChatUseCases = (client: ReturnType<typeof createTimelineClient>) =>
  BlueskyChatUseCases.create({ chat: createBlueskyChat({ client }), query: client.query });

export const createBlueskyTimelineRuntimePorts = (
  env: IoriWorkerEnv,
  account: BlueskyAccountConfig,
  db: IoriD1Db,
  deps: Readonly<{ fetch?: typeof fetch; deletePost?: DeletePostUseCase }> = {},
): BlueskyTimelineRuntimePorts => {
  const likes = createLikeBlueskyPostUseCases(env, account, db, deps);
  const reposts = createRepostBlueskyPostUseCases(env, account, db, deps);
  const config = resolveBlueskyTimelineConfig(env);
  return {
    blueskyTimelineItemsResolver: createD1BlueskyTimelineItemsResolver(db, account.userId),
    blueskyTimelineEnabled: config !== undefined,
    blueskySyncStatusResolver: createD1BlueskySyncStatusResolver(db, account.userId),
    blueskyLoginFailureResolver: createD1BlueskyLoginFailureResolver(db, account.userId, BLUESKY_TIMELINE_LOGIN_FAILURE_SCOPE),
    likeBlueskyPostUseCase: likes?.like,
    unlikeBlueskyPostUseCase: likes?.unlike,
    repostBlueskyPostUseCase: reposts?.repost,
    undoRepostBlueskyPostUseCase: reposts?.undoRepost,
    blueskyPostThreadFetcher: config === undefined
      ? undefined
      : createBlueskyPostThreadFetcher({ client: createTimelineClient(account, db, deps), now: Instant.now }),
    replyToBlueskyPostUseCase: createReplyToBlueskyPostUseCase(env, account, db, deps),
    postToBlueskyUseCase: createPostToBlueskyUseCase(env, account, db, deps),
    deleteOwnBlueskyPostUseCase: deps.deletePost === undefined
      ? undefined
      : createDeleteOwnBlueskyPostUseCase(env, account, db, { fetch: deps.fetch, deletePost: deps.deletePost }),
    quoteBlueskyPostUseCase: createQuoteBlueskyPostUseCase(env, account, db, deps),
    markBlueskyNotificationsSeenUseCase: createMarkBlueskyNotificationsSeenUseCase(env, account, db, deps),
    blueskySearch: config === undefined
      ? undefined
      : createBlueskySearch({ client: createTimelineClient(account, db, deps), now: Instant.now }),
    blueskyChat: config === undefined ? undefined : createChatUseCases(createTimelineClient(account, db, deps)),
    viewerDid: config === undefined ? undefined : createTimelineClient(account, db, deps).viewerDid,
  };
};
