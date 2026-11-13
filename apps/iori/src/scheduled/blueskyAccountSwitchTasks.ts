import { Result } from '@iwasa-kosui/result';

import { createD1BlueskyAccountSwitchPurger } from '../adaptor/d1/blueskyAccountSwitch/blueskyAccountSwitchPurger.ts';
import {
  createD1BlueskyAccountSwitchCompletedStore,
  createD1BlueskyAccountSwitchFailedStore,
  createD1BlueskyAccountSwitchProgressStore,
} from '../adaptor/d1/blueskyAccountSwitch/blueskyAccountSwitchPurgeStores.ts';
import { createD1BlueskyAccountSwitchResolver } from '../adaptor/d1/blueskyAccountSwitch/blueskyAccountSwitchResolver.ts';
import { createD1Db } from '../adaptor/d1/client.ts';
import { Instant } from '../domain/instant/instant.ts';
import { PurgeBlueskyAccountSwitchUseCase } from '../useCase/purgeBlueskyAccountSwitch.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';
import type { ScheduledTask } from './scheduledTasks.ts';

export const createPurgeBlueskyAccountSwitchUseCase = (env: IoriWorkerEnv): PurgeBlueskyAccountSwitchUseCase => {
  const db = createD1Db(env.DB);
  return PurgeBlueskyAccountSwitchUseCase.create({
    accountSwitchResolver: createD1BlueskyAccountSwitchResolver(db),
    purger: createD1BlueskyAccountSwitchPurger(db),
    progressStore: createD1BlueskyAccountSwitchProgressStore(db),
    failedStore: createD1BlueskyAccountSwitchFailedStore(db),
    completedStore: createD1BlueskyAccountSwitchCompletedStore(db),
    now: Instant.now,
  });
};

export const createPurgeBlueskyAccountSwitchTask = (
  createUseCase: (env: IoriWorkerEnv) => PurgeBlueskyAccountSwitchUseCase,
): ScheduledTask => ({
  name: 'purgeBlueskyAccountSwitch',
  run: async ({ env }) => {
    const summary = Result.unsafeUnwrap(await createUseCase(env).run());
    switch (summary.status) {
      case 'idle':
      case 'waiting':
        return;
      case 'timeBudget':
        console.info(JSON.stringify({ event: 'bluesky_account_switch_purge_continues', ...summary }));
        return;
      case 'failed':
        console.error(JSON.stringify({ event: 'bluesky_account_switch_purge_failed', ...summary }));
        return;
      case 'completed':
        console.info(JSON.stringify({ event: 'bluesky_account_switch_completed', ...summary }));
        return;
    }
  },
});

export const purgeBlueskyAccountSwitchTask = createPurgeBlueskyAccountSwitchTask(
  createPurgeBlueskyAccountSwitchUseCase,
);

const isBlueskyAccountSwitching = async (env: IoriWorkerEnv): Promise<boolean> => {
  const resolved = await createD1BlueskyAccountSwitchResolver(createD1Db(env.DB)).resolve();
  return resolved.ok && resolved.val !== undefined;
};

export const skipWhileBlueskyAccountSwitching = (
  task: ScheduledTask,
  isSwitching: (env: IoriWorkerEnv) => Promise<boolean> = isBlueskyAccountSwitching,
): ScheduledTask => ({
  ...task,
  run: async (context) => {
    if (await isSwitching(context.env)) {
      console.info(JSON.stringify({ event: 'bluesky_account_switch_task_skipped', task: task.name }));
      return;
    }
    await task.run(context);
  },
});
