import {
  createCollectBlueskyTimelineUseCase,
  createExpireBlueskyTimelineUseCase,
  createSyncBlueskyMutedActorsUseCase,
} from '../runtime/blueskyTimeline.ts';
import type { CollectBlueskyTimelineUseCase } from '../useCase/collectBlueskyTimeline.ts';
import type { ExpireBlueskyTimelineUseCase } from '../useCase/expireBlueskyTimeline.ts';
import type { SyncBlueskyMutedActorsUseCase } from '../useCase/syncBlueskyMutedActors.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';
import type { ScheduledTask } from './scheduledTasks.ts';

export const createCollectBlueskyTimelineTask = (
  createUseCase: (env: IoriWorkerEnv) => CollectBlueskyTimelineUseCase | undefined,
): ScheduledTask => ({
  name: 'collectBlueskyTimeline',
  run: async ({ env }) => {
    const useCase = createUseCase(env);
    if (useCase === undefined) {
      console.info('iori bluesky timeline is disabled.');
      return;
    }
    const collected = await useCase.run();
    if (!collected.ok) {
      console.error(`iori bluesky timeline: collection failed. ${collected.err.message}`);
      return;
    }
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

export const createSyncBlueskyMutedActorsTask = (
  createUseCase: (env: IoriWorkerEnv) => SyncBlueskyMutedActorsUseCase | undefined,
): ScheduledTask => ({
  name: 'syncBlueskyMutedActors',
  run: async ({ env }) => {
    const useCase = createUseCase(env);
    if (useCase === undefined) {
      console.info('iori bluesky timeline is disabled.');
      return;
    }
    const synced = await useCase.run();
    if (!synced.ok) {
      console.error(`iori bluesky muted actors: sync failed. ${synced.err.message}`);
      return;
    }
    if (synced.val.added > 0 || synced.val.removed > 0) {
      console.info('iori bluesky muted actors synced.', synced.val);
    }
  },
});

export const syncBlueskyMutedActorsTask = createSyncBlueskyMutedActorsTask((env) =>
  createSyncBlueskyMutedActorsUseCase(env, { holdLoginAfterFailure: true })
);
