import { Result } from '@iwasa-kosui/result';

import { Instant } from '../domain/instant/instant.ts';
import type { UserId } from '../domain/user/userId.ts';
import type { BlueskyAccountConfig } from '../runtime/blueskyCredential.ts';
import {
  createCollectBlueskyNotificationsUseCase,
  createExpireBlueskyNotificationReceiptsUseCase,
} from '../runtime/blueskyNotifications.ts';
import { type BlueskySyncStatusRecorder, createBlueskySyncStatusRecorder } from '../runtime/blueskySyncStatus.ts';
import { resolveBlueskyTimelineConfig } from '../runtime/blueskyTimeline.ts';
import type { CollectBlueskyNotificationsUseCase } from '../useCase/collectBlueskyNotifications.ts';
import type { ExpireBlueskyNotificationReceiptsUseCase } from '../useCase/expireBlueskyNotificationReceipts.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';
import { type BlueskyAccountsLister, forEachBlueskyAccount, listActiveBlueskyAccounts } from './blueskyAccounts.ts';
import type { ScheduledTask } from './scheduledTasks.ts';

export const createCollectBlueskyNotificationsTask = (
  createUseCase: (env: IoriWorkerEnv, account: BlueskyAccountConfig) => CollectBlueskyNotificationsUseCase | undefined,
  createRecorder: (env: IoriWorkerEnv, userId: UserId) => BlueskySyncStatusRecorder = createBlueskySyncStatusRecorder,
  listAccounts: BlueskyAccountsLister = listActiveBlueskyAccounts,
): ScheduledTask => ({
  name: 'collectBlueskyNotifications',
  run: async ({ env }) => {
    if (resolveBlueskyTimelineConfig(env) === undefined) {
      console.info('iori bluesky notifications are disabled.');
      return;
    }
    await forEachBlueskyAccount(await listAccounts(env), 'bluesky notifications', async (account) => {
      const useCase = createUseCase(env, account);
      if (useCase === undefined) return;
      const recorder = createRecorder(env, account.userId);
      const collected = await useCase.run();
      if (!collected.ok) {
        console.error(`iori bluesky notifications: collection failed. ${collected.err.message}`, {
          userId: account.userId,
        });
        Result.unsafeUnwrap(
          await recorder.failedStore.save(
            'notifications',
            Instant.now(),
            collected.err.kind,
            collected.err.code ?? null,
          ),
        );
        return;
      }
      Result.unsafeUnwrap(await recorder.succeededStore.save('notifications', Instant.now()));
      console.info('iori bluesky notifications collected.', { userId: account.userId, ...collected.val });
    });
  },
});

export const collectBlueskyNotificationsTask = createCollectBlueskyNotificationsTask((env, account) =>
  createCollectBlueskyNotificationsUseCase(env, account, { holdLoginAfterFailure: true })
);

export const createExpireBlueskyNotificationReceiptsTask = (
  createUseCase: (env: IoriWorkerEnv) => ExpireBlueskyNotificationReceiptsUseCase | undefined,
): ScheduledTask => ({
  name: 'expireBlueskyNotificationReceipts',
  run: async ({ env }) => {
    const useCase = createUseCase(env);
    if (useCase === undefined) {
      console.info('iori bluesky notifications are disabled.');
      return;
    }
    await useCase.run();
  },
});

export const expireBlueskyNotificationReceiptsTask = createExpireBlueskyNotificationReceiptsTask((env) =>
  createExpireBlueskyNotificationReceiptsUseCase(env)
);
