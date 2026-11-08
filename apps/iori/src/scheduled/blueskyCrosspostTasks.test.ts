import { RA } from '@iwasa-kosui/result';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BlueskyCrosspostUseCases } from '../runtime/blueskyCrosspost.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';
import { createRetryBlueskyCrosspostsTask, retryBlueskyCrosspostsTask } from './blueskyCrosspostTasks.ts';
import { type ScheduledTaskContext, scheduledTasks } from './scheduledTasks.ts';

const untouchable = (name: string) =>
  new Proxy({}, {
    get: () => {
      throw new Error(`${name} must not be touched`);
    },
  });

const contextWith = (env: Partial<IoriWorkerEnv>): ScheduledTaskContext => ({
  env: { DB: untouchable('DB'), UPLOADS: untouchable('UPLOADS'), ...env } as never,
  scheduledTime: new Date('2026-01-01T00:00:00Z'),
  waitUntil: () => undefined,
});

afterEach(() => vi.restoreAllMocks());

describe('retryBlueskyCrosspostsTask', () => {
  it.each([
    [{}],
    [{ IORI_BLUESKY_CROSSPOST: 'disabled', BLUESKY_IDENTIFIER: 'id', BLUESKY_APP_PASSWORD: 'pw' }],
    [{ IORI_BLUESKY_CROSSPOST: 'ENABLED', BLUESKY_IDENTIFIER: 'id', BLUESKY_APP_PASSWORD: 'pw' }],
    [{ IORI_BLUESKY_CROSSPOST: 'enabled' }],
    [{ IORI_BLUESKY_CROSSPOST: 'enabled', BLUESKY_IDENTIFIER: 'id' }],
    [{ IORI_BLUESKY_CROSSPOST: 'enabled', BLUESKY_IDENTIFIER: '', BLUESKY_APP_PASSWORD: 'pw' }],
    [{ IORI_BLUESKY_CROSSPOST: 'enabled', BLUESKY_IDENTIFIER: 'id', BLUESKY_APP_PASSWORD: ' ' }],
  ])('無効な設定 %j のときは、DB にも R2 にも触れず、無効であることをログに出す', async (env) => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    await retryBlueskyCrosspostsTask.run(contextWith(env));

    expect(info).toHaveBeenCalledOnce();
    expect(info).toHaveBeenCalledWith('iori bluesky crosspost is disabled.');
  });

  it('use case が無いときは再送せず、無効であることをログに出す', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const task = createRetryBlueskyCrosspostsTask(() => undefined);

    await task.run(contextWith({}));

    expect(info).toHaveBeenCalledWith('iori bluesky crosspost is disabled.');
  });

  it('use case があるときは再送を 1 回実行し、結果をログに出す', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const summary = { sent: 2, failed: 1, skipped: 0, gone: 0, noop: 0 };
    const retry = { run: vi.fn(async () => RA.ok(summary)) };
    const waitUntil = vi.fn();
    const createUseCases = vi.fn(() => ({ retry }) as unknown as BlueskyCrosspostUseCases);
    const task = createRetryBlueskyCrosspostsTask(createUseCases);
    const context = {
      ...contextWith({ IORI_BLUESKY_CROSSPOST: 'enabled', DB: {} as never, UPLOADS: {} as never }),
      waitUntil,
    };

    await task.run(context);

    expect(createUseCases).toHaveBeenCalledWith(context.env, waitUntil);
    expect(retry.run).toHaveBeenCalledOnce();
    expect(info).toHaveBeenCalledWith('iori bluesky crossposts retried.', summary);
  });

  it('3 時間ごとの cron に登録されている', () => {
    const names = scheduledTasks['0 0,3,6,9,12,15,18,21 * * *']!.map((task) => task.name);
    expect(names).toContain('retryBlueskyCrossposts');
  });
});
