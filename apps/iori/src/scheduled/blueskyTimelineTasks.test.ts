import { RA } from '@iwasa-kosui/result';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CollectBlueskyTimelineUseCase } from '../useCase/collectBlueskyTimeline.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';
import { collectBlueskyTimelineTask, createCollectBlueskyTimelineTask } from './blueskyTimelineTasks.ts';
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

describe('collectBlueskyTimelineTask', () => {
  it.each([
    [{}],
    [{ IORI_BLUESKY_TIMELINE: 'disabled', BLUESKY_IDENTIFIER: 'id', BLUESKY_APP_PASSWORD: 'pw' }],
    [{ IORI_BLUESKY_TIMELINE: 'ENABLED', BLUESKY_IDENTIFIER: 'id', BLUESKY_APP_PASSWORD: 'pw' }],
    [{ IORI_BLUESKY_TIMELINE: 'enabled' }],
    [{ IORI_BLUESKY_TIMELINE: 'enabled', BLUESKY_IDENTIFIER: 'id' }],
    [{ IORI_BLUESKY_TIMELINE: 'enabled', BLUESKY_IDENTIFIER: '', BLUESKY_APP_PASSWORD: 'pw' }],
    [{ IORI_BLUESKY_TIMELINE: 'enabled', BLUESKY_IDENTIFIER: 'id', BLUESKY_APP_PASSWORD: ' ' }],
    [{ IORI_BLUESKY_CROSSPOST: 'enabled', BLUESKY_IDENTIFIER: 'id', BLUESKY_APP_PASSWORD: 'pw' }],
  ])('無効な設定 %j のときは、DB にも fetch にも触れず、無効であることをログに出す', async (env) => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('fetch must not be called');
    });

    await collectBlueskyTimelineTask.run(contextWith(env));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledOnce();
    expect(info).toHaveBeenCalledWith('iori bluesky timeline is disabled.');
  });

  it('use case があるときは取り込みを 1 回実行し、結果をログに出す', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const summary = { pages: 2, fetched: 150, saved: 120, dropped: 1 };
    const run = vi.fn(async () => RA.ok(summary));
    const createUseCase = vi.fn(() => ({ run }) as unknown as CollectBlueskyTimelineUseCase);
    const context = {
      ...contextWith({ IORI_BLUESKY_TIMELINE: 'enabled' }),
      env: { IORI_BLUESKY_TIMELINE: 'enabled' } as never,
    };

    await createCollectBlueskyTimelineTask(createUseCase).run(context);

    expect(createUseCase).toHaveBeenCalledWith(context.env);
    expect(run).toHaveBeenCalledOnce();
    expect(info).toHaveBeenCalledWith('iori bluesky timeline collected.', summary);
  });

  it('取り込みが失敗したら、秘密を含まない短い文字列を console.error に 1 回だけ出す', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const run = vi.fn(async () =>
      RA.err({
        type: 'BlueskyClientError' as const,
        kind: 'auth' as const,
        message: 'app.bsky.feed.getTimeline failed: status 401 ExpiredToken',
        status: 401,
      })
    );
    const task = createCollectBlueskyTimelineTask(() => ({ run }) as unknown as CollectBlueskyTimelineUseCase);

    await task.run(contextWith({ IORI_BLUESKY_TIMELINE: 'enabled' }));

    expect(error).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith(
      'iori bluesky timeline: collection failed. app.bsky.feed.getTimeline failed: status 401 ExpiredToken',
    );
  });

  it('3 時間ごとの cron に登録されている', () => {
    const names = scheduledTasks['0 0,3,6,9,12,15,18,21 * * *']!.map((task) => task.name);
    expect(names).toContain('collectBlueskyTimeline');
  });
});
