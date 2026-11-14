import { RA } from '@iwasa-kosui/result';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CollectBlueskyNotificationsUseCase } from '../useCase/collectBlueskyNotifications.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';
import { collectBlueskyNotificationsTask, createCollectBlueskyNotificationsTask } from './blueskyNotificationTasks.ts';
import { type ScheduledTaskContext } from './scheduledTasks.ts';

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
});
