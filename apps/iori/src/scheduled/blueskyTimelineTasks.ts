import { Result } from '@iwasa-kosui/result';

import { Instant } from '../domain/instant/instant.ts';
import { type BlueskySyncStatusRecorder, createBlueskySyncStatusRecorder } from '../runtime/blueskySyncStatus.ts';
import { createCollectBlueskyTimelineUseCase, createExpireBlueskyTimelineUseCase } from '../runtime/blueskyTimeline.ts';
import type { CollectBlueskyTimelineUseCase } from '../useCase/collectBlueskyTimeline.ts';
import type { ExpireBlueskyTimelineUseCase } from '../useCase/expireBlueskyTimeline.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';
import type { ScheduledTask } from './scheduledTasks.ts';

export const createCollectBlueskyTimelineTask = (
  createUseCase: (env: IoriWorkerEnv) => CollectBlueskyTimelineUseCase | undefined,
  createRecorder: (env: IoriWorkerEnv) => BlueskySyncStatusRecorder = createBlueskySyncStatusRecorder,
): ScheduledTask => ({
  name: 'collectBlueskyTimeline',
  run: async ({ env }) => {
    const useCase = createUseCase(env);
    if (useCase === undefined) {
      console.info('iori bluesky timeline is disabled.');
      return;
    }
    const recorder = createRecorder(env);
    const collected = await useCase.run();
    if (!collected.ok) {
      console.error(`iori bluesky timeline: collection failed. ${collected.err.message}`);
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
    console.info('iori bluesky timeline collected.', collected.val);
  },
});

export const collectBlueskyTimelineTask = createCollectBlueskyTimelineTask((env) =>
  createCollectBlueskyTimelineUseCase(env, { holdLoginAfterFailure: true })
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
