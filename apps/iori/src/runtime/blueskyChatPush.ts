import { createBlueskyChat } from '../adaptor/bluesky/blueskyChat.ts';
import { createD1BlueskyChatPushReceiptsResolverByConvoIds } from '../adaptor/d1/blueskyChatPush/blueskyChatPushReceiptsResolverByConvoIds.ts';
import { createD1BlueskyChatPushReceiptsSavedStore } from '../adaptor/d1/blueskyChatPush/blueskyChatPushReceiptsSavedStore.ts';
import { createD1BlueskyStoredCredentialResolver } from '../adaptor/d1/blueskyCredential/blueskyCredentialStore.ts';
import { createD1Db, type IoriD1Db } from '../adaptor/d1/client.ts';
import { createD1PushSubscriptionsResolverByUserId } from '../adaptor/d1/pushSubscription/pushSubscriptionsResolverByUserId.ts';
import { createCloudflareWebPushSender } from '../adaptor/webPush/cloudflareWebPushSender.ts';
import { Instant } from '../domain/instant/instant.ts';
import { CollectBlueskyChatPushUseCase } from '../useCase/collectBlueskyChatPush.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';
import type { BlueskyAccountConfig } from './blueskyCredential.ts';
import { createTimelineClient, resolveBlueskyTimelineConfig } from './blueskyTimeline.ts';

export const createCollectBlueskyChatPushUseCase = (
  env: IoriWorkerEnv,
  account: BlueskyAccountConfig,
  deps: Readonly<{ db?: IoriD1Db; fetch?: typeof fetch; holdLoginAfterFailure?: boolean }> = {},
): CollectBlueskyChatPushUseCase | undefined => {
  const config = resolveBlueskyTimelineConfig(env);
  if (config === undefined) return undefined;
  const db = deps.db ?? createD1Db(env.DB);
  return CollectBlueskyChatPushUseCase.create({
    chat: createBlueskyChat({ client: createTimelineClient(account, db, deps) }),
    recipientUserId: account.userId,
    storedCredentialResolver: createD1BlueskyStoredCredentialResolver(db, account.userId),
    receiptsResolver: createD1BlueskyChatPushReceiptsResolverByConvoIds(db, account.userId),
    receiptsSavedStore: createD1BlueskyChatPushReceiptsSavedStore(db, account.userId),
    pushSubscriptionsResolverByUserId: createD1PushSubscriptionsResolverByUserId(db),
    webPushSender: createCloudflareWebPushSender({
      subject: env.VAPID_SUBJECT,
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
    }),
    now: Instant.now,
  });
};
