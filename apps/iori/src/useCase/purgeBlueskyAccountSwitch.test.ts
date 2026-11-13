import { Result } from '@iwasa-kosui/result';
import { afterEach, describe, expect, it } from 'vitest';

import {
  countBlueskyData,
  insertBlueskyAccountSwitch,
  seedBlueskyData,
  seedNotificationMarker,
  seedNotifications,
  seedPostSwitchBlueskyData,
} from '../adaptor/d1/__tests__/blueskyAccountSwitchFixture.ts';
import { createSqliteD1Fixture } from '../adaptor/d1/__tests__/sqliteFixture.ts';
import { createD1BlueskyAccountSwitchPurger } from '../adaptor/d1/blueskyAccountSwitch/blueskyAccountSwitchPurger.ts';
import {
  createD1BlueskyAccountSwitchCompletedStore,
  createD1BlueskyAccountSwitchFailedStore,
  createD1BlueskyAccountSwitchProgressStore,
} from '../adaptor/d1/blueskyAccountSwitch/blueskyAccountSwitchPurgeStores.ts';
import { createD1BlueskyAccountSwitchResolver } from '../adaptor/d1/blueskyAccountSwitch/blueskyAccountSwitchResolver.ts';
import type { BlueskyAccountSwitchPurger } from '../domain/blueskyAccountSwitch/blueskyAccountSwitch.ts';
import { Instant } from '../domain/instant/instant.ts';
import { PurgeBlueskyAccountSwitchUseCase } from './purgeBlueskyAccountSwitch.ts';

const STARTED_AT = 1_800_000_000_000;
const USER_ID = '00000000-0000-4000-8000-000000000001';

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

const setup = (options: { elapsedMs?: number; stepMs?: number; attempts?: number } = {}) => {
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  const { db, sqlite } = fixture;
  sqlite.prepare('INSERT INTO users(userId,username) VALUES (?,?)').run(USER_ID, 'kosui');
  const row = insertBlueskyAccountSwitch(sqlite, { startedAt: STARTED_AT, attempts: options.attempts ?? 0 });
  let clock = STARTED_AT + (options.elapsedMs ?? 90_000);
  const real = createD1BlueskyAccountSwitchPurger(db);
  const calls: string[] = [];
  const hooks = { failOnCall: undefined as number | undefined, error: new Error('D1_ERROR: forced failure') };
  const purger: BlueskyAccountSwitchPurger = {
    purge: async (target) => {
      calls.push(target);
      if (hooks.failOnCall === calls.length) throw hooks.error;
      const purged = await real.purge(target, Instant.orThrow(STARTED_AT));
      if (Result.unsafeUnwrap(purged) > 0) clock += options.stepMs ?? 0;
      return purged;
    },
  };
  const useCase = PurgeBlueskyAccountSwitchUseCase.create({
    accountSwitchResolver: createD1BlueskyAccountSwitchResolver(db),
    purger,
    progressStore: createD1BlueskyAccountSwitchProgressStore(db),
    failedStore: createD1BlueskyAccountSwitchFailedStore(db),
    completedStore: createD1BlueskyAccountSwitchCompletedStore(db),
    now: () => Instant.orThrow(clock),
  });
  const switchRows = () =>
    sqlite.prepare('SELECT * FROM bluesky_account_switch').all() as Array<
      { attempts: number; lastError: string | null; deletedCounts: string }
    >;
  const events = () =>
    sqlite.prepare('SELECT eventName, aggregateId, aggregateState, eventPayload FROM domain_events').all() as Array<
      { eventName: string; aggregateId: string; aggregateState: string | null; eventPayload: string }
    >;
  return { sqlite, row, useCase, calls, hooks, switchRows, events, advance: (ms: number) => (clock += ms) };
};

const emptied = {
  syncStatus: 0,
  crossposts: 0,
  timelineItems: 0,
  likes: 0,
  reposts: 0,
  bookmarks: 0,
  moderatedActors: 0,
  notificationReceipts: 0,
  notificationSyncState: 0,
};

