import { RA } from '@iwasa-kosui/result';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UserId } from '../domain/user/userId.ts';
import type { BlueskyAccountConfig } from '../runtime/blueskyCredential.ts';
import type { CollectBlueskyTimelineUseCase } from '../useCase/collectBlueskyTimeline.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';
import { collectBlueskyTimelineTask, createCollectBlueskyTimelineTask } from './blueskyTimelineTasks.ts';
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
const SUMMARY = { pages: 2, fetched: 150, saved: 120, dropped: 1 };
const VALID_KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
const ENABLED = { IORI_BLUESKY_TIMELINE: 'enabled', BLUESKY_CREDENTIAL_KEY: VALID_KEY };
const ALICE = UserId.orThrow('00000000-0000-4000-8000-000000000001');
const BOB = UserId.orThrow('00000000-0000-4000-8000-000000000002');
const accountOf = (userId: UserId): BlueskyAccountConfig => ({
  userId,
  envCredentials: undefined,
  credentialKey: VALID_KEY,
});

describe('collectBlueskyTimelineTask', () => {
  it.each([
    [{}],
    [{ IORI_BLUESKY_TIMELINE: 'enabled' }],
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

  describe('ユーザーごとの取り込み', () => {
    const setupTask = (behaviors: Record<string, () => ReturnType<CollectBlueskyTimelineUseCase['run']>>) => {
      const recorders = new Map<string, ReturnType<typeof recorderStub>>();
      const runs: string[] = [];
      const task = createCollectBlueskyTimelineTask(
        (_env, account) =>
          ({
            run: () => {
              runs.push(account.userId);
              return behaviors[account.userId]!();
            },
          }) as unknown as CollectBlueskyTimelineUseCase,
        (_env, userId) => {
          const recorder = recorderStub();
          recorders.set(userId, recorder);
          return recorder;
        },
        async () => [accountOf(ALICE), accountOf(BOB)],
      );
      return { task, recorders, runs };
    };

    it('listAccounts が返すユーザーごとに取り込み、それぞれのユーザーの同期状態に成功を記録する', async () => {
      vi.spyOn(console, 'info').mockImplementation(() => undefined);
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(NOW);
      const t = setupTask({ [ALICE]: async () => RA.ok(SUMMARY), [BOB]: async () => RA.ok(SUMMARY) });

      await t.task.run(contextWith(ENABLED));

      expect(t.runs).toEqual([ALICE, BOB]);
      for (const userId of [ALICE, BOB]) {
        expect(t.recorders.get(userId)!.succeededStore.save).toHaveBeenCalledWith('timeline', NOW);
        expect(t.recorders.get(userId)!.failedStore.save).not.toHaveBeenCalled();
      }
    });

    it('1 人の取り込みが例外で失敗しても、ほかのユーザーの取り込みは続ける', async () => {
      vi.spyOn(console, 'info').mockImplementation(() => undefined);
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(NOW);
      const t = setupTask({
        [ALICE]: async () => {
          throw new Error('D1_ERROR: boom');
        },
        [BOB]: async () => RA.ok(SUMMARY),
      });

      await t.task.run(contextWith(ENABLED));

      expect(t.runs).toEqual([ALICE, BOB]);
      expect(t.recorders.get(BOB)!.succeededStore.save).toHaveBeenCalledWith('timeline', NOW);
      expect(error).toHaveBeenCalledOnce();
      expect(error.mock.calls[0]![1]).toMatchObject({ userId: ALICE });
    });

    it('取り込みが Err なら、秘密を含まない短い文字列を console.error に出し、そのユーザーにだけ失敗を記録する', async () => {
      vi.spyOn(console, 'info').mockImplementation(() => undefined);
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(NOW);
      const t = setupTask({
        [ALICE]: async () =>
          RA.err({
            type: 'BlueskyClientError' as const,
            kind: 'auth' as const,
            message: 'app.bsky.feed.getTimeline failed: status 401 ExpiredToken',
            status: 401,
            code: 'ExpiredToken',
          }),
        [BOB]: async () => RA.ok(SUMMARY),
      });

      await t.task.run(contextWith(ENABLED));

      expect(error).toHaveBeenCalledOnce();
      expect(error).toHaveBeenCalledWith(
        'iori bluesky timeline: collection failed. app.bsky.feed.getTimeline failed: status 401 ExpiredToken',
        { userId: ALICE },
      );
      expect(t.recorders.get(ALICE)!.failedStore.save).toHaveBeenCalledWith('timeline', NOW, 'auth', 'ExpiredToken');
      expect(t.recorders.get(ALICE)!.succeededStore.save).not.toHaveBeenCalled();
      expect(t.recorders.get(BOB)!.succeededStore.save).toHaveBeenCalledWith('timeline', NOW);
      expect(t.recorders.get(BOB)!.failedStore.save).not.toHaveBeenCalled();
    });
  });
});
