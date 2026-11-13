import { Result } from '@iwasa-kosui/result';
import { env } from 'cloudflare:test';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createD1BlueskyAccountSwitchPurger } from '../src/adaptor/d1/blueskyAccountSwitch/blueskyAccountSwitchPurger.ts';
import {
  createD1BlueskyAccountSwitchCompletedStore,
  createD1BlueskyAccountSwitchFailedStore,
  createD1BlueskyAccountSwitchProgressStore,
} from '../src/adaptor/d1/blueskyAccountSwitch/blueskyAccountSwitchPurgeStores.ts';
import { createD1BlueskyAccountSwitchResolver } from '../src/adaptor/d1/blueskyAccountSwitch/blueskyAccountSwitchResolver.ts';
import { createD1BlueskyAccountSwitchStartedStore } from '../src/adaptor/d1/blueskyAccountSwitch/blueskyAccountSwitchStartedStore.ts';
import { createD1BlueskyStoredCredentialResolver } from '../src/adaptor/d1/blueskyCredential/blueskyCredentialStore.ts';
import { createD1BlueskySessionResolver } from '../src/adaptor/d1/blueskyCrosspost/blueskySessionStore.ts';
import { createD1Db } from '../src/adaptor/d1/client.ts';
import { BlueskyAccountSwitch } from '../src/domain/blueskyAccountSwitch/blueskyAccountSwitch.ts';
import type { BlueskySession } from '../src/domain/blueskyCrosspost/blueskyCrosspost.ts';
import { Instant } from '../src/domain/instant/instant.ts';
import { PurgeBlueskyAccountSwitchUseCase } from '../src/useCase/purgeBlueskyAccountSwitch.ts';

const db = createD1Db(env.DB);
const STARTED_AT = Instant.orThrow(1_800_000_000_000);
const NOW = Instant.orThrow(STARTED_AT + 100_000);
const userId = crypto.randomUUID();
const actorId = crypto.randomUUID();
const postId = crypto.randomUUID();
const run = crypto.randomUUID();

const BLUESKY_TABLES = [
  'bluesky_sync_status',
  'bluesky_crossposts',
  'bluesky_timeline_items',
  'bluesky_likes',
  'bluesky_reposts',
  'bluesky_bookmarks',
  'bluesky_moderated_actors',
  'bluesky_notification_receipts',
  'bluesky_notification_sync_state',
] as const;

const countOf = async (table: string, where = '1 = 1') =>
  (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).first<{ n: number }>())!.n;

const series = (n: number) => `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ${n})`;

const seedBlueskyTables = (sizes: { timeline: number; likes: number }) =>
  env.DB.batch([
    env.DB.prepare('INSERT INTO bluesky_sync_status(scope) VALUES (?)').bind(`timeline-${run}`),
    env.DB.prepare(
      'INSERT INTO bluesky_crossposts(postId,status,uri,createdAt,updatedAt) VALUES (?,?,?,?,?)',
    ).bind(postId, 'sent', 'at://did:plc:old/app.bsky.feed.post/1', 1, 1),
    env.DB.prepare(
      `INSERT INTO bluesky_timeline_items(feedItemId,uri,cid,authorDid,authorHandle,text,facets,postedAt,indexedAt,fetchedAt)
       ${series(sizes.timeline)}
       SELECT 'item-${run}-' || i, 'at://x/' || i, 'cid', 'did:plc:x', 'x.test', 'text', '[]', 1, 1, 1 FROM n`,
    ),
    env.DB.prepare(
      `INSERT INTO bluesky_likes(subjectUri,likeUri,createdAt) ${series(sizes.likes)}
       SELECT 'at://s/${run}/' || i, 'at://l/' || i, 1 FROM n`,
    ),
    env.DB.prepare('INSERT INTO bluesky_reposts(subjectUri,repostUri,createdAt) VALUES (?,?,?)')
      .bind(`at://s/${run}/r`, 'at://r/1', 1),
    env.DB.prepare('INSERT INTO bluesky_bookmarks(subjectUri,createdAt) VALUES (?,?)').bind(`at://s/${run}/b`, 1),
    env.DB.prepare('INSERT INTO bluesky_moderated_actors(did,muted,updatedAt) VALUES (?,?,?)')
      .bind(`did:plc:muted-${run}`, 1, 1),
    env.DB.prepare('INSERT INTO bluesky_notification_receipts(uri,indexedAt,receivedAt) VALUES (?,?,?)')
      .bind(`at://receipt/${run}`, 1, 1),
    env.DB.prepare('INSERT INTO bluesky_notification_sync_state(id,initialSyncCompletedAt) VALUES (?,?)')
      .bind(`default-${run}`, 1),
  ]);

