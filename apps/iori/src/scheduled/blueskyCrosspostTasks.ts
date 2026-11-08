import { Result } from '@iwasa-kosui/result';

import { type BlueskyCrosspostUseCases, createBlueskyCrosspostUseCases } from '../runtime/blueskyCrosspost.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';
import type { ScheduledTask, ScheduledTaskContext } from './scheduledTasks.ts';

export const createRetryBlueskyCrosspostsTask = (
  createUseCases: (
    env: IoriWorkerEnv,
    waitUntil: ScheduledTaskContext['waitUntil'],
  ) => BlueskyCrosspostUseCases | undefined,
): ScheduledTask => ({
  name: 'retryBlueskyCrossposts',
  run: async ({ env, waitUntil }) => {
    const useCases = createUseCases(env, waitUntil);
    if (useCases === undefined) {
      console.info('iori bluesky crosspost is disabled.');
      return;
    }
    const summary = Result.unsafeUnwrap(await useCases.retry.run());
    console.info('iori bluesky crossposts retried.', summary);
  },
});

export const retryBlueskyCrosspostsTask = createRetryBlueskyCrosspostsTask(createBlueskyCrosspostUseCases);
