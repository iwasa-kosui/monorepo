import { afterEach, describe, expect, it } from 'vitest';

import { Instant } from '../../../domain/instant/instant.ts';
import { type BlueskyNotification, Notification } from '../../../domain/notification/notification.ts';
import { NotificationId } from '../../../domain/notification/notificationId.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { createD1BlueskyNotificationCreatedStore } from '../blueskyNotification/blueskyNotificationCreatedStore.ts';
import { createD1BlueskyNotificationExistingUrisResolver } from '../blueskyNotification/blueskyNotificationExistingUrisResolver.ts';
import { createD1BlueskyNotificationInitialSyncCompletedStore } from '../blueskyNotification/blueskyNotificationInitialSyncCompletedStore.ts';
import { createD1BlueskyNotificationReceiptsExpiredStore } from '../blueskyNotification/blueskyNotificationReceiptsExpiredStore.ts';
import { createD1BlueskyNotificationSyncStateResolver } from '../blueskyNotification/blueskyNotificationSyncStateResolver.ts';
import { createD1PostIdsResolverByBlueskyUris } from '../blueskyNotification/postIdsResolverByBlueskyUris.ts';
import { createD1NotificationsResolverByPage } from '../notification/notificationsResolverByPage.ts';
import { createMastodonSeed } from './mastodonSeed.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const NOW = Instant.orThrow(Date.UTC(2026, 10, 8, 12));
const AUTHOR = { did: 'did:plc:alice', handle: 'alice.bsky.social', displayName: null, avatarUrl: null };

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