describe('PurgeBlueskyAccountSwitchUseCase', () => {
  it('切り替えの印が無いときは、何も削除せず idle を返す', async () => {
    const t = setup();
    t.sqlite.exec('DELETE FROM bluesky_account_switch');
    seedBlueskyData(t.sqlite, { timelineItems: 3 });

    const result = await t.useCase.run();

    expect(result).toEqual({ ok: true, val: { status: 'idle' } });
    expect(t.calls).toEqual([]);
    expect(countBlueskyData(t.sqlite).timelineItems).toBe(3);
  });

  it('開始から 90 秒に満たないときは、何も削除せず waiting を返す', async () => {
    const t = setup({ elapsedMs: 89_999 });
    seedBlueskyData(t.sqlite, { timelineItems: 3, likes: 2 });

    const result = await t.useCase.run();

    expect(result).toEqual({ ok: true, val: { status: 'waiting' } });
    expect(t.calls).toEqual([]);
    expect(countBlueskyData(t.sqlite)).toMatchObject({ timelineItems: 3, likes: 2 });
    expect(t.switchRows()).toHaveLength(1);
  });

  it('90 秒がちょうど経ったら削除を始める', async () => {
    const t = setup({ elapsedMs: 90_000 });
    seedBlueskyData(t.sqlite, { likes: 2 });

    const result = await t.useCase.run();

    expect(result).toMatchObject({ ok: true, val: { status: 'completed' } });
    expect(countBlueskyData(t.sqlite).likes).toBe(0);
  });

  it('500 行ずつ分けて削除し、全表が空になったら印を消して完了のイベントを書く', async () => {
    const t = setup();
    seedBlueskyData(t.sqlite, {
      syncStatus: 2,
      crossposts: 3,
      timelineItems: 1_203,
      likes: 500,
      reposts: 4,
      bookmarks: 5,
      moderatedActors: 6,
      notificationReceipts: 7,
      notificationSyncState: 1,
    });

    const result = await t.useCase.run();

    const counts = {
      syncStatus: 2,
      crossposts: 3,
      timelineItems: 1_203,
      likes: 500,
      reposts: 4,
      bookmarks: 5,
      moderatedActors: 6,
      notificationReceipts: 7,
      notificationSyncState: 1,
      notifications: 0,
    };
    expect(result).toEqual({
      ok: true,
      val: { status: 'completed', fromDid: 'did:plc:old', toDid: 'did:plc:alice', deletedCounts: counts },
    });
    expect(t.calls.filter((target) => target === 'timelineItems')).toHaveLength(3);
    expect(t.calls.filter((target) => target === 'likes')).toHaveLength(2);
    expect(countBlueskyData(t.sqlite)).toEqual(emptied);
    expect(t.switchRows()).toEqual([]);
    const events = t.events();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ eventName: 'blueskyAccountSwitch.completed', aggregateState: null });
    expect(JSON.parse(events[0]!.aggregateId)).toBe(t.row.switchId);
    expect(JSON.parse(events[0]!.eventPayload)).toEqual({
      fromDid: 'did:plc:old',
      toDid: 'did:plc:alice',
      startedAt: STARTED_AT,
      deletedCounts: counts,
    });
  });

  it('切り替えの開始より後に作られた行は削除せず、その行が残っていても完了する', async () => {
    const t = setup();
    seedBlueskyData(t.sqlite, { crossposts: 2, likes: 2, reposts: 2, bookmarks: 2, moderatedActors: 2 });
    seedPostSwitchBlueskyData(t.sqlite, STARTED_AT + 1_000);

    const result = await t.useCase.run();

    expect(result).toMatchObject({
      ok: true,
      val: {
        status: 'completed',
        deletedCounts: { crossposts: 2, likes: 2, reposts: 2, bookmarks: 2, moderatedActors: 2 },
      },
    });
    expect(countBlueskyData(t.sqlite)).toMatchObject({
      crossposts: 1,
      likes: 1,
      reposts: 1,
      bookmarks: 1,
      moderatedActors: 1,
    });
    expect(t.sqlite.prepare('SELECT subjectUri FROM bluesky_likes').all()).toEqual([{
      subjectUri: 'at://subject/after',
    }]);
    expect(t.sqlite.prepare('SELECT postId FROM bluesky_crossposts').all()).toEqual([{ postId: 'post-after' }]);
    expect(t.switchRows()).toEqual([]);
  });

  it('開始と同時刻に作られた行は、新しいアカウントの行として残す', async () => {
    const t = setup();
    seedPostSwitchBlueskyData(t.sqlite, STARTED_AT);

    await t.useCase.run();

    expect(countBlueskyData(t.sqlite)).toMatchObject({ crossposts: 1, likes: 1 });
  });

  it('完了の後に再び実行しても、何もしない', async () => {
    const t = setup();
    seedBlueskyData(t.sqlite, { likes: 1 });
    await t.useCase.run();

    const again = await t.useCase.run();

    expect(again).toEqual({ ok: true, val: { status: 'idle' } });
    expect(t.events()).toHaveLength(1);
  });

  it('20 秒を超えたら打ち切り、次の実行で続きから削除し終える', async () => {
    const t = setup({ stepMs: 8_000 });
    seedBlueskyData(t.sqlite, { timelineItems: 1_200, likes: 3 });

    const first = await t.useCase.run();

    expect(first).toMatchObject({ ok: true, val: { status: 'timeBudget' } });
    expect(t.switchRows()).toHaveLength(1);
    expect(countBlueskyData(t.sqlite)).toMatchObject({ timelineItems: 0, likes: 3 });
    let finished = first;
    for (let run = 0; run < 10 && finished.ok && finished.val.status === 'timeBudget'; run += 1) {
      finished = await t.useCase.run();
    }
    expect(finished).toMatchObject({ ok: true, val: { status: 'completed' } });
    expect(countBlueskyData(t.sqlite)).toEqual(emptied);
    expect(JSON.parse(t.events()[0]!.eventPayload).deletedCounts).toMatchObject({ timelineItems: 1_200, likes: 3 });
  });

  it('削除が途中で失敗したら attempts と lastError を書き、次の実行で完了する', async () => {
    const t = setup();
    seedBlueskyData(t.sqlite, { timelineItems: 1_200, likes: 3 });
    t.hooks.failOnCall = 4;

    const failed = await t.useCase.run();

    expect(failed).toEqual({
      ok: true,
      val: { status: 'failed', attempts: 1, stalled: false, message: 'Error: D1_ERROR: forced failure' },
    });
    const [row] = t.switchRows();
    expect(row).toMatchObject({ attempts: 1, lastError: 'Error: D1_ERROR: forced failure' });
    expect(JSON.parse(row!.deletedCounts)).toMatchObject({ timelineItems: 500 });
    expect(countBlueskyData(t.sqlite).timelineItems).toBe(700);
    expect(t.events()).toEqual([]);

    t.hooks.failOnCall = undefined;
    const retried = await t.useCase.run();

    expect(retried).toMatchObject({
      ok: true,
      val: { status: 'completed', deletedCounts: { timelineItems: 1_200, likes: 3 } },
    });
    expect(countBlueskyData(t.sqlite)).toEqual(emptied);
    expect(t.switchRows()).toEqual([]);
  });

  it('lastError は先頭の 200 文字までにする', async () => {
    const t = setup();
    seedBlueskyData(t.sqlite, { likes: 1 });
    t.hooks.failOnCall = 1;
    t.hooks.error = new Error('x'.repeat(500));

    await t.useCase.run();

    expect(t.switchRows()[0]!.lastError).toHaveLength(200);
  });

  it('試行が 30 回を超えたら stalled にし、削除を続ける', async () => {
    const t = setup({ attempts: 30 });
    seedBlueskyData(t.sqlite, { likes: 1 });
    t.hooks.failOnCall = 1;

    const failed = await t.useCase.run();

    expect(failed).toMatchObject({ ok: true, val: { status: 'failed', attempts: 31, stalled: true } });
    t.hooks.failOnCall = undefined;
    expect(await t.useCase.run()).toMatchObject({ ok: true, val: { status: 'completed' } });
  });

  it('削除は冪等で、同じ表を空のまま再び実行しても件数は変わらない', async () => {
    const purger = createD1BlueskyAccountSwitchPurger(fixtureDb());
    const startedAt = Instant.orThrow(STARTED_AT);
    expect(Result.unsafeUnwrap(await purger.purge('likes', startedAt))).toBe(0);
    expect(Result.unsafeUnwrap(await purger.purge('notifications', startedAt))).toBe(0);
  });
});

