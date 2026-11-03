import { afterEach, describe, expect, it, vi } from 'vitest';

import { dispatchScheduled, type ScheduledTaskContext } from './scheduledTasks.ts';

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
});
