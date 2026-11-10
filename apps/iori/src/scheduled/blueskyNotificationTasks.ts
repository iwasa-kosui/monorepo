import {
  createCollectBlueskyNotificationsUseCase,
  createExpireBlueskyNotificationReceiptsUseCase,
} from '../runtime/blueskyNotifications.ts';
import type { CollectBlueskyNotificationsUseCase } from '../useCase/collectBlueskyNotifications.ts';
import type { ExpireBlueskyNotificationReceiptsUseCase } from '../useCase/expireBlueskyNotificationReceipts.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';
import type { ScheduledTask } from './scheduledTasks.ts';

export const createCollectBlueskyNotificationsTask = (
  createUseCase: (env: IoriWorkerEnv) => CollectBlueskyNotificationsUseCase | undefined,
): ScheduledTask => ({
  name: 'collectBlueskyNotifications',
  run: async ({ env }) => {
    const useCase = createUseCase(env);
    if (useCase === undefined) {
      console.info('iori bluesky notifications are disabled.');
      return;
    }
    const collected = await useCase.run();
    if (!collected.ok) {
      console.error(`iori bluesky notifications: collection failed. ${collected.err.message}`);
      return;
    }
    console.info('iori bluesky notifications collected.', collected.val);
  },
});

export const collectBlueskyNotificationsTask = createCollectBlueskyNotificationsTask((env) =>
  createCollectBlueskyNotificationsUseCase(env, { holdLoginAfterFailure: true })
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
