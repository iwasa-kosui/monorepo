import { createBlueskyNotificationFetcher } from '../adaptor/bluesky/blueskyNotificationFetcher.ts';
import { createD1BlueskyNotificationCreatedStore } from '../adaptor/d1/blueskyNotification/blueskyNotificationCreatedStore.ts';
import { createD1BlueskyNotificationExistingUrisResolver } from '../adaptor/d1/blueskyNotification/blueskyNotificationExistingUrisResolver.ts';
import { createD1BlueskyNotificationInitialSyncCompletedStore } from '../adaptor/d1/blueskyNotification/blueskyNotificationInitialSyncCompletedStore.ts';
import { createD1BlueskyNotificationReceiptsExpiredStore } from '../adaptor/d1/blueskyNotification/blueskyNotificationReceiptsExpiredStore.ts';
import { createD1BlueskyNotificationSyncStateResolver } from '../adaptor/d1/blueskyNotification/blueskyNotificationSyncStateResolver.ts';
import { createD1PostIdsResolverByBlueskyUris } from '../adaptor/d1/blueskyNotification/postIdsResolverByBlueskyUris.ts';
import { createD1Db, type IoriD1Db } from '../adaptor/d1/client.ts';
import { createD1PushSubscriptionsResolverByUserId } from '../adaptor/d1/pushSubscription/pushSubscriptionsResolverByUserId.ts';
import { createD1UserResolverByUsername } from '../adaptor/d1/user/userResolverByUsername.ts';
import { createCloudflareWebPushSender } from '../adaptor/webPush/cloudflareWebPushSender.ts';
import { Instant } from '../domain/instant/instant.ts';
import { Username } from '../domain/user/username.ts';
import { DAILY_DIGEST_USERNAME } from '../scheduled/digestTasks.ts';
import { CollectBlueskyNotificationsUseCase } from '../useCase/collectBlueskyNotifications.ts';
import { ExpireBlueskyNotificationReceiptsUseCase } from '../useCase/expireBlueskyNotificationReceipts.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';
import { createTimelineClient, resolveBlueskyTimelineConfig } from './blueskyTimeline.ts';

export const createCollectBlueskyNotificationsUseCase = (
  env: IoriWorkerEnv,
  deps: Readonly<{ db?: IoriD1Db; fetch?: typeof fetch; holdLoginAfterFailure?: boolean }> = {},
): CollectBlueskyNotificationsUseCase | undefined => {
  const config = resolveBlueskyTimelineConfig(env);
  if (config === undefined) return undefined;
  const db = deps.db ?? createD1Db(env.DB);
  const now = Instant.now;
  return CollectBlueskyNotificationsUseCase.create({
    fetcher: createBlueskyNotificationFetcher({ client: createTimelineClient(config, db, deps) }),
    ownerUsername: Username.parseOrThrow(DAILY_DIGEST_USERNAME),
    userResolverByUsername: createD1UserResolverByUsername(db),
    syncStateResolver: createD1BlueskyNotificationSyncStateResolver(db),
    initialSyncCompletedStore: createD1BlueskyNotificationInitialSyncCompletedStore(db),
    existingUrisResolver: createD1BlueskyNotificationExistingUrisResolver(db),
    postIdsResolver: createD1PostIdsResolverByBlueskyUris(db),
    createdStore: createD1BlueskyNotificationCreatedStore(db, { now }),
    pushSubscriptionsResolverByUserId: createD1PushSubscriptionsResolverByUserId(db),
    webPushSender: createCloudflareWebPushSender({
      subject: env.VAPID_SUBJECT,
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
    }),
    now,
  });
};

export const createExpireBlueskyNotificationReceiptsUseCase = (
  env: IoriWorkerEnv,
  deps: Readonly<{ db?: IoriD1Db }> = {},
): ExpireBlueskyNotificationReceiptsUseCase | undefined => {
  if (resolveBlueskyTimelineConfig(env) === undefined) return undefined;
  return ExpireBlueskyNotificationReceiptsUseCase.create({
    expiredStore: createD1BlueskyNotificationReceiptsExpiredStore(deps.db ?? createD1Db(env.DB)),
    now: Instant.now,
  });
};
