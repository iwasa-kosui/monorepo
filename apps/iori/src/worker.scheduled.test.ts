import type { ExecutionContext, ScheduledController } from '@cloudflare/workers-types';
import { beforeEach, expect, it, vi } from 'vitest';

import { admissionFixture } from './testing/admissionFixture.ts';
import worker from './worker.ts';

const { task } = vi.hoisted(() => ({
  task: vi.fn(async (_context: import('./scheduled/scheduledTasks.ts').ScheduledTaskContext) => undefined),
}));

vi.mock('./runtime/workerRuntime.ts', () => ({ createWorkerRuntimePorts: vi.fn() }));
vi.mock('./federation.cloudflare.ts', () => ({ processCloudflareFedifyQueueBatch: vi.fn() }));
vi.mock('./scheduled/scheduledTasks.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./scheduled/scheduledTasks.ts')>()),
  scheduledTasks: { '0 * * * *': [{ name: 'test-task', run: task }] },
}));

const controller = { cron: '0 * * * *', scheduledTime: Date.UTC(2026, 0, 1) } as ScheduledController;

beforeEach(() => vi.clearAllMocks());

it.each(['sealed', 'smoke', 'invalid'])('does not dispatch scheduled tasks in %s mode', async (mode) => {
  await worker.scheduled(
    controller,
    { ...admissionFixture(), IORI_ADMISSION_MODE: mode } as never,
    {} as ExecutionContext,
  );
  expect(task).not.toHaveBeenCalled();
});

it('does not dispatch scheduled tasks without an admission identity', async () => {
  await worker.scheduled(controller, {} as never, {} as ExecutionContext);
  expect(task).not.toHaveBeenCalled();
});

it('runs the tasks registered for the cron in active mode', async () => {
  const waitUntil = vi.fn();
  const env = admissionFixture() as never;
  await worker.scheduled(controller, env, { waitUntil } as never);
  expect(task).toHaveBeenCalledOnce();
  const context = task.mock.calls[0]![0];
  expect(context.env).toBe(env);
  expect(context.scheduledTime).toEqual(new Date(Date.UTC(2026, 0, 1)));
  const pending = Promise.resolve();
  context.waitUntil(pending);
  expect(waitUntil).toHaveBeenCalledWith(pending);
});

it('does nothing for a cron without registered tasks', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  await worker.scheduled(
    { ...controller, cron: '5 * * * *' } as ScheduledController,
    admissionFixture() as never,
    {} as ExecutionContext,
  );
  expect(task).not.toHaveBeenCalled();
  expect(warn).toHaveBeenCalledWith('iori scheduled: no task for cron.', { cron: '5 * * * *' });
});
