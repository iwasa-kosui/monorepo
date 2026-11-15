import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  countBlueskyData,
  insertBlueskyAccountSwitch,
  seedBlueskyData,
} from '../adaptor/d1/__tests__/blueskyAccountSwitchFixture.ts';
import { createSqliteD1Fixture } from '../adaptor/d1/__tests__/sqliteFixture.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';
import { purgeBlueskyAccountSwitchTask } from './blueskyAccountSwitchTasks.ts';
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

const OWNER_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_ID = '00000000-0000-4000-8000-000000000002';

/** 環境変数の資格情報の持ち主（kosui）と、もう 1 人のユーザーがいる D1 */
const newFixture = () => {
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  fixture.sqlite.prepare('INSERT INTO users(userId,username) VALUES (?,?)').run(OWNER_ID, 'kosui');
  fixture.sqlite.prepare('INSERT INTO users(userId,username) VALUES (?,?)').run(OTHER_ID, 'alice');
  return fixture;
};

describe('毎分の cron', () => {
  const enabledEnv = (fixture: ReturnType<typeof newFixture>): Partial<IoriWorkerEnv> => ({
    DB: fixture.binding,
    IORI_BLUESKY_TIMELINE: 'enabled',
    BLUESKY_IDENTIFIER: 'env.example.com',
    BLUESKY_APP_PASSWORD: 'env-app-password',
  });

  it('切り替えの印があるあいだは、タイムラインと通知の取り込みで Bluesky を呼ばない', async () => {
    const fixture = newFixture();
    insertBlueskyAccountSwitch(fixture.sqlite, OWNER_ID, { startedAt: Date.now() });
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
    insertBlueskyAccountSwitch(fixture.sqlite, OWNER_ID, { startedAt: Date.now() - 30_000 });
    seedBlueskyData(fixture.sqlite, OWNER_ID, { timelineItems: 5, likes: 5 });

    await purgeBlueskyAccountSwitchTask.run(contextFor({ DB: fixture.binding }));

    expect(countBlueskyData(fixture.sqlite, OWNER_ID)).toMatchObject({ timelineItems: 5, likes: 5 });
    expect(fixture.sqlite.prepare('SELECT * FROM bluesky_account_switch').all()).toHaveLength(1);
  });

  it('90 秒が経っていれば削除し、完了を JSON でログに出して印を消す', async () => {
    const fixture = newFixture();
    insertBlueskyAccountSwitch(fixture.sqlite, OWNER_ID, { startedAt: Date.now() - 100_000 });
    seedBlueskyData(fixture.sqlite, OWNER_ID, { timelineItems: 5, likes: 2 });
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    await purgeBlueskyAccountSwitchTask.run(contextFor({ DB: fixture.binding }));

    expect(countBlueskyData(fixture.sqlite, OWNER_ID)).toMatchObject({ timelineItems: 0, likes: 0 });
    expect(fixture.sqlite.prepare('SELECT * FROM bluesky_account_switch').all()).toEqual([]);
    const logged = JSON.parse(info.mock.calls[0]![0] as string);
    expect(logged).toMatchObject({
      event: 'bluesky_account_switch_completed',
      fromDid: 'did:plc:old',
      toDid: 'did:plc:alice',
      deletedCounts: { timelineItems: 5, likes: 2 },
    });
  });

  it('削除のタスクは、切り替え中のユーザーごとにそのユーザーの行だけを消し、切り替えていないユーザーの行は残す', async () => {
    const fixture = newFixture();
    const third = '00000000-0000-4000-8000-000000000003';
    fixture.sqlite.prepare('INSERT INTO users(userId,username) VALUES (?,?)').run(third, 'bob');
    insertBlueskyAccountSwitch(fixture.sqlite, OWNER_ID, { startedAt: Date.now() - 100_000 });
    insertBlueskyAccountSwitch(fixture.sqlite, OTHER_ID, { startedAt: Date.now() - 100_000 });
    seedBlueskyData(fixture.sqlite, OWNER_ID, { timelineItems: 3, likes: 1 });
    seedBlueskyData(fixture.sqlite, OTHER_ID, { timelineItems: 2, likes: 2 });
    seedBlueskyData(fixture.sqlite, third, { timelineItems: 4, likes: 1 });
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    await purgeBlueskyAccountSwitchTask.run(contextFor({ DB: fixture.binding }));

    expect(countBlueskyData(fixture.sqlite, OWNER_ID)).toMatchObject({ timelineItems: 0, likes: 0 });
    expect(countBlueskyData(fixture.sqlite, OTHER_ID)).toMatchObject({ timelineItems: 0, likes: 0 });
    expect(countBlueskyData(fixture.sqlite, third)).toMatchObject({ timelineItems: 4, likes: 1 });
    expect(fixture.sqlite.prepare('SELECT * FROM bluesky_account_switch').all()).toEqual([]);
    const completed = info.mock.calls.map(([line]) => JSON.parse(line as string)).filter((logged) =>
      logged.event === 'bluesky_account_switch_completed'
    );
    expect(completed.map((logged) => [logged.userId, logged.deletedCounts.timelineItems]).sort()).toEqual([
      [OWNER_ID, 3],
      [OTHER_ID, 2],
    ]);
  });
});
