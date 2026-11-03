import type { IoriWorkerEnv } from '../workerEnv.ts';
import { collectFeedsTask } from './feedTasks.ts';

export type ScheduledTaskContext = Readonly<{
  env: IoriWorkerEnv;
  scheduledTime: Date;
  waitUntil: (promise: Promise<unknown>) => void;
}>;
export type ScheduledTask = Readonly<{ name: string; run: (context: ScheduledTaskContext) => Promise<void> }>;
export type ScheduledTaskTable = Readonly<Record<string, readonly ScheduledTask[]>>;

// キーは wrangler の triggers.crons の式と一字一句同じにする（event.cron で照合するため）
export const scheduledTasks: ScheduledTaskTable = {
  '0 0,3,6,9,12,15,18,21 * * *': [collectFeedsTask],
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
  const results = await Promise.allSettled(tasks.map((task) => task.run(context)));
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error('iori scheduled task failed.', { cron, task: tasks[index]!.name, error: result.reason });
    }
  });
};