const fixtureDb = () => {
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  return fixture.db;
};

describe('通知の削除', () => {
  const notifications = (bluesky: number) => [
    ...Array.from({ length: bluesky }, (_, i) => ({
      id: `bsky-${String(i).padStart(5, '0')}`,
      type: ['blueskyLike', 'blueskyRepost', 'blueskyFollow', 'blueskyMention'][i % 4]!,
      createdAt: 1_000 + i * 10,
    })),
    { id: 'fedi-old', type: 'follow', createdAt: 500 },
    { id: 'fedi-new', type: 'like', createdAt: 1_000_000 },
  ];

  it('Bluesky の通知だけを 500 件ずつ消し、Fediverse の通知を残す', async () => {
    const t = setup();
    seedNotifications(t.sqlite, USER_ID, notifications(1_100));

    const result = await t.useCase.run();

    expect(result).toMatchObject({ ok: true, val: { status: 'completed', deletedCounts: { notifications: 1_100 } } });
    expect(t.calls.filter((target) => target === 'notifications')).toHaveLength(3);
    expect(t.sqlite.prepare('SELECT notificationId FROM notifications ORDER BY notificationId').all()).toEqual([
      { notificationId: 'fedi-new' },
      { notificationId: 'fedi-old' },
    ]);
    expect(t.sqlite.prepare('SELECT COUNT(*) AS n FROM notification_bluesky').get()).toEqual({ n: 0 });
  });

  it('既読位置が Bluesky の通知を指していれば、その前の通知に動かす', async () => {
    const t = setup();
    seedNotifications(t.sqlite, USER_ID, [
      { id: 'fedi-old', type: 'follow', createdAt: 100 },
      { id: 'bsky-a', type: 'blueskyLike', createdAt: 200 },
      { id: 'bsky-b', type: 'blueskyMention', createdAt: 300 },
    ]);
    seedNotificationMarker(t.sqlite, USER_ID, 'bsky-b');

    await t.useCase.run();

    expect(t.sqlite.prepare('SELECT lastReadId FROM mastodon_markers').all()).toEqual([{ lastReadId: 'fedi-old' }]);
  });

  it('前の通知が無ければ既読位置を消し、Fediverse の通知を指す既読位置は残す', async () => {
    const none = setup();
    seedNotifications(none.sqlite, USER_ID, [{ id: 'bsky-a', type: 'blueskyLike', createdAt: 200 }]);
    seedNotificationMarker(none.sqlite, USER_ID, 'bsky-a');
    await none.useCase.run();
    expect(none.sqlite.prepare('SELECT * FROM mastodon_markers').all()).toEqual([]);

    const kept = setup();
    seedNotifications(kept.sqlite, USER_ID, [
      { id: 'fedi-a', type: 'follow', createdAt: 100 },
      { id: 'bsky-a', type: 'blueskyLike', createdAt: 200 },
    ]);
    seedNotificationMarker(kept.sqlite, USER_ID, 'fedi-a');
    await kept.useCase.run();
    expect(kept.sqlite.prepare('SELECT lastReadId FROM mastodon_markers').all()).toEqual([{ lastReadId: 'fedi-a' }]);
  });
});
