import { Result } from '@iwasa-kosui/result';

import { Instant } from '../domain/instant/instant.ts';
import type { UserId } from '../domain/user/userId.ts';
import type { BlueskyAccountConfig } from '../runtime/blueskyCredential.ts';
import { type BlueskySyncStatusRecorder, createBlueskySyncStatusRecorder } from '../runtime/blueskySyncStatus.ts';
import {
  createCollectBlueskyTimelineUseCase,
  createExpireBlueskyTimelineUseCase,
  resolveBlueskyTimelineConfig,
} from '../runtime/blueskyTimeline.ts';
import type { CollectBlueskyTimelineUseCase } from '../useCase/collectBlueskyTimeline.ts';
import type { ExpireBlueskyTimelineUseCase } from '../useCase/expireBlueskyTimeline.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';
import { type BlueskyAccountsLister, forEachBlueskyAccount, listActiveBlueskyAccounts } from './blueskyAccounts.ts';
import type { ScheduledTask } from './scheduledTasks.ts';

export const createCollectBlueskyTimelineTask = (
  createUseCase: (env: IoriWorkerEnv, account: BlueskyAccountConfig) => CollectBlueskyTimelineUseCase | undefined,
  createRecorder: (env: IoriWorkerEnv, userId: UserId) => BlueskySyncStatusRecorder = createBlueskySyncStatusRecorder,
  listAccounts: BlueskyAccountsLister = listActiveBlueskyAccounts,
): ScheduledTask => ({
  name: 'collectBlueskyTimeline',
  run: async ({ env }) => {
    if (resolveBlueskyTimelineConfig(env) === undefined) {
      console.info('iori bluesky timeline is disabled.');
      return;
    }
    await forEachBlueskyAccount(await listAccounts(env), 'bluesky timeline', async (account) => {
      const useCase = createUseCase(env, account);
      if (useCase === undefined) return;
      const recorder = createRecorder(env, account.userId);
      const collected = await useCase.run();
      if (!collected.ok) {
        console.error(`iori bluesky timeline: collection failed. ${collected.err.message}`, { userId: account.userId });
        Result.unsafeUnwrap(
          await recorder.failedStore.save(
            'timeline',
            Instant.now(),
            collected.err.kind,
            collected.err.code ?? null,
          ),
        );
        return;
      }
      Result.unsafeUnwrap(await recorder.succeededStore.save('timeline', Instant.now()));
      console.info('iori bluesky timeline collected.', { userId: account.userId, ...collected.val });
    });
  },
});

export const collectBlueskyTimelineTask = createCollectBlueskyTimelineTask((env, account) =>
  createCollectBlueskyTimelineUseCase(env, account, { holdLoginAfterFailure: true })
);

export const createExpireBlueskyTimelineTask = (
  createUseCase: (env: IoriWorkerEnv) => ExpireBlueskyTimelineUseCase | undefined,
): ScheduledTask => ({
  name: 'expireBlueskyTimeline',
  run: async ({ env }) => {
    const useCase = createUseCase(env);
    if (useCase === undefined) {
      console.info('iori bluesky timeline is disabled.');
      return;
    }
    await useCase.run();
  },
});

export const expireBlueskyTimelineTask = createExpireBlueskyTimelineTask((env) =>
  createExpireBlueskyTimelineUseCase(env)
);
