import type { IoriWorkerEnv } from '../workerEnv.ts';
import { postAiAgentMusingTask, respondToAiAgentMentionsTask } from './aiAgentBotTasks.ts';
import { purgeBlueskyAccountSwitchTask, skipWhileBlueskyAccountSwitching } from './blueskyAccountSwitchTasks.ts';
import { collectBlueskyChatPushTask } from './blueskyChatPushTasks.ts';
import { retryBlueskyCrosspostsTask } from './blueskyCrosspostTasks.ts';
import { collectBlueskyNotificationsTask, expireBlueskyNotificationReceiptsTask } from './blueskyNotificationTasks.ts';
import { collectBlueskyTimelineTask, expireBlueskyTimelineTask } from './blueskyTimelineTasks.ts';
import { createDailyDigestTask, expireDigestsTask } from './digestTasks.ts';
import { archiveDomainEventsTask } from './eventArchiveTasks.ts';
import { pruneFederatedPostsTask } from './federatedPostTasks.ts';
import { collectFeedsTask, detectRadarVolumeTask } from './feedTasks.ts';
import {
  embedOwnInterestSourcesTask,
  syncKosuiInterestSourcesTask,
  syncOwnInterestSourcesTask,
} from './interestTasks.ts';

export type ScheduledTaskContext = Readonly<{
  env: IoriWorkerEnv;
  scheduledTime: Date;
  waitUntil: (promise: Promise<unknown>) => void;
}>;
export type ScheduledTask = Readonly<{
  name: string;
  after?: string;
  run: (context: ScheduledTaskContext) => Promise<void>;
}>;
export type ScheduledTaskTable = Readonly<Record<string, readonly ScheduledTask[]>>;

// キーは wrangler の triggers.crons の式と一字一句同じにする（event.cron で照合するため）
export const scheduledTasks: ScheduledTaskTable = {
  '0 0,3,6,9,12,15,18,21 * * *': [
    collectFeedsTask,
    syncOwnInterestSourcesTask,
    { ...embedOwnInterestSourcesTask, after: syncOwnInterestSourcesTask.name },
    pruneFederatedPostsTask,
    skipWhileBlueskyAccountSwitching(retryBlueskyCrosspostsTask),
    expireBlueskyTimelineTask,
    expireBlueskyNotificationReceiptsTask,
    postAiAgentMusingTask,
  ],
  '* * * * *': [
    skipWhileBlueskyAccountSwitching(collectBlueskyTimelineTask),
    skipWhileBlueskyAccountSwitching({ ...collectBlueskyNotificationsTask, after: collectBlueskyTimelineTask.name }),
    skipWhileBlueskyAccountSwitching({
      ...collectBlueskyChatPushTask,
      after: collectBlueskyNotificationsTask.name,
    }),
    purgeBlueskyAccountSwitchTask,
    respondToAiAgentMentionsTask,
  ],
  '0 21 * * *': [syncKosuiInterestSourcesTask],
  '15 20 * * 1': [detectRadarVolumeTask],
  '30 21 * * *': [createDailyDigestTask, expireDigestsTask],
  '0 19 * * *': [archiveDomainEventsTask],
};

export const dispatchScheduled = async (
  cron: string,
  table: ScheduledTaskTable,
  context: ScheduledTaskContext,
): Promise<void> => {
  const tasks = Object.hasOwn(table, cron) ? table[cron] : undefined;
  if (tasks === undefined) {
    console.warn('iori scheduled: no task for cron.', { cron });
    return;
  }
  const runs = new Map<string, Promise<void>>();
  const results = await Promise.allSettled(tasks.map((task) => {
    const prerequisite = task.after === undefined ? undefined : runs.get(task.after);
    if (task.after !== undefined && prerequisite === undefined) {
      console.warn('iori scheduled task prerequisite not found.', { cron, task: task.name, after: task.after });
    }
    const run = prerequisite === undefined
      ? task.run(context)
      : prerequisite.catch(() => undefined).then(() => task.run(context));
    runs.set(task.name, run);
    return run;
  }));
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error('iori scheduled task failed.', { cron, task: tasks[index]!.name, error: result.reason });
    }
  });
};
