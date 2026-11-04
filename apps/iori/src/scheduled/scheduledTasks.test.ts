import { afterEach, describe, expect, it, vi } from 'vitest';

import { dispatchScheduled, type ScheduledTaskContext, scheduledTasks } from './scheduledTasks.ts';

const context: ScheduledTaskContext = {
  env: {} as never,
  scheduledTime: new Date('2026-01-01T00:00:00Z'),
  waitUntil: () => undefined,
};

afterEach(() => vi.restoreAllMocks());

describe('dispatchScheduled', () => {
  it('warns and runs nothing for an unknown cron', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const run = vi.fn(async () => undefined);
    await dispatchScheduled('* * * * *', { '0 * * * *': [{ name: 'a', run }] }, context);
    expect(run).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('iori scheduled: no task for cron.', { cron: '* * * * *' });
  });

  it('does not match inherited object keys', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await dispatchScheduled('toString', {}, context);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('runs every task registered for the cron with the context', async () => {
    const first = vi.fn(async () => undefined);
    const second = vi.fn(async () => undefined);
    await dispatchScheduled(
      '0 * * * *',
      { '0 * * * *': [{ name: 'a', run: first }, { name: 'b', run: second }] },
      context,
    );
    expect(first).toHaveBeenCalledWith(context);
    expect(second).toHaveBeenCalledWith(context);
  });

  it('keeps running the other tasks and logs the failure when one task fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failure = new Error('boom');
    const other = vi.fn(async () => undefined);
    await dispatchScheduled('0 * * * *', {
      '0 * * * *': [
        { name: 'bad', run: async () => Promise.reject(failure) },
        { name: 'good', run: other },
      ],
    }, context);
    expect(other).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith('iori scheduled task failed.', {
      cron: '0 * * * *',
      task: 'bad',
      error: failure,
    });
  });

  it('runs a task after the task named in after finishes, while the other tasks start without waiting', async () => {
    const order: string[] = [];
    let finishSync: () => void = () => undefined;
    const syncDone = new Promise<void>((resolve) => {
      finishSync = resolve;
    });
    const sync = vi.fn(async () => {
      order.push('sync:start');
      await syncDone;
      order.push('sync:end');
    });
    const embed = vi.fn(async () => {
      order.push('embed:start');
    });
    const collect = vi.fn(async () => {
      order.push('collect:start');
    });
    const dispatched = dispatchScheduled('0 * * * *', {
      '0 * * * *': [
        { name: 'collect', run: collect },
        { name: 'sync', run: sync },
        { name: 'embed', after: 'sync', run: embed },
      ],
    }, context);
    await vi.waitFor(() => expect(collect).toHaveBeenCalledOnce());
    expect(sync).toHaveBeenCalledOnce();
    expect(embed).not.toHaveBeenCalled();
    finishSync();
    await dispatched;
    expect(embed).toHaveBeenCalledWith(context);
    expect(order).toEqual(['collect:start', 'sync:start', 'sync:end', 'embed:start']);
  });

  it('still runs the task after a failed prerequisite and logs the prerequisite failure', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failure = new Error('sync boom');
    const embed = vi.fn(async () => undefined);
    await dispatchScheduled('0 * * * *', {
      '0 * * * *': [
        { name: 'sync', run: async () => Promise.reject(failure) },
        { name: 'embed', after: 'sync', run: embed },
      ],
    }, context);
    expect(embed).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith('iori scheduled task failed.', {
      cron: '0 * * * *',
      task: 'sync',
      error: failure,
    });
  });

  it('warns and runs the task without a prerequisite when after names no task', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const run = vi.fn(async () => undefined);
    await dispatchScheduled('0 * * * *', {
      '0 * * * *': [{ name: 'embed', after: 'missing', run }],
    }, context);
    expect(run).toHaveBeenCalledWith(context);
    expect(warn).toHaveBeenCalledWith('iori scheduled task prerequisite not found.', {
      cron: '0 * * * *',
      task: 'embed',
      after: 'missing',
    });
  });

  it('logs a failure of the task that runs after its prerequisite under its own name', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failure = new Error('embed boom');
    await dispatchScheduled('0 * * * *', {
      '0 * * * *': [
        { name: 'sync', run: async () => undefined },
        { name: 'embed', after: 'sync', run: async () => Promise.reject(failure) },
      ],
    }, context);
    expect(error).toHaveBeenCalledWith('iori scheduled task failed.', {
      cron: '0 * * * *',
      task: 'embed',
      error: failure,
    });
  });
});

describe('scheduledTasks', () => {
  const entries = Object.entries(scheduledTasks);

  it.each(entries)('%s has no duplicate task names', (_cron, tasks) => {
    const names = tasks.map((task) => task.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it.each(entries)('%s runs each task with after only after the task it names', (_cron, tasks) => {
    tasks.forEach((task, index) => {
      if (task.after === undefined) return;
      expect(tasks.slice(0, index).map((earlier) => earlier.name)).toContain(task.after);
    });
  });

  it('runs embedOwnInterestSources after syncOwnInterestSources in the 3-hourly cron', () => {
    const tasks = scheduledTasks['0 0,3,6,9,12,15,18,21 * * *']!;
    expect(tasks.find((task) => task.name === 'embedOwnInterestSources')?.after).toBe('syncOwnInterestSources');
  });

  it('registers archiveDomainEvents in the 19:00 daily cron', () => {
    expect(scheduledTasks['0 19 * * *']?.map((task) => task.name)).toEqual(['archiveDomainEvents']);
  });
});
