import { Result } from '@iwasa-kosui/result';

import { createD1BlueskyAccountSwitchPurger } from '../adaptor/d1/blueskyAccountSwitch/blueskyAccountSwitchPurger.ts';
import {
  createD1BlueskyAccountSwitchCompletedStore,
  createD1BlueskyAccountSwitchFailedStore,
  createD1BlueskyAccountSwitchProgressStore,
} from '../adaptor/d1/blueskyAccountSwitch/blueskyAccountSwitchPurgeStores.ts';
import {
  createD1BlueskyAccountSwitchingUserIdsResolver,
  createD1BlueskyAccountSwitchResolver,
} from '../adaptor/d1/blueskyAccountSwitch/blueskyAccountSwitchResolver.ts';
import { createD1Db } from '../adaptor/d1/client.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { UserId } from '../domain/user/userId.ts';
import { PurgeBlueskyAccountSwitchUseCase } from '../useCase/purgeBlueskyAccountSwitch.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';
import type { ScheduledTask } from './scheduledTasks.ts';

export const createPurgeBlueskyAccountSwitchUseCase = (
  env: IoriWorkerEnv,
  userId: UserId,
): PurgeBlueskyAccountSwitchUseCase => {
  const db = createD1Db(env.DB);
  return PurgeBlueskyAccountSwitchUseCase.create({
    accountSwitchResolver: createD1BlueskyAccountSwitchResolver(db, userId),
    purger: createD1BlueskyAccountSwitchPurger(db, userId),
    progressStore: createD1BlueskyAccountSwitchProgressStore(db),
    failedStore: createD1BlueskyAccountSwitchFailedStore(db),
    completedStore: createD1BlueskyAccountSwitchCompletedStore(db),
    now: Instant.now,
  });
};

const resolveSwitchingUserIds = (env: IoriWorkerEnv): Promise<readonly UserId[]> =>
  createD1BlueskyAccountSwitchingUserIdsResolver(createD1Db(env.DB)).resolve();

export const createPurgeBlueskyAccountSwitchTask = (
  createUseCase: (env: IoriWorkerEnv, userId: UserId) => PurgeBlueskyAccountSwitchUseCase,
  switchingUserIds: (env: IoriWorkerEnv) => Promise<readonly UserId[]> = resolveSwitchingUserIds,
): ScheduledTask => ({
  name: 'purgeBlueskyAccountSwitch',
  run: async ({ env }) => {
    for (const userId of await switchingUserIds(env)) {
      const summary = Result.unsafeUnwrap(await createUseCase(env, userId).run());
      switch (summary.status) {
        case 'idle':
        case 'waiting':
          continue;
        case 'timeBudget':
          console.info(JSON.stringify({ event: 'bluesky_account_switch_purge_continues', userId, ...summary }));
          continue;
        case 'failed':
          console.error(JSON.stringify({ event: 'bluesky_account_switch_purge_failed', userId, ...summary }));
          continue;
        case 'completed':
          console.info(JSON.stringify({ event: 'bluesky_account_switch_completed', userId, ...summary }));
          continue;
      }
    }
  },
});

export const purgeBlueskyAccountSwitchTask = createPurgeBlueskyAccountSwitchTask(
  createPurgeBlueskyAccountSwitchUseCase,
);

/** だれかがアカウントを切り替えている途中か。クロスポストの再送は、切り替えの後始末と重ならないよう止める */
const isBlueskyAccountSwitching = async (env: IoriWorkerEnv): Promise<boolean> =>
  (await resolveSwitchingUserIds(env)).length > 0;

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
