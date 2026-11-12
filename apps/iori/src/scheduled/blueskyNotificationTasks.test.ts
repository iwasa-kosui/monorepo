import { RA } from '@iwasa-kosui/result';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CollectBlueskyNotificationsUseCase } from '../useCase/collectBlueskyNotifications.ts';
import type { ExpireBlueskyNotificationReceiptsUseCase } from '../useCase/expireBlueskyNotificationReceipts.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';
import {
  collectBlueskyNotificationsTask,
  createCollectBlueskyNotificationsTask,
  createExpireBlueskyNotificationReceiptsTask,
  expireBlueskyNotificationReceiptsTask,
} from './blueskyNotificationTasks.ts';
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

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const recorderStub = () => ({
  succeededStore: { save: vi.fn(async () => RA.ok(undefined)) },
  failedStore: { save: vi.fn(async () => RA.ok(undefined)) },
});

const NOW = Date.UTC(2026, 10, 12, 3, 4, 5);

describe('collectBlueskyNotificationsTask', () => {
  it.each([
    [{}],
    [{ IORI_BLUESKY_TIMELINE: 'disabled', BLUESKY_IDENTIFIER: 'id', BLUESKY_APP_PASSWORD: 'pw' }],
    [{ IORI_BLUESKY_TIMELINE: 'enabled' }],
    [{ IORI_BLUESKY_CROSSPOST: 'enabled', BLUESKY_IDENTIFIER: 'id', BLUESKY_APP_PASSWORD: 'pw' }],
  ])('無効な設定 %j のときは、DB にも fetch にも触れず、無効であることをログに出す', async (env) => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('fetch must not be called');
    });

    await collectBlueskyNotificationsTask.run(contextWith(env));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledOnce();
    expect(info).toHaveBeenCalledWith('iori bluesky notifications are disabled.');
  });

  it('use case があるときは取り込みを 1 回実行し、結果をログに出す', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const summary = { pages: 1, fetched: 10, saved: 3, dropped: 1, pushed: 2 };
    const run = vi.fn(async () => RA.ok(summary));
    const createUseCase = vi.fn(() => ({ run }) as unknown as CollectBlueskyNotificationsUseCase);
    const context = {
      ...contextWith({ IORI_BLUESKY_TIMELINE: 'enabled' }),
      env: { IORI_BLUESKY_TIMELINE: 'enabled' } as never,
    };

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    const recorder = recorderStub();

    await createCollectBlueskyNotificationsTask(createUseCase, () => recorder).run(context);

    expect(createUseCase).toHaveBeenCalledWith(context.env);
    expect(run).toHaveBeenCalledOnce();
    expect(info).toHaveBeenCalledWith('iori bluesky notifications collected.', summary);
    expect(recorder.succeededStore.save).toHaveBeenCalledOnce();
    expect(recorder.succeededStore.save).toHaveBeenCalledWith('notifications', NOW);
    expect(recorder.failedStore.save).not.toHaveBeenCalled();
  });

  it('取り込みが失敗したら、秘密を含まない短い文字列を console.error に 1 回だけ出す', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const run = vi.fn(async () =>
      RA.err({
        type: 'BlueskyClientError' as const,
        kind: 'auth' as const,
        message: 'app.bsky.notification.listNotifications failed: status 401 ExpiredToken',
        status: 401,
        code: 'ExpiredToken',
      })
    );
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    const recorder = recorderStub();
    const task = createCollectBlueskyNotificationsTask(
      () => ({ run }) as unknown as CollectBlueskyNotificationsUseCase,
      () => recorder,
    );

    await task.run(contextWith({ IORI_BLUESKY_TIMELINE: 'enabled' }));

    expect(error).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith(
      'iori bluesky notifications: collection failed. app.bsky.notification.listNotifications failed: status 401 ExpiredToken',
    );
    expect(recorder.failedStore.save).toHaveBeenCalledOnce();
    expect(recorder.failedStore.save).toHaveBeenCalledWith('notifications', NOW, 'auth', 'ExpiredToken');
    expect(recorder.succeededStore.save).not.toHaveBeenCalled();
  });

  it('失敗にコードが無ければ、コードを null にして記録する', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const run = vi.fn(async () =>
      RA.err({
        type: 'BlueskyClientError' as const,
        kind: 'http' as const,
        message: 'listNotifications failed: status 502',
        status: 502,
      })
    );
    const recorder = recorderStub();
    const task = createCollectBlueskyNotificationsTask(
      () => ({ run }) as unknown as CollectBlueskyNotificationsUseCase,
      () => recorder,
    );

    await task.run(contextWith({ IORI_BLUESKY_TIMELINE: 'enabled' }));

    expect(recorder.failedStore.save).toHaveBeenCalledWith('notifications', expect.any(Number), 'http', null);
  });

  it('無効なときは、記録の保存先を作らない', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const createRecorder = vi.fn(recorderStub);

    await createCollectBlueskyNotificationsTask(() => undefined, createRecorder).run(contextWith({}));

    expect(createRecorder).not.toHaveBeenCalled();
  });

  it('1 分ごとの cron でタイムラインの取り込みの後に動き、3 時間ごとの cron には登録されていない', () => {
    const everyMinute = scheduledTasks['* * * * *']!;
    expect(everyMinute.map((task) => [task.name, task.after])).toEqual([
      ['collectBlueskyTimeline', undefined],
      ['collectBlueskyNotifications', 'collectBlueskyTimeline'],
    ]);
    const threeHourly = scheduledTasks['0 0,3,6,9,12,15,18,21 * * *']!.map((task) => task.name);
    expect(threeHourly).not.toContain('collectBlueskyNotifications');
  });
});

describe('expireBlueskyNotificationReceiptsTask', () => {
  it('無効な設定のときは、DB に触れず、無効であることをログに出す', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    await expireBlueskyNotificationReceiptsTask.run(contextWith({}));

    expect(info).toHaveBeenCalledWith('iori bluesky notifications are disabled.');
  });

  it('use case があるときは期限切れの削除を 1 回実行する', async () => {
    const run = vi.fn(async () => RA.ok(undefined));
    const createUseCase = vi.fn(() => ({ run }) as unknown as ExpireBlueskyNotificationReceiptsUseCase);
    const context = {
      ...contextWith({ IORI_BLUESKY_TIMELINE: 'enabled' }),
      env: { IORI_BLUESKY_TIMELINE: 'enabled' } as never,
    };

    await createExpireBlueskyNotificationReceiptsTask(createUseCase).run(context);

    expect(createUseCase).toHaveBeenCalledWith(context.env);
    expect(run).toHaveBeenCalledOnce();
  });

  it('3 時間ごとの cron にだけ登録されている', () => {
    const threeHourly = scheduledTasks['0 0,3,6,9,12,15,18,21 * * *']!.map((task) => task.name);
    expect(threeHourly).toContain('expireBlueskyNotificationReceipts');
    expect(scheduledTasks['* * * * *']!.map((task) => task.name)).not.toContain(
      'expireBlueskyNotificationReceipts',
    );
  });
});