const setup = () => {
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  const seed = createMastodonSeed(fixture);
  const me = seed.addLocalActor('kosui');
  const store = createD1BlueskyNotificationCreatedStore(fixture.db, { now: () => NOW });
  const eventAt = (notification: BlueskyNotification, at: number) =>
    Notification.createBlueskyNotification(notification, Instant.orThrow(at));
  const like = (n: number): BlueskyNotification => ({
    type: 'blueskyLike',
    notificationId: NotificationId.generate(),
    recipientUserId: UserId.orThrow(me.userId),
    isRead: false,
    blueskyUri: `at://did:plc:alice/app.bsky.feed.like/${n}`,
    author: AUTHOR,
    subjectUri: 'at://did:plc:me/app.bsky.feed.post/3kmine',
    targetPostId: null,
  });
  const count = (table: string) =>
    (fixture.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
  return { ...fixture, seed, me, store, eventAt, like, count };
};

describe('createD1BlueskyNotificationCreatedStore', () => {
  it('通知、子表、受信の記録、ドメインイベントを 1 件につき 4 文で保存する', async () => {
    const t = setup();
    const mention: BlueskyNotification = {
      type: 'blueskyMention',
      notificationId: NotificationId.generate(),
      recipientUserId: UserId.orThrow(t.me.userId),
      isRead: false,
      blueskyUri: 'at://did:plc:alice/app.bsky.feed.post/3kreply',
      author: { ...AUTHOR, displayName: 'Alice', avatarUrl: 'https://cdn.example/a.jpg' },
      reason: 'reply',
      subjectUri: 'at://did:plc:me/app.bsky.feed.post/3kmine',
      targetPostId: null,
      text: 'hello',
    };
    const events = [t.eventAt(mention, 5_000), t.eventAt(t.like(1), 6_000)];

    await t.store.store(...events);

    const items = await createD1NotificationsResolverByPage(t.db).resolve({
      recipientUserId: UserId.orThrow(t.me.userId),
      page: { limit: 10, olderThanId: undefined, newerThanId: undefined, order: 'newestFirst' },
      types: ['blueskyLike', 'blueskyMention'],
    });
    expect(items.ok && items.val.map((item) => [item.notification, item.createdAt])).toEqual([
      [events[1]!.aggregateState, 6_000],
      [mention, 5_000],
    ]);
    expect(t.sqlite.prepare('SELECT uri, indexedAt, receivedAt FROM bluesky_notification_receipts ORDER BY uri').all())
      .toEqual([
        { uri: 'at://did:plc:alice/app.bsky.feed.like/1', indexedAt: 6_000, receivedAt: NOW },
        { uri: 'at://did:plc:alice/app.bsky.feed.post/3kreply', indexedAt: 5_000, receivedAt: NOW },
      ]);
    expect(t.count('domain_events')).toBe(2);
  });

  it('1 バッチに 20 件以上を渡しても、各文の束縛が D1 の上限に収まる', async () => {
    const t = setup();
    const events = Array.from({ length: 45 }, (_, index) => t.eventAt(t.like(index), 1_000 + index));

    await t.store.store(...events);

    expect(t.count('notifications')).toBe(45);
    expect(t.count('notification_bluesky')).toBe(45);
    expect(t.count('bluesky_notification_receipts')).toBe(45);
    expect(t.count('domain_events')).toBe(45);
    expect(Math.max(...t.queries.map((query) => query.params.length))).toBeLessThanOrEqual(10);
  });

  it('events が空なら何も書かない', async () => {
    const t = setup();

    await t.store.store();

    expect(t.queries).toEqual([]);
  });

  it('同じ uri を 2 回保存すると一意制約で失敗し、そのバッチは 1 件も残らない', async () => {
    const t = setup();
    await t.store.store(t.eventAt(t.like(1), 1_000));

    await expect(t.store.store(t.eventAt(t.like(2), 2_000), t.eventAt(t.like(1), 3_000))).rejects.toThrow(/UNIQUE/);

    expect(t.count('notifications')).toBe(1);
    expect(t.count('bluesky_notification_receipts')).toBe(1);
  });
});

describe('Bluesky の通知のリゾルバーと期限切れの削除', () => {
  it('初回の取り込みの完了時刻は、書き込むまで未設定で、最初の値だけが残る', async () => {
    const t = setup();
    const resolver = createD1BlueskyNotificationSyncStateResolver(t.db);
    const store = createD1BlueskyNotificationInitialSyncCompletedStore(t.db);

    const before = await resolver.resolve();
    await store.store(Instant.orThrow(1_000));
    await store.store(Instant.orThrow(2_000));
    const after = await resolver.resolve();

    expect([before.val, after.val]).toEqual([undefined, { initialSyncCompletedAt: 1_000 }]);
    expect(t.count('bluesky_notification_sync_state')).toBe(1);
  });

  it('受信の記録の有無とは関係なく、初回の取り込みの完了時刻を返す', async () => {
    const t = setup();
    await createD1BlueskyNotificationInitialSyncCompletedStore(t.db).store(Instant.orThrow(1_000));

    const state = await createD1BlueskyNotificationSyncStateResolver(t.db).resolve();

    expect(t.count('bluesky_notification_receipts')).toBe(0);
    expect(state.val).toEqual({ initialSyncCompletedAt: 1_000 });
  });

  it('既存の uri を、250 件を 1 つの束縛で問い合わせて返す', async () => {
    const t = setup();
    await t.store.store(t.eventAt(t.like(1), 1_000), t.eventAt(t.like(2), 1_001));
    const uris = Array.from({ length: 250 }, (_, index) => `at://did:plc:alice/app.bsky.feed.like/${index}`);
    t.queries.length = 0;

    const existing = await createD1BlueskyNotificationExistingUrisResolver(t.db).resolve(uris);

    expect([...(existing.val ?? [])].sort()).toEqual([
      'at://did:plc:alice/app.bsky.feed.like/1',
      'at://did:plc:alice/app.bsky.feed.like/2',
    ]);
    expect(t.queries.map((query) => query.params.length)).toEqual([1]);
    expect((await createD1BlueskyNotificationExistingUrisResolver(t.db).resolve([])).val).toEqual([]);
  });

  it('送信済みの crosspost だけを uri から PostId に引く', async () => {
    const t = setup();
    const insert = t.sqlite.prepare(
      'INSERT INTO bluesky_crossposts(postId,status,uri,attempts,createdAt,updatedAt) VALUES (?,?,?,?,?,?)',
    );
    const sent = t.seed.uuid();
    insert.run(sent, 'sent', 'at://did:plc:me/app.bsky.feed.post/a', 1, 1, 1);
    insert.run(t.seed.uuid(), 'failed', 'at://did:plc:me/app.bsky.feed.post/b', 1, 1, 1);
    insert.run(t.seed.uuid(), 'sent', null, 1, 1, 1);
    const resolver = createD1PostIdsResolverByBlueskyUris(t.db);

    const found = await resolver.resolve([
      'at://did:plc:me/app.bsky.feed.post/a',
      'at://did:plc:me/app.bsky.feed.post/b',
      'at://did:plc:me/app.bsky.feed.post/c',
    ]);

    expect([...(found.val ?? [])]).toEqual([['at://did:plc:me/app.bsky.feed.post/a', sent]]);
    expect((await resolver.resolve([])).val).toEqual(new Map());
  });

  it('期限切れの削除は indexedAt が基準より古い受信の記録だけを消し、通知は消さない', async () => {
    const t = setup();
    await t.store.store(t.eventAt(t.like(1), 1_000), t.eventAt(t.like(2), 2_000), t.eventAt(t.like(3), 3_000));

    await createD1BlueskyNotificationReceiptsExpiredStore(t.db).expire(Instant.orThrow(2_000));

    expect(
      t.sqlite.prepare('SELECT indexedAt FROM bluesky_notification_receipts ORDER BY indexedAt').all(),
    ).toEqual([{ indexedAt: 2_000 }, { indexedAt: 3_000 }]);
    expect(t.count('notifications')).toBe(3);
    expect(t.count('notification_bluesky')).toBe(3);
  });
});
