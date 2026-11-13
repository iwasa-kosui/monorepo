import { createCollectBlueskyChatPushUseCase } from '../runtime/blueskyChatPush.ts';
import type { CollectBlueskyChatPushUseCase } from '../useCase/collectBlueskyChatPush.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';
import type { ScheduledTask } from './scheduledTasks.ts';

export const createCollectBlueskyChatPushTask = (
  createUseCase: (env: IoriWorkerEnv) => CollectBlueskyChatPushUseCase | undefined,
): ScheduledTask => ({
  name: 'collectBlueskyChatPush',
  run: async ({ env }) => {
    const useCase = createUseCase(env);
    if (useCase === undefined) {
      console.info('iori bluesky chat push is disabled.');
      return;
    }
    const collected = await useCase.run();
    if (!collected.ok) {
      console.error(`iori bluesky chat push: collection failed. ${collected.err.message}`);
      return;
    }
    console.info('iori bluesky chat push collected.', collected.val);
  },
});

export const collectBlueskyChatPushTask = createCollectBlueskyChatPushTask((env) =>
  createCollectBlueskyChatPushUseCase(env, { holdLoginAfterFailure: true })
);
