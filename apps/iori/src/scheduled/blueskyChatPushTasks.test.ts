import { RA } from '@iwasa-kosui/result';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UserId } from '../domain/user/userId.ts';
import type { BlueskyAccountConfig } from '../runtime/blueskyCredential.ts';
import type { CollectBlueskyChatPushUseCase } from '../useCase/collectBlueskyChatPush.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';
import { collectBlueskyChatPushTask, createCollectBlueskyChatPushTask } from './blueskyChatPushTasks.ts';
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

afterEach(() => vi.restoreAllMocks());

const VALID_KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
const ENABLED = { IORI_BLUESKY_TIMELINE: 'enabled', BLUESKY_CREDENTIAL_KEY: VALID_KEY };
const ALICE = UserId.orThrow('00000000-0000-4000-8000-000000000001');
const BOB = UserId.orThrow('00000000-0000-4000-8000-000000000002');
const accountOf = (userId: UserId): BlueskyAccountConfig => ({
  userId,
  envCredentials: undefined,
  credentialKey: VALID_KEY,
});
const SUMMARY = { skipped: null, fetched: 1, notified: 1, pushed: 1 };

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

  it('listAccounts が返すユーザーごとに、そのユーザーのアカウントで動かす', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const runs: string[] = [];
    const task = createCollectBlueskyChatPushTask(
      (_env, account) =>
        ({
          run: async () => {
            runs.push(account.userId);
            return RA.ok(SUMMARY);
          },
        }) as unknown as CollectBlueskyChatPushUseCase,
      async () => [accountOf(ALICE), accountOf(BOB)],
    );

    await task.run(contextWith(ENABLED));

    expect(runs).toEqual([ALICE, BOB]);
    expect(info).toHaveBeenCalledWith('iori bluesky chat push collected.', { userId: ALICE, ...SUMMARY });
    expect(info).toHaveBeenCalledWith('iori bluesky chat push collected.', { userId: BOB, ...SUMMARY });
  });

  it('1 人が例外で失敗しても、ほかのユーザーは動く', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const runs: string[] = [];
    const task = createCollectBlueskyChatPushTask(
      (_env, account) =>
        ({
          run: async () => {
            runs.push(account.userId);
            if (account.userId === ALICE) throw new Error('D1_ERROR: boom');
            return RA.ok(SUMMARY);
          },
        }) as unknown as CollectBlueskyChatPushUseCase,
      async () => [accountOf(ALICE), accountOf(BOB)],
    );

    await task.run(contextWith(ENABLED));

    expect(runs).toEqual([ALICE, BOB]);
    expect(error).toHaveBeenCalledOnce();
    expect(error.mock.calls[0]![1]).toMatchObject({ userId: ALICE });
  });
});