const seedNotifications = (blueskyCount: number) =>
  env.DB.batch([
    env.DB.prepare(
      `INSERT INTO notifications(notificationId,recipientUserId,type,isRead,createdAt) ${series(blueskyCount)}
       SELECT '${run}-bsky-' || printf('%05d', i), '${userId}',
         CASE i % 4 WHEN 0 THEN 'blueskyLike' WHEN 1 THEN 'blueskyRepost' WHEN 2 THEN 'blueskyFollow' ELSE 'blueskyMention' END,
         0, 1000 + i FROM n`,
    ),
    env.DB.prepare(
      `INSERT INTO notification_bluesky(notificationId,blueskyUri,reason,authorDid,authorHandle) ${series(blueskyCount)}
       SELECT '${run}-bsky-' || printf('%05d', i), 'at://n/${run}/' || i, 'like', 'did:plc:x', 'x.test' FROM n`,
    ),
    env.DB.prepare('INSERT INTO notifications(notificationId,recipientUserId,type,isRead,createdAt) VALUES (?,?,?,?,?)')
      .bind(`${run}-fedi-old`, userId, 'follow', 0, 10),
    env.DB.prepare('INSERT INTO notifications(notificationId,recipientUserId,type,isRead,createdAt) VALUES (?,?,?,?,?)')
      .bind(`${run}-fedi-new`, userId, 'like', 0, 9_000_000),
    env.DB.prepare('INSERT INTO mastodon_markers(userId,timeline,lastReadId,version,updatedAt) VALUES (?,?,?,?,?)')
      .bind(userId, 'notifications', `${run}-bsky-${String(blueskyCount).padStart(5, '0')}`, 1, 1),
    env.DB.prepare('INSERT INTO mastodon_markers(userId,timeline,lastReadId,version,updatedAt) VALUES (?,?,?,?,?)')
      .bind(userId, 'home', 'home-marker', 1, 1),
  ]);

const insertSwitchRow = () =>
  env.DB.prepare(
    'INSERT INTO bluesky_account_switch(id,switchId,fromDid,toDid,startedAt,attempts,lastError,deletedCounts,updatedAt) VALUES (?,?,?,?,?,?,?,?,?)',
  ).bind(
    'default',
    run,
    'did:plc:old',
    'did:plc:new',
    STARTED_AT,
    0,
    null,
    JSON.stringify(BlueskyAccountSwitch.emptyCounts),
    STARTED_AT,
  ).run();

const purgeUseCase = (now: Instant = NOW) =>
  PurgeBlueskyAccountSwitchUseCase.create({
    accountSwitchResolver: createD1BlueskyAccountSwitchResolver(db),
    purger: createD1BlueskyAccountSwitchPurger(db),
    progressStore: createD1BlueskyAccountSwitchProgressStore(db),
    failedStore: createD1BlueskyAccountSwitchFailedStore(db),
    completedStore: createD1BlueskyAccountSwitchCompletedStore(db),
    now: () => now,
  });

