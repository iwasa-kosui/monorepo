import { createBlueskyNotificationFetcher } from '../adaptor/bluesky/blueskyNotificationFetcher.ts';
import { createD1BlueskyNotificationCreatedStore } from '../adaptor/d1/blueskyNotification/blueskyNotificationCreatedStore.ts';
import { createD1BlueskyNotificationExistingUrisResolver } from '../adaptor/d1/blueskyNotification/blueskyNotificationExistingUrisResolver.ts';
import { createD1BlueskyNotificationInitialSyncCompletedStore } from '../adaptor/d1/blueskyNotification/blueskyNotificationInitialSyncCompletedStore.ts';
import { createD1BlueskyNotificationReceiptsExpiredStore } from '../adaptor/d1/blueskyNotification/blueskyNotificationReceiptsExpiredStore.ts';
import { createD1BlueskyNotificationSyncStateResolver } from '../adaptor/d1/blueskyNotification/blueskyNotificationSyncStateResolver.ts';
import { createD1PostIdsResolverByBlueskyUris } from '../adaptor/d1/blueskyNotification/postIdsResolverByBlueskyUris.ts';
import { createD1Db, type IoriD1Db } from '../adaptor/d1/client.ts';
import { createD1PushSubscriptionsResolverByUserId } from '../adaptor/d1/pushSubscription/pushSubscriptionsResolverByUserId.ts';
import { createCloudflareWebPushSender } from '../adaptor/webPush/cloudflareWebPushSender.ts';
import { Instant } from '../domain/instant/instant.ts';
import { CollectBlueskyNotificationsUseCase } from '../useCase/collectBlueskyNotifications.ts';
import { ExpireBlueskyNotificationReceiptsUseCase } from '../useCase/expireBlueskyNotificationReceipts.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';
import type { BlueskyAccountConfig } from './blueskyCredential.ts';
import { createTimelineClient, resolveBlueskyTimelineConfig } from './blueskyTimeline.ts';

export const createCollectBlueskyNotificationsUseCase = (
  env: IoriWorkerEnv,
  account: BlueskyAccountConfig,
  deps: Readonly<{ db?: IoriD1Db; fetch?: typeof fetch; holdLoginAfterFailure?: boolean }> = {},
): CollectBlueskyNotificationsUseCase | undefined => {
  const config = resolveBlueskyTimelineConfig(env);
  if (config === undefined) return undefined;
  const db = deps.db ?? createD1Db(env.DB);
  const now = Instant.now;
  return CollectBlueskyNotificationsUseCase.create({
    fetcher: createBlueskyNotificationFetcher({ client: createTimelineClient(account, db, deps) }),
    recipientUserId: account.userId,
    syncStateResolver: createD1BlueskyNotificationSyncStateResolver(db, account.userId),
    initialSyncCompletedStore: createD1BlueskyNotificationInitialSyncCompletedStore(db, account.userId),
    existingUrisResolver: createD1BlueskyNotificationExistingUrisResolver(db, account.userId),
    postIdsResolver: createD1PostIdsResolverByBlueskyUris(db, account.userId),
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
