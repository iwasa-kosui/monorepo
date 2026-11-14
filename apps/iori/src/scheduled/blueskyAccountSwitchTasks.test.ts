import { RA } from '@iwasa-kosui/result';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  countBlueskyData,
  insertBlueskyAccountSwitch,
  seedBlueskyData,
} from '../adaptor/d1/__tests__/blueskyAccountSwitchFixture.ts';
import { createSqliteD1Fixture } from '../adaptor/d1/__tests__/sqliteFixture.ts';
import type { PurgeBlueskyAccountSwitchUseCase } from '../useCase/purgeBlueskyAccountSwitch.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';
import {
  createPurgeBlueskyAccountSwitchTask,
  purgeBlueskyAccountSwitchTask,
  skipWhileBlueskyAccountSwitching,
} from './blueskyAccountSwitchTasks.ts';
import { dispatchScheduled, type ScheduledTaskContext, scheduledTasks } from './scheduledTasks.ts';

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
  vi.restoreAllMocks();
});

const contextFor = (env: Partial<IoriWorkerEnv>): ScheduledTaskContext => ({
  env: env as IoriWorkerEnv,
  scheduledTime: new Date('2026-01-01T00:00:00Z'),
  waitUntil: () => undefined,
});

const newFixture = () => {
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  return fixture;
};

describe('skipWhileBlueskyAccountSwitching', () => {
  it('切り替え中は、包んだタスクを実行せずログに出す', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const run = vi.fn(async () => undefined);
    const task = skipWhileBlueskyAccountSwitching({ name: 'collect', after: 'before', run }, async () => true);

    await task.run(contextFor({}));

    expect(run).not.toHaveBeenCalled();
    expect(task).toMatchObject({ name: 'collect', after: 'before' });
    expect(info).toHaveBeenCalledWith(
      JSON.stringify({ event: 'bluesky_account_switch_task_skipped', task: 'collect' }),
    );
  });

  it('切り替え中でなければ、包んだタスクを実行する', async () => {
    const run = vi.fn(async () => undefined);
    const context = contextFor({});

    await skipWhileBlueskyAccountSwitching({ name: 'collect', run }, async () => false).run(context);

    expect(run).toHaveBeenCalledWith(context);
  });
});

describe('毎分の cron', () => {
  const enabledEnv = (fixture: ReturnType<typeof newFixture>): Partial<IoriWorkerEnv> => ({
    DB: fixture.binding,
    IORI_BLUESKY_TIMELINE: 'enabled',
    BLUESKY_IDENTIFIER: 'env.example.com',
    BLUESKY_APP_PASSWORD: 'env-app-password',
  });

  it('3 時間ごとの cron の crosspost の再試行も、切り替え中は実行しない', async () => {
    const retry = scheduledTasks['0 0,3,6,9,12,15,18,21 * * *']!.find((task) =>
      task.name === 'retryBlueskyCrossposts'
    )!;
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const idle = newFixture();
    await retry.run(contextFor({ DB: idle.binding }));
    expect(info).not.toHaveBeenCalledWith(
      JSON.stringify({ event: 'bluesky_account_switch_task_skipped', task: 'retryBlueskyCrossposts' }),
    );

    const switching = newFixture();
    insertBlueskyAccountSwitch(switching.sqlite, { startedAt: Date.now() });
    await retry.run(contextFor({ DB: switching.binding }));

    expect(info).toHaveBeenCalledWith(
      JSON.stringify({ event: 'bluesky_account_switch_task_skipped', task: 'retryBlueskyCrossposts' }),
    );
  });

  it('取り込みの 3 つのタスクと、切り替えの削除のタスクを登録する', () => {
    expect(scheduledTasks['* * * * *']?.map((task) => task.name)).toEqual([
      'collectBlueskyTimeline',
      'collectBlueskyNotifications',
      'collectBlueskyChatPush',
      'purgeBlueskyAccountSwitch',
      'respondToAiAgentMentions',
    ]);
  });

  it('切り替えの印があるあいだは、タイムラインと通知の取り込みで Bluesky を呼ばない', async () => {
    const fixture = newFixture();
    insertBlueskyAccountSwitch(fixture.sqlite, { startedAt: Date.now() });
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('fetch must not be called');
    });

    await dispatchScheduled('* * * * *', scheduledTasks, contextFor(enabledEnv(fixture)));

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('印が無ければ、取り込みは Bluesky を呼ぶ', async () => {
    const fixture = newFixture();
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 401 }));

    await dispatchScheduled('* * * * *', scheduledTasks, contextFor(enabledEnv(fixture)));

    expect(fetchSpy).toHaveBeenCalled();
  });

  it('開始から 90 秒に満たないあいだは、削除のタスクが何も削除しない', async () => {
    const fixture = newFixture();
    insertBlueskyAccountSwitch(fixture.sqlite, { startedAt: Date.now() - 30_000 });
    seedBlueskyData(fixture.sqlite, { timelineItems: 5, likes: 5 });

    await purgeBlueskyAccountSwitchTask.run(contextFor({ DB: fixture.binding }));

    expect(countBlueskyData(fixture.sqlite)).toMatchObject({ timelineItems: 5, likes: 5 });
    expect(fixture.sqlite.prepare('SELECT * FROM bluesky_account_switch').all()).toHaveLength(1);
  });

  it('90 秒が経っていれば削除し、完了を JSON でログに出して印を消す', async () => {
    const fixture = newFixture();
    insertBlueskyAccountSwitch(fixture.sqlite, { startedAt: Date.now() - 100_000 });
    seedBlueskyData(fixture.sqlite, { timelineItems: 5, likes: 2 });
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    await purgeBlueskyAccountSwitchTask.run(contextFor({ DB: fixture.binding }));

    expect(countBlueskyData(fixture.sqlite)).toMatchObject({ timelineItems: 0, likes: 0 });
    expect(fixture.sqlite.prepare('SELECT * FROM bluesky_account_switch').all()).toEqual([]);
    const logged = JSON.parse(info.mock.calls[0]![0] as string);
    expect(logged).toMatchObject({
      event: 'bluesky_account_switch_completed',
      fromDid: 'did:plc:old',
      toDid: 'did:plc:alice',
      deletedCounts: { timelineItems: 5, likes: 2 },
    });
  });
});

describe('createPurgeBlueskyAccountSwitchTask', () => {
  const run = async (val: Awaited<ReturnType<PurgeBlueskyAccountSwitchUseCase['run']>>['val']) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const useCase = { run: async () => RA.ok(val) } as unknown as PurgeBlueskyAccountSwitchUseCase;
    await createPurgeBlueskyAccountSwitchTask(() => useCase).run(contextFor({}));
    return { error, info };
  };

  it('idle と waiting のときは、何もログに出さない', async () => {
    for (const status of ['idle', 'waiting'] as const) {
      const logs = await run({ status });
      expect(logs.error).not.toHaveBeenCalled();
      expect(logs.info).not.toHaveBeenCalled();
    }
  });

  it('失敗は console.error に JSON で出す', async () => {
    const logs = await run({ status: 'failed', attempts: 31, stalled: true, message: 'Error: boom' });

    expect(logs.error).toHaveBeenCalledWith(
      JSON.stringify({
        event: 'bluesky_account_switch_purge_failed',
        status: 'failed',
        attempts: 31,
        stalled: true,
        message: 'Error: boom',
      }),
    );
  });
});
