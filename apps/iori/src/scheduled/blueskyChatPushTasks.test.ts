import { RA } from '@iwasa-kosui/result';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CollectBlueskyChatPushUseCase } from '../useCase/collectBlueskyChatPush.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';
import { collectBlueskyChatPushTask, createCollectBlueskyChatPushTask } from './blueskyChatPushTasks.ts';
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

describe('collectBlueskyChatPushTask', () => {
  it.each([
    [{}],
    [{ IORI_BLUESKY_TIMELINE: 'disabled', BLUESKY_IDENTIFIER: 'id', BLUESKY_APP_PASSWORD: 'pw' }],
    [{ IORI_BLUESKY_TIMELINE: 'enabled' }],
  ])('無効な設定 %j のときは、DB にも fetch にも触れず、無効であることをログに出す', async (env) => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('fetch must not be called');
    });

    await collectBlueskyChatPushTask.run(contextWith(env));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledOnce();
    expect(info).toHaveBeenCalledWith('iori bluesky chat push is disabled.');
  });

  it('use case があるときは 1 回実行し、結果をログに出す', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const summary = { skipped: null, fetched: 3, notified: 1, pushed: 1 };
    const run = vi.fn(async () => RA.ok(summary));
    const createUseCase = vi.fn(() => ({ run }) as unknown as CollectBlueskyChatPushUseCase);
    const context = {
      ...contextWith({ IORI_BLUESKY_TIMELINE: 'enabled' }),
      env: { IORI_BLUESKY_TIMELINE: 'enabled' } as never,
    };

    await createCollectBlueskyChatPushTask(createUseCase).run(context);

    expect(createUseCase).toHaveBeenCalledWith(context.env);
    expect(run).toHaveBeenCalledOnce();
    expect(info).toHaveBeenCalledWith('iori bluesky chat push collected.', summary);
  });

  it('失敗したら console.error に 1 回だけ出す', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const run = vi.fn(async () =>
      RA.err({ type: 'BlueskyClientError' as const, kind: 'http' as const, message: 'listConvos failed: status 502' })
    );

    await createCollectBlueskyChatPushTask(() => ({ run }) as unknown as CollectBlueskyChatPushUseCase)
      .run(contextWith({ IORI_BLUESKY_TIMELINE: 'enabled' }));

    expect(error).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith('iori bluesky chat push: collection failed. listConvos failed: status 502');
  });

  it('1 分ごとの cron で、通知の取り込みの後に登録されている', () => {
    const everyMinute = scheduledTasks['* * * * *']!;
    expect(everyMinute.find((task) => task.name === 'collectBlueskyChatPush')?.after).toBe(
      'collectBlueskyNotifications',
    );
    expect(scheduledTasks['0 0,3,6,9,12,15,18,21 * * *']!.map((task) => task.name)).not.toContain(
      'collectBlueskyChatPush',
    );
  });
});