const resetTables = () =>
  env.DB.batch([
    ...BLUESKY_TABLES.map((table) => env.DB.prepare(`DELETE FROM ${table}`)),
    env.DB.prepare('DELETE FROM bluesky_account_switch'),
    env.DB.prepare('DELETE FROM mastodon_markers WHERE userId = ?').bind(userId),
    env.DB.prepare('DELETE FROM notification_bluesky'),
    env.DB.prepare('DELETE FROM notifications WHERE recipientUserId = ?').bind(userId),
    env.DB.prepare('DELETE FROM domain_events WHERE aggregateName = ?').bind('blueskyAccountSwitch'),
    env.DB.prepare('DELETE FROM bluesky_credentials'),
    env.DB.prepare('DELETE FROM bluesky_sessions'),
    env.DB.prepare('DELETE FROM bluesky_login_failures'),
  ]);

beforeEach(async () => {
  await resetTables();
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO users(userId,username) VALUES (?,?)').bind(userId, `switch-${run}`),
    env.DB.prepare('INSERT OR IGNORE INTO actors(actorId,uri,inboxUrl,type) VALUES (?,?,?,?)')
      .bind(actorId, `https://example.test/users/${actorId}`, `https://example.test/users/${actorId}/inbox`, 'local'),
    env.DB.prepare('INSERT OR IGNORE INTO posts(postId,actorId,content,createdAt,type) VALUES (?,?,?,?,?)')
      .bind(postId, actorId, 'local post', 1, 'local'),
    env.DB.prepare('INSERT OR IGNORE INTO local_posts(postId,userId,visibility) VALUES (?,?,?)')
      .bind(postId, userId, 'public'),
  ]);
});

afterAll(async () => {
  await resetTables();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM local_posts WHERE postId = ?').bind(postId),
    env.DB.prepare('DELETE FROM posts WHERE postId = ?').bind(postId),
    env.DB.prepare('DELETE FROM actors WHERE actorId = ?').bind(actorId),
    env.DB.prepare('DELETE FROM users WHERE userId = ?').bind(userId),
  ]);
});

