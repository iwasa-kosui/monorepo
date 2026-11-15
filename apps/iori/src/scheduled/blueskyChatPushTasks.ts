import { createCollectBlueskyChatPushUseCase } from '../runtime/blueskyChatPush.ts';
import type { BlueskyAccountConfig } from '../runtime/blueskyCredential.ts';
import { resolveBlueskyTimelineConfig } from '../runtime/blueskyTimeline.ts';
import type { CollectBlueskyChatPushUseCase } from '../useCase/collectBlueskyChatPush.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';
import { type BlueskyAccountsLister, forEachBlueskyAccount, listActiveBlueskyAccounts } from './blueskyAccounts.ts';
import type { ScheduledTask } from './scheduledTasks.ts';

export const createCollectBlueskyChatPushTask = (
  createUseCase: (env: IoriWorkerEnv, account: BlueskyAccountConfig) => CollectBlueskyChatPushUseCase | undefined,
  listAccounts: BlueskyAccountsLister = listActiveBlueskyAccounts,
): ScheduledTask => ({
  name: 'collectBlueskyChatPush',
  run: async ({ env }) => {
    if (resolveBlueskyTimelineConfig(env) === undefined) {
      console.info('iori bluesky chat push is disabled.');
      return;
    }
    await forEachBlueskyAccount(await listAccounts(env), 'bluesky chat push', async (account) => {
      const useCase = createUseCase(env, account);
      if (useCase === undefined) return;
      const collected = await useCase.run();
      if (!collected.ok) {
        console.error(`iori bluesky chat push: collection failed. ${collected.err.message}`, { userId: account.userId });
        return;
      }
      console.info('iori bluesky chat push collected.', { userId: account.userId, ...collected.val });
    });
  },
});

export const collectBlueskyChatPushTask = createCollectBlueskyChatPushTask((env, account) =>
  createCollectBlueskyChatPushUseCase(env, account, { holdLoginAfterFailure: true })
);
