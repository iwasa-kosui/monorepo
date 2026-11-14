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
  const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  await worker.scheduled(
    controller,
    { ...admissionFixture(), IORI_ADMISSION_MODE: mode } as never,
    {} as ExecutionContext,
  );
  expect(task).not.toHaveBeenCalled();
  expect(info).toHaveBeenCalledWith(
    'iori scheduled: skipped because admission is not active.',
    expect.objectContaining({ cron: '0 * * * *' }),
  );
});

it('does not dispatch scheduled tasks without an admission identity', async () => {
  const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  await worker.scheduled(controller, {} as never, {} as ExecutionContext);
  expect(task).not.toHaveBeenCalled();
  expect(info).toHaveBeenCalledWith('iori scheduled: skipped because admission is not active.', {
    cron: '0 * * * *',
    mode: undefined,
  });
});

it('runs the tasks registered for the cron in active mode', async () => {
  await worker.scheduled(controller, admissionFixture() as never, { waitUntil: vi.fn() } as never);
  expect(task).toHaveBeenCalledOnce();
});