describe('アカウントの切り替えの削除（実 D1）', () => {
  it('Bluesky の表を空にし、Bluesky の通知だけを消し、ローカルの投稿と Fediverse の通知を残す', async () => {
    await seedBlueskyTables({ timeline: 1_203, likes: 500 });
    await seedNotifications(1_050);
    await insertSwitchRow();
    const useCase = purgeUseCase();

    const results: string[] = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const result = Result.unsafeUnwrap(await useCase.run());
      results.push(result.status);
      if (result.status === 'completed') break;
    }

    expect(results.at(-1)).toBe('completed');
    for (const table of BLUESKY_TABLES) expect(await countOf(table), table).toBe(0);
    expect(await countOf('notifications', `recipientUserId = '${userId}' AND type LIKE 'bluesky%'`)).toBe(0);
    expect(await countOf('notification_bluesky')).toBe(0);
    const remaining = await env.DB.prepare(
      'SELECT notificationId FROM notifications WHERE recipientUserId = ? ORDER BY notificationId',
    ).bind(userId).all<{ notificationId: string }>();
    expect(remaining.results.map((row) => row.notificationId)).toEqual([`${run}-fedi-new`, `${run}-fedi-old`]);
    expect(await countOf('posts', `postId = '${postId}'`)).toBe(1);
    expect(await countOf('local_posts', `postId = '${postId}'`)).toBe(1);
    expect(await countOf('bluesky_account_switch')).toBe(0);
  });

  it('既読位置は、Bluesky の通知から前の Fediverse の通知に動き、home の既読位置は変わらない', async () => {
    await seedNotifications(1_050);
    await insertSwitchRow();

    const result = Result.unsafeUnwrap(await purgeUseCase().run());
    expect(result.status).toBe('completed');

    const markers = await env.DB.prepare(
      'SELECT timeline, lastReadId FROM mastodon_markers WHERE userId = ? ORDER BY timeline',
    )
      .bind(userId).all();
    expect(markers.results).toEqual([
      { timeline: 'home', lastReadId: 'home-marker' },
      { timeline: 'notifications', lastReadId: `${run}-fedi-old` },
    ]);
  });

  it('完了のイベントに、前後の DID と表ごとの削除件数を書く', async () => {
    await seedBlueskyTables({ timeline: 12, likes: 7 });
    await seedNotifications(3);
    await insertSwitchRow();

    Result.unsafeUnwrap(await purgeUseCase().run());

    const events = await env.DB.prepare(
      'SELECT eventName, aggregateId, aggregateState, eventPayload FROM domain_events WHERE aggregateName = ?',
    ).bind('blueskyAccountSwitch').all<
      { eventName: string; aggregateId: string; aggregateState: string | null; eventPayload: string }
    >();
    expect(events.results).toHaveLength(1);
    expect(events.results[0]).toMatchObject({
      eventName: 'blueskyAccountSwitch.completed',
      aggregateId: JSON.stringify(run),
      aggregateState: null,
    });
    expect(JSON.parse(events.results[0]!.eventPayload)).toEqual({
      fromDid: 'did:plc:old',
      toDid: 'did:plc:new',
      startedAt: STARTED_AT,
      deletedCounts: {
        syncStatus: 1,
        crossposts: 1,
        timelineItems: 12,
        likes: 7,
        reposts: 1,
        bookmarks: 1,
        moderatedActors: 1,
        notificationReceipts: 1,
        notificationSyncState: 1,
        notifications: 3,
      },
    });
  });

  it('切り替えの開始より後に作られたいいねとクロスポストは削除せず、残っていても完了する', async () => {
    await seedBlueskyTables({ timeline: 3, likes: 3 });
    await env.DB.batch([
      env.DB.prepare('INSERT INTO bluesky_likes(subjectUri,likeUri,createdAt) VALUES (?,?,?)')
        .bind(`at://s/${run}/after`, 'at://l/after', STARTED_AT + 1_000),
      env.DB.prepare('INSERT INTO bluesky_crossposts(postId,status,createdAt,updatedAt) VALUES (?,?,?,?)')
        .bind(`${run}-after`, 'sent', STARTED_AT + 1_000, STARTED_AT + 1_000),
      env.DB.prepare('INSERT INTO bluesky_bookmarks(subjectUri,createdAt) VALUES (?,?)')
        .bind(`at://s/${run}/after`, STARTED_AT + 1_000),
      env.DB.prepare('INSERT INTO bluesky_moderated_actors(did,muted,updatedAt) VALUES (?,?,?)')
        .bind(`did:plc:after-${run}`, 1, STARTED_AT + 1_000),
    ]);
    await insertSwitchRow();

    const result = Result.unsafeUnwrap(await purgeUseCase().run());

    expect(result.status).toBe('completed');
    expect(await countOf('bluesky_likes')).toBe(1);
    expect(await countOf('bluesky_likes', `likeUri = 'at://l/after'`)).toBe(1);
    expect(await countOf('bluesky_crossposts')).toBe(1);
    expect(await countOf('bluesky_crossposts', `postId = '${run}-after'`)).toBe(1);
    expect(await countOf('bluesky_bookmarks')).toBe(1);
    expect(await countOf('bluesky_moderated_actors')).toBe(1);
    expect(await countOf('bluesky_timeline_items')).toBe(0);
    expect(await countOf('bluesky_account_switch')).toBe(0);
  });

  it('開始から 90 秒に満たないあいだは、何も削除しない', async () => {
    await seedBlueskyTables({ timeline: 5, likes: 5 });
    await insertSwitchRow();

    const result = Result.unsafeUnwrap(await purgeUseCase(Instant.orThrow(STARTED_AT + 89_999)).run());

    expect(result.status).toBe('waiting');
    expect(await countOf('bluesky_timeline_items')).toBe(5);
    expect(await countOf('bluesky_account_switch')).toBe(1);
  });

  it('途中で失敗したら attempts と lastError を書き、次の実行で完了する', async () => {
    await seedBlueskyTables({ timeline: 10, likes: 5 });
    await insertSwitchRow();
    await env.DB.exec(
      'CREATE TRIGGER fail_likes_delete BEFORE DELETE ON bluesky_likes BEGIN SELECT RAISE(ABORT, \'forced failure\'); END',
    );
    try {
      const failed = Result.unsafeUnwrap(await purgeUseCase().run());
      expect(failed).toMatchObject({ status: 'failed', attempts: 1, stalled: false });
    } finally {
      await env.DB.exec('DROP TRIGGER fail_likes_delete');
    }
    const row = await env.DB.prepare('SELECT attempts, lastError, deletedCounts FROM bluesky_account_switch')
      .first<{ attempts: number; lastError: string; deletedCounts: string }>();
    expect(row?.attempts).toBe(1);
    expect(row?.lastError.length).toBeGreaterThan(0);
    expect(row!.lastError.length).toBeLessThanOrEqual(200);
    expect(JSON.parse(row!.deletedCounts)).toMatchObject({ timelineItems: 10, likes: 0 });

    const retried = Result.unsafeUnwrap(await purgeUseCase().run());

    expect(retried.status).toBe('completed');
    expect(await countOf('bluesky_likes')).toBe(0);
  });
});

