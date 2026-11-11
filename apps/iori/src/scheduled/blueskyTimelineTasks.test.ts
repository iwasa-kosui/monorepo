import { RA } from '@iwasa-kosui/result';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CollectBlueskyTimelineUseCase } from '../useCase/collectBlueskyTimeline.ts';
import type { ExpireBlueskyTimelineUseCase } from '../useCase/expireBlueskyTimeline.ts';
import type { SyncBlueskyMutedActorsUseCase } from '../useCase/syncBlueskyMutedActors.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';
import {
  collectBlueskyTimelineTask,
  createCollectBlueskyTimelineTask,
  createExpireBlueskyTimelineTask,
  createSyncBlueskyMutedActorsTask,
  expireBlueskyTimelineTask,
  syncBlueskyMutedActorsTask,
} from './blueskyTimelineTasks.ts';
import { dispatchScheduled, type ScheduledTaskContext, scheduledTasks } from './scheduledTasks.ts';

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

  it('1 分ごとの cron にだけ登録されている', () => {
    const everyMinute = scheduledTasks['* * * * *']!.map((task) => task.name);
    expect(everyMinute).toEqual(['collectBlueskyTimeline', 'collectBlueskyNotifications', 'syncBlueskyMutedActors']);
    const threeHourly = scheduledTasks['0 0,3,6,9,12,15,18,21 * * *']!.map((task) => task.name);
    expect(threeHourly).not.toContain('collectBlueskyTimeline');
  });
});

describe('expireBlueskyTimelineTask', () => {
  it('無効な設定のときは、DB に触れず、無効であることをログに出す', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    await expireBlueskyTimelineTask.run(contextWith({}));

    expect(info).toHaveBeenCalledWith('iori bluesky timeline is disabled.');
  });

  it('use case があるときは期限切れの削除を 1 回実行する', async () => {
    const run = vi.fn(async () => RA.ok(undefined));
    const createUseCase = vi.fn(() => ({ run }) as unknown as ExpireBlueskyTimelineUseCase);
    const context = {
      ...contextWith({ IORI_BLUESKY_TIMELINE: 'enabled' }),
      env: { IORI_BLUESKY_TIMELINE: 'enabled' } as never,
    };

    await createExpireBlueskyTimelineTask(createUseCase).run(context);

    expect(createUseCase).toHaveBeenCalledWith(context.env);
    expect(run).toHaveBeenCalledOnce();
  });

  it('3 時間ごとの cron にだけ登録されている', () => {
    const threeHourly = scheduledTasks['0 0,3,6,9,12,15,18,21 * * *']!.map((task) => task.name);
    expect(threeHourly).toContain('expireBlueskyTimeline');
    expect(threeHourly).toContain('retryBlueskyCrossposts');
    expect(scheduledTasks['* * * * *']!.map((task) => task.name)).not.toContain('expireBlueskyTimeline');
  });
});

describe('syncBlueskyMutedActorsTask', () => {
  it('無効な設定のときは、DB に触れず、無効であることをログに出す', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    await syncBlueskyMutedActorsTask.run(contextWith({}));

    expect(info).toHaveBeenCalledWith('iori bluesky timeline is disabled.');
  });

  it('同期に失敗したら、理由をログに出して例外にしない', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const run = vi.fn(async () =>
      RA.err({ type: 'BlueskyClientError', kind: 'http', message: 'app.bsky.graph.getMutes failed: status 500' })
    );
    const task = createSyncBlueskyMutedActorsTask(() => ({ run }) as unknown as SyncBlueskyMutedActorsUseCase);

    await task.run(contextWith({ IORI_BLUESKY_TIMELINE: 'enabled' }));

    expect(error).toHaveBeenCalledWith(
      'iori bluesky muted actors: sync failed. app.bsky.graph.getMutes failed: status 500',
    );
  });

  it('ミュートが変わらなかった実行ではログを出さない', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const run = vi.fn(async () => RA.ok({ muted: 2, added: 0, removed: 0 }));
    const task = createSyncBlueskyMutedActorsTask(() => ({ run }) as unknown as SyncBlueskyMutedActorsUseCase);

    await task.run(contextWith({ IORI_BLUESKY_TIMELINE: 'enabled' }));

    expect(run).toHaveBeenCalledOnce();
    expect(info).not.toHaveBeenCalled();
  });
});

describe('dispatchScheduled with the registered table', () => {
  const ranNames = async (cron: string): Promise<string[]> => {
    const ran: string[] = [];
    for (const tasks of Object.values(scheduledTasks)) {
      for (const task of tasks) {
        vi.spyOn(task, 'run').mockImplementation(async () => {
          ran.push(task.name);
        });
      }
    }
    await dispatchScheduled(cron, scheduledTasks, contextWith({}));
    return ran;
  };

  it('* * * * * では取り込みとミュートの同期だけが動く', async () => {
    expect(await ranNames('* * * * *')).toEqual([
      'collectBlueskyTimeline',
      'collectBlueskyNotifications',
      'syncBlueskyMutedActors',
    ]);
  });

  it('3 時間ごとの式では、期限切れの削除と crosspost の再試行が動き、取り込みは動かない', async () => {
    const ran = await ranNames('0 0,3,6,9,12,15,18,21 * * *');
    expect(ran).toContain('expireBlueskyTimeline');
    expect(ran).toContain('retryBlueskyCrossposts');
    expect(ran).not.toContain('collectBlueskyTimeline');
  });
});