describe('切り替えの 1 段目（実 D1）', () => {
  const session: BlueskySession = {
    did: 'did:plc:new',
    handle: 'new.bsky.social',
    pdsUrl: 'https://pds.example',
    accessJwt: 'new-access',
    refreshJwt: 'new-refresh',
    updatedAt: NOW,
  };
  const credential = {
    identifier: 'new.bsky.social',
    did: 'did:plc:new',
    handle: 'new.bsky.social',
    appPasswordCiphertext: 'Y2lwaGVy',
    appPasswordIv: 'aXY=',
    keyVersion: 1,
    chatPermitted: true,
    verifiedAt: NOW,
    updatedAt: NOW,
  };
  const started = (fromDid: string) =>
    Result.unsafeUnwrap(BlueskyAccountSwitch.start(NOW)({ fromDid, toDid: 'did:plc:new' }));

  it('印、資格情報、セッション、開始のイベントを 1 回の batch で書き、ログイン失敗の記録を消す', async () => {
    await env.DB.prepare('INSERT INTO bluesky_login_failures(scope,failedAt) VALUES (?,?)').bind('timeline', 1).run();
    const store = createD1BlueskyAccountSwitchStartedStore(db, 'timeline');
    const event = started('did:plc:old');

    expect(await store.store({ event, credential, session })).toMatchObject({ ok: true });

    const stored = await createD1BlueskyStoredCredentialResolver(db).resolve();
    const sessionRow = await createD1BlueskySessionResolver(db).resolve();
    expect(stored).toMatchObject({ ok: true, val: { did: 'did:plc:new' } });
    expect(sessionRow).toMatchObject({ ok: true, val: { accessJwt: 'new-access' } });
    expect(await countOf('bluesky_login_failures')).toBe(0);
    expect(await countOf('bluesky_account_switch', `switchId = '${event.aggregateState.switchId}'`)).toBe(1);
    expect(await countOf('domain_events', `eventName = 'blueskyAccountSwitch.started'`)).toBe(1);
  });

  it('印がすでにあるときは、2 回目の batch を丸ごと取り消し、SwitchInProgress を返す', async () => {
    const store = createD1BlueskyAccountSwitchStartedStore(db, 'timeline');
    await store.store({ event: started('did:plc:old'), credential, session });

    const second = await store.store({
      event: started('did:plc:other'),
      credential: { ...credential, did: 'did:plc:third', identifier: 'third.bsky.social' },
      session: { ...session, did: 'did:plc:third', accessJwt: 'third-access' },
    });

    expect(second).toMatchObject({ ok: false, err: { type: 'BlueskyAccountSwitchInProgress' } });
    const stored = await createD1BlueskyStoredCredentialResolver(db).resolve();
    expect(stored).toMatchObject({ ok: true, val: { did: 'did:plc:new' } });
    expect(await countOf('domain_events', `eventName = 'blueskyAccountSwitch.started'`)).toBe(1);
  });
});
