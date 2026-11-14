import { RA } from '@iwasa-kosui/result';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMastodonSeed } from '../../adaptor/d1/__tests__/mastodonSeed.ts';
import { createSqliteD1Fixture } from '../../adaptor/d1/__tests__/sqliteFixture.ts';
import { createD1BlueskyNotificationCreatedStore } from '../../adaptor/d1/blueskyNotification/blueskyNotificationCreatedStore.ts';
import { createD1BlueskyNotificationExistingUrisResolver } from '../../adaptor/d1/blueskyNotification/blueskyNotificationExistingUrisResolver.ts';
import { createD1BlueskyNotificationInitialSyncCompletedStore } from '../../adaptor/d1/blueskyNotification/blueskyNotificationInitialSyncCompletedStore.ts';
import { createD1BlueskyNotificationSyncStateResolver } from '../../adaptor/d1/blueskyNotification/blueskyNotificationSyncStateResolver.ts';
import { createD1PostIdsResolverByBlueskyUris } from '../../adaptor/d1/blueskyNotification/postIdsResolverByBlueskyUris.ts';
import { createD1NotificationDismissedStore } from '../../adaptor/d1/notification/inboxNotificationAdapters.ts';
import { createD1NotificationsResolverByPage } from '../../adaptor/d1/notification/notificationsResolverByPage.ts';
import { createD1PushSubscriptionsResolverByUserId } from '../../adaptor/d1/pushSubscription/pushSubscriptionsResolverByUserId.ts';
import { createD1UserResolverByUsername } from '../../adaptor/d1/user/userResolverByUsername.ts';
import { toGroupedNotificationId } from '../../adaptor/mastodon/toNotification.ts';
import type { WebPushSender } from '../../adaptor/webPush/webPush.ts';
import { BlueskyFetchedNotification } from '../../domain/blueskyNotification/blueskyNotification.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { Notification } from '../../domain/notification/notification.ts';
import { NotificationId } from '../../domain/notification/notificationId.ts';
import { UserId } from '../../domain/user/userId.ts';
import { Username } from '../../domain/user/username.ts';
import type { BlueskyClientError } from '../../ports/blueskyClient.ts';
import type { BlueskyNotificationFetcher, BlueskyNotificationPage } from '../../ports/blueskyNotificationFetcher.ts';
import { CollectBlueskyNotificationsUseCase } from '../collectBlueskyNotifications.ts';

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const NOW = Instant.orThrow(Date.UTC(2026, 10, 8, 12));
const SUBJECT = 'at://did:plc:me/app.bsky.feed.post/3kmine';
const AUTHOR = { did: 'did:plc:alice', handle: 'alice.bsky.social', displayName: 'Alice', avatarUrl: null };

const like = (n: number, indexedAt: number, subjectUri = SUBJECT) =>
  BlueskyFetchedNotification.orThrow({
    uri: `at://did:plc:alice/app.bsky.feed.like/${n}`,
    reason: 'like',
    subjectUri,
    indexedAt: Instant.orThrow(indexedAt),
    author: AUTHOR,
  });
const follow = (n: number, indexedAt: number) =>
  BlueskyFetchedNotification.orThrow({
    uri: `at://did:plc:alice/app.bsky.graph.follow/${n}`,
    reason: 'follow',
    indexedAt: Instant.orThrow(indexedAt),
    author: AUTHOR,
  });
const reply = (n: number, indexedAt: number, subjectUri: string | null, text = `reply ${n}`) =>
  BlueskyFetchedNotification.orThrow({
    uri: `at://did:plc:alice/app.bsky.feed.post/${n}`,
    reason: 'reply',
    subjectUri,
    text,
    indexedAt: Instant.orThrow(indexedAt),
    author: AUTHOR,
  });
const viaRepost = (reason: 'like-via-repost' | 'repost-via-repost', n: number, indexedAt: number, subjectUri: string) =>
  BlueskyFetchedNotification.orThrow({
    uri: `at://did:plc:alice/app.bsky.feed.${reason === 'like-via-repost' ? 'like' : 'repost'}/${n}`,
    reason,
    subjectUri,
    indexedAt: Instant.orThrow(indexedAt),
    author: AUTHOR,
  });
const subscribedPost = (n: number, indexedAt: number, text = `post ${n}`) =>
  BlueskyFetchedNotification.orThrow({
    uri: `at://did:plc:alice/app.bsky.feed.post/${n}`,
    reason: 'subscribed-post',
    subjectUri: null,
    text,
    indexedAt: Instant.orThrow(indexedAt),
    author: AUTHOR,
  });
const fresh = (n: number) => like(n, NOW - n * 1000);

const pageOf = (
  items: BlueskyFetchedNotification[],
  cursor: string | undefined,
  dropped = 0,
): BlueskyNotificationPage => ({ items, cursor, dropped });

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

const setup = (
  pages: ReadonlyArray<BlueskyNotificationPage | BlueskyClientError>,
  options: { owner?: boolean; subscriptions?: number } = {},
) => {
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  const { db, sqlite, queries } = fixture;
  const seed = createMastodonSeed(fixture);
  const owner = options.owner === false ? undefined : seed.addLocalActor('kosui');
  for (let index = 0; owner !== undefined && index < (options.subscriptions ?? 1); index++) {
    sqlite.prepare(
      'INSERT INTO push_subscriptions(subscriptionId,userId,endpoint,p256dhKey,authKey,createdAt) VALUES (?,?,?,?,?,?)',
    ).run(seed.uuid(), owner.userId, `https://push.example/${index}`, 'p256dh', 'auth', 1);
  }
  const queue = [...pages];
  const fetch = vi.fn(async (_input: { limit: number; cursor: string | undefined }) => {
    const next = queue.shift();
    if (next === undefined) throw new Error('unexpected fetch');
    return 'type' in next ? RA.err(next) : RA.ok(next);
  });
  const fetcher: BlueskyNotificationFetcher = { fetch };
  const createdStore = createD1BlueskyNotificationCreatedStore(db, { now: () => NOW });
  const originalStore = createdStore.store.bind(createdStore);
  const store = vi.spyOn(createdStore, 'store');
  const subscriptionsResolver = createD1PushSubscriptionsResolverByUserId(db);
  const resolveSubscriptions = vi.spyOn(subscriptionsResolver, 'resolve');
  const send = vi.fn<WebPushSender['send']>(async () => RA.ok(undefined));
  const useCase = CollectBlueskyNotificationsUseCase.create({
    fetcher,
    ownerUsername: Username.parseOrThrow('kosui'),
    userResolverByUsername: createD1UserResolverByUsername(db),
    syncStateResolver: createD1BlueskyNotificationSyncStateResolver(db),
    initialSyncCompletedStore: createD1BlueskyNotificationInitialSyncCompletedStore(db),
    existingUrisResolver: createD1BlueskyNotificationExistingUrisResolver(db),
    postIdsResolver: createD1PostIdsResolverByBlueskyUris(db),
    createdStore,
    pushSubscriptionsResolverByUserId: subscriptionsResolver,
    webPushSender: { send },
    now: () => NOW,
  });
  const count = (table: string) => (sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
  const rows = () =>
    sqlite.prepare(
      'SELECT n.notificationId, n.type, n.isRead, n.createdAt, b.blueskyUri, b.reason, b.subjectUri, b.targetPostId, b.text FROM notifications n JOIN notification_bluesky b ON b.notificationId = n.notificationId ORDER BY n.createdAt, b.blueskyUri',
    ).all() as Array<{
      notificationId: string;
      type: string;
      isRead: number;
      createdAt: number;
      blueskyUri: string;
      reason: string;
      subjectUri: string | null;
      targetPostId: string | null;
      text: string | null;
    }>;
  const enqueue = (...next: Array<BlueskyNotificationPage | BlueskyClientError>) => queue.push(...next);
  const writes = (from: number) => queries.slice(from).filter((query) => /^\s*(insert|update|delete)/i.test(query.sql));
  return {
    ...fixture,
    seed,
    owner,
    fetch,
    store,
    originalStore,
    resolveSubscriptions,
    send,
    useCase,
    count,
    rows,
    enqueue,
    writes,
  };
};

describe('CollectBlueskyNotificationsUseCase', () => {
  it('所有者が見つからないときは、取得も保存もせず Ok を返す', async () => {
    const t = setup([], { owner: false });

    const result = await t.useCase.run();

    expect(result).toEqual({
      ok: true,
      val: { pages: 0, fetched: 0, saved: 0, dropped: 0, pushed: 0 },
      err: undefined,
    });
    expect(t.fetch).not.toHaveBeenCalled();
  });

  it('初回の取り込みは通知、記録、イベントを保存し、Push を送らない', async () => {
    const t = setup([pageOf([like(1, NOW - MINUTE), follow(2, NOW - 2 * MINUTE)], undefined, 1)]);

    const result = await t.useCase.run();

    expect(result).toMatchObject({ ok: true, val: { pages: 1, fetched: 2, saved: 2, dropped: 1, pushed: 0 } });
    expect(t.fetch).toHaveBeenCalledWith({ limit: 100, cursor: undefined });
    expect(t.send).not.toHaveBeenCalled();
    expect(t.resolveSubscriptions).not.toHaveBeenCalled();
    expect(t.rows().map((row) => [row.type, row.reason, row.isRead, row.createdAt])).toEqual([
      ['blueskyFollow', 'follow', 0, NOW - 2 * MINUTE],
      ['blueskyLike', 'like', 0, NOW - MINUTE],
    ]);
    expect(t.count('bluesky_notification_receipts')).toBe(2);
    expect(t.count('bluesky_notification_sync_state')).toBe(1);
    expect(t.sqlite.prepare('SELECT eventName, occurredAt FROM domain_events ORDER BY occurredAt').all()).toEqual([
      { eventName: 'notification.blueskyNotificationCreated', occurredAt: NOW - 2 * MINUTE },
      { eventName: 'notification.blueskyNotificationCreated', occurredAt: NOW - MINUTE },
    ]);
  });

  it('2 回目以降の新しい通知を、購読を 1 回だけ取得して Push で送る', async () => {
    const t = setup([pageOf([like(1, NOW - 30 * MINUTE)], undefined)], { subscriptions: 2 });
    await t.useCase.run();
    t.enqueue(pageOf([like(3, NOW - MINUTE), follow(2, NOW - 2 * MINUTE)], undefined));

    const result = await t.useCase.run();

    expect(result).toMatchObject({ ok: true, val: { saved: 2, pushed: 4 } });
    expect(t.resolveSubscriptions).toHaveBeenCalledOnce();
    expect(t.send).toHaveBeenCalledTimes(4);
    const payloads = t.send.mock.calls.map(([, payload]) => payload);
    expect(payloads.slice(0, 2)).toEqual([
      { title: '新しいいいね', body: 'Alice があなたの投稿にいいねしました', url: '/notifications' },
      { title: '新しいいいね', body: 'Alice があなたの投稿にいいねしました', url: '/notifications' },
    ]);
    expect(payloads.slice(2)).toEqual([
      { title: '新しいフォロー', body: 'Alice があなたをフォローしました', url: '/notifications' },
      { title: '新しいフォロー', body: 'Alice があなたをフォローしました', url: '/notifications' },
    ]);
  });

  it('like-via-repost、repost-via-repost、subscribed-post を保存し、既存と同じ形式で Push で送る', async () => {
    const original = 'at://did:plc:other/app.bsky.feed.post/3korig';
    const t = setup([pageOf([like(1, NOW - 30 * MINUTE)], undefined)]);
    await t.useCase.run();
    t.enqueue(pageOf([
      viaRepost('like-via-repost', 2, NOW - 3 * MINUTE, original),
      viaRepost('repost-via-repost', 3, NOW - 2 * MINUTE, original),
      subscribedPost(4, NOW - MINUTE, 'new post'),
    ], undefined));

    const result = await t.useCase.run();

    expect(result).toMatchObject({ ok: true, val: { saved: 3, pushed: 3 } });
    expect(t.rows().slice(1).map((row) => [row.type, row.reason, row.subjectUri, row.targetPostId, row.text])).toEqual([
      ['blueskyLikeViaRepost', 'like-via-repost', original, null, null],
      ['blueskyRepostViaRepost', 'repost-via-repost', original, null, null],
      ['blueskySubscribedPost', 'subscribed-post', null, null, 'new post'],
    ]);
    expect(t.send.mock.calls.map(([, payload]) => payload)).toEqual([
      { title: '新しい投稿', body: 'Alice が投稿しました', url: '/notifications' },
      { title: '新しいリポスト', body: 'Alice があなたのリポストをリポストしました', url: '/notifications' },
      { title: '新しいいいね', body: 'Alice があなたのリポストにいいねしました', url: '/notifications' },
    ]);
  });

  it('15 分より古い通知は保存するが、Push しない', async () => {
    const t = setup([pageOf([like(1, NOW - 40 * MINUTE)], undefined)]);
    await t.useCase.run();
    t.enqueue(pageOf([like(3, NOW - MINUTE), like(2, NOW - 16 * MINUTE)], undefined));

    const result = await t.useCase.run();

    expect(result).toMatchObject({ ok: true, val: { saved: 2, pushed: 1 } });
    expect(t.send).toHaveBeenCalledTimes(1);
    expect(t.count('notification_bluesky')).toBe(3);
  });

  it('1 回の上限を超えた分は、件数をまとめた 1 通にする', async () => {
    const t = setup([pageOf([like(100, NOW - 60 * MINUTE)], undefined)]);
    await t.useCase.run();
    t.enqueue(pageOf([1, 2, 3, 4, 5, 6, 7].map((n) => like(n, NOW - n * 1000)), undefined));

    const result = await t.useCase.run();

    expect(result).toMatchObject({ ok: true, val: { saved: 7, pushed: 6 } });
    expect(t.send).toHaveBeenCalledTimes(6);
    expect(t.send.mock.calls[5]?.[1]).toEqual({
      title: 'Bluesky の新しい通知',
      body: 'ほか 2 件の通知があります',
      url: '/notifications',
    });
  });

  it('Push が例外や Err で失敗しても、取り込みは Ok にし console.error だけ出す', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const t = setup([pageOf([like(100, NOW - 60 * MINUTE)], undefined)], { subscriptions: 2 });
    await t.useCase.run();
    t.send.mockRejectedValueOnce(new Error('network down'));
    t.send.mockReturnValueOnce(RA.err({ type: 'SendError' as const, message: 'gone', statusCode: 410 }));
    t.enqueue(pageOf([like(1, NOW - MINUTE), like(2, NOW - 2 * MINUTE)], undefined));

    const result = await t.useCase.run();

    expect(result).toMatchObject({ ok: true, val: { saved: 2, pushed: 2 } });
    expect(error).toHaveBeenCalledTimes(2);
    expect(t.count('notification_bluesky')).toBe(3);
  });

  it('crosspost の送信済みの投稿と一致する subjectUri だけ targetPostId にし、一致しなければ null で保存する', async () => {
    const t = setup([
      pageOf([
        like(1, NOW - MINUTE),
        like(2, NOW - 2 * MINUTE, 'at://did:plc:me/app.bsky.feed.post/3kpending'),
        like(3, NOW - 3 * MINUTE, 'at://did:plc:me/app.bsky.feed.post/3kother'),
      ], undefined),
    ]);
    const sentPostId = t.seed.uuid();
    const pendingPostId = t.seed.uuid();
    const insert = t.sqlite.prepare(
      'INSERT INTO bluesky_crossposts(postId,status,uri,attempts,createdAt,updatedAt) VALUES (?,?,?,?,?,?)',
    );
    insert.run(sentPostId, 'sent', SUBJECT, 1, 1, 1);
    insert.run(pendingPostId, 'pending', 'at://did:plc:me/app.bsky.feed.post/3kpending', 0, 1, 1);

    await t.useCase.run();

    expect(t.rows().map((row) => [row.blueskyUri.split('/').pop(), row.targetPostId])).toEqual([
      ['3', null],
      ['2', null],
      ['1', sentPostId],
    ]);
  });

  it('自分の投稿でない返信も、本文つきで保存する', async () => {
    const t = setup([
      pageOf([
        reply(1, NOW - MINUTE, 'at://did:plc:someone/app.bsky.feed.post/3kelse', 'thread reply'),
        reply(2, NOW - 2 * MINUTE, null, 'no parent'),
      ], undefined),
    ]);

    await t.useCase.run();

    expect(t.rows().map((row) => [row.type, row.reason, row.subjectUri, row.targetPostId, row.text])).toEqual([
      ['blueskyMention', 'reply', null, null, 'no parent'],
      ['blueskyMention', 'reply', 'at://did:plc:someone/app.bsky.feed.post/3kelse', null, 'thread reply'],
    ]);
  });

  it('既存の記録に当たったページで止まり、新しい分だけ保存する', async () => {
    const t = setup([pageOf([like(1, NOW - 10 * MINUTE)], undefined)]);
    await t.useCase.run();
    t.enqueue(pageOf([like(3, NOW - MINUTE), like(2, NOW - 2 * MINUTE), like(1, NOW - 10 * MINUTE)], 'older'));
    t.fetch.mockClear();

    const result = await t.useCase.run();

    expect(t.fetch).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ ok: true, val: { pages: 1, fetched: 3, saved: 2 } });
    expect(t.count('notification_bluesky')).toBe(3);
  });

  it('retention の外に達したページで止まり、その外の通知は保存しない', async () => {
    const t = setup([
      pageOf([like(1, NOW - DAY), like(2, NOW - 31 * DAY)], 'older'),
    ]);

    const result = await t.useCase.run();

    expect(t.fetch).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ ok: true, val: { pages: 1, fetched: 1, saved: 1 } });
    expect(t.rows().map((row) => row.blueskyUri)).toEqual(['at://did:plc:alice/app.bsky.feed.like/1']);
  });

  it('cursor が無ければ止まり、cursor があって既存も retention 外も無ければ最大 5 ページまで取得する', async () => {
    const single = setup([pageOf([fresh(1)], undefined)]);
    await single.useCase.run();
    expect(single.fetch).toHaveBeenCalledOnce();

    const many = setup([1, 2, 3, 4, 5, 6].map((n) => pageOf([fresh(n)], `c${n}`)));
    const result = await many.useCase.run();

    expect(many.fetch).toHaveBeenCalledTimes(5);
    expect(many.fetch.mock.calls.map(([input]) => input.cursor)).toEqual([undefined, 'c1', 'c2', 'c3', 'c4']);
    expect(result).toMatchObject({ ok: true, val: { pages: 5, saved: 5 } });
  });

  it('ページをまたいだ uri の重複を 1 件にし、dropped をページごとに合計する', async () => {
    const t = setup([pageOf([fresh(1), fresh(2)], 'next', 2), pageOf([fresh(2), fresh(3)], undefined, 3)]);

    const result = await t.useCase.run();

    expect(result).toMatchObject({ ok: true, val: { pages: 2, fetched: 3, saved: 3, dropped: 5 } });
  });

  it('途中のページの取得が失敗したら、何も保存せず Err を返す', async () => {
    const failure: BlueskyClientError = {
      type: 'BlueskyClientError',
      kind: 'http',
      message: 'listNotifications failed: status 500',
      status: 500,
    };
    const t = setup([pageOf([fresh(1), fresh(2)], 'next'), failure]);

    const result = await t.useCase.run();

    expect(result).toEqual({ ok: false, err: failure, val: undefined });
    expect(t.store).not.toHaveBeenCalled();
    expect(t.count('notifications')).toBe(0);
    expect(t.count('bluesky_notification_receipts')).toBe(0);
    expect(t.count('bluesky_notification_sync_state')).toBe(0);
    expect(t.writes(0)).toEqual([]);
  });

  it('dismiss した通知は、同じ通知が再び取得されても復活しない', async () => {
    const t = setup([pageOf([like(1, NOW - 5 * MINUTE)], undefined)]);
    await t.useCase.run();
    const [saved] = t.rows();
    await createD1NotificationDismissedStore(t.db).store(
      Notification.dismissNotification({
        type: 'blueskyFollow',
        notificationId: NotificationId.orThrow(saved!.notificationId),
        recipientUserId: UserId.orThrow(t.owner!.userId),
        isRead: false,
        blueskyUri: saved!.blueskyUri,
        author: AUTHOR,
      }, NOW),
    );
    expect(t.count('notifications')).toBe(0);
    t.enqueue(pageOf([like(1, NOW - 5 * MINUTE)], undefined));

    const result = await t.useCase.run();

    expect(result).toMatchObject({ ok: true, val: { saved: 0, pushed: 0 } });
    expect(t.count('notifications')).toBe(0);
    expect(t.count('notification_bluesky')).toBe(0);
    expect(t.count('bluesky_notification_receipts')).toBe(1);
    expect(t.send).not.toHaveBeenCalled();
  });

  it('新しい行が無い実行は、D1 に書かない', async () => {
    const t = setup([pageOf([fresh(1)], undefined)]);
    await t.useCase.run();
    t.enqueue(pageOf([fresh(1)], undefined), pageOf([], undefined, 2));
    t.store.mockClear();
    const before = t.queries.length;

    const same = await t.useCase.run();
    const empty = await t.useCase.run();

    expect(same).toMatchObject({ ok: true, val: { saved: 0, pushed: 0 } });
    expect(empty).toMatchObject({ ok: true, val: { saved: 0, dropped: 2 } });
    expect(t.store).not.toHaveBeenCalled();
    expect(t.writes(before)).toEqual([]);
  });

  it('21 件以上は古い順に 20 件ずつ store に渡し、どの文も D1 の束縛上限に収まる', async () => {
    const items = Array.from({ length: 45 }, (_, index) => like(index + 1, NOW - (index + 1) * 1000));
    const t = setup([pageOf(items.slice(0, 45), undefined)]);

    const result = await t.useCase.run();

    expect(result).toMatchObject({ ok: true, val: { fetched: 45, saved: 45, pushed: 0 } });
    const batches = t.store.mock.calls as unknown as Array<Array<{ occurredAt: number }>>;
    expect(batches.map((batch) => batch.length)).toEqual([20, 20, 5]);
    const occurredAts = batches.flat().map((event) => event.occurredAt);
    expect(occurredAts).toEqual([...occurredAts].sort((a, b) => a - b));
    expect(t.count('notifications')).toBe(45);
    expect(t.count('notification_bluesky')).toBe(45);
    expect(t.count('bluesky_notification_receipts')).toBe(45);
    expect(t.count('domain_events')).toBe(45);
    expect(Math.max(...t.queries.map((query) => query.params.length))).toBeLessThanOrEqual(100);
  });

  it('初回が 0 件でも状態を書き、最初に届いた通知を Push で送る', async () => {
    const t = setup([pageOf([], undefined)]);

    const first = await t.useCase.run();
    t.enqueue(pageOf([like(1, NOW - MINUTE)], undefined));
    const second = await t.useCase.run();

    expect(first).toMatchObject({ ok: true, val: { saved: 0, pushed: 0 } });
    expect(second).toMatchObject({ ok: true, val: { saved: 1, pushed: 1 } });
    expect(t.count('bluesky_notification_sync_state')).toBe(1);
    expect(t.send).toHaveBeenCalledOnce();
  });

  it('受信の記録を全部消しても、状態があれば次の通知を Push で送る', async () => {
    const t = setup([pageOf([like(1, NOW - 40 * DAY)], undefined)]);
    await t.useCase.run();
    t.sqlite.prepare('DELETE FROM bluesky_notification_receipts').run();
    t.enqueue(pageOf([like(2, NOW - MINUTE)], undefined));

    const result = await t.useCase.run();

    expect(result).toMatchObject({ ok: true, val: { saved: 1, pushed: 1 } });
    expect(t.count('bluesky_notification_receipts')).toBe(1);
    expect(t.count('bluesky_notification_sync_state')).toBe(1);
  });

  it('初回の途中のチャンクの保存に失敗したら状態を書かず、次の実行も初回として Push しない', async () => {
    const items = Array.from({ length: 25 }, (_, index) => fresh(index + 1));
    const t = setup([pageOf(items, undefined)]);
    t.store.mockImplementationOnce(t.originalStore).mockRejectedValueOnce(new Error('d1 down'));

    await expect(t.useCase.run()).rejects.toThrow('d1 down');
    expect(t.count('bluesky_notification_sync_state')).toBe(0);
    expect(t.count('notification_bluesky')).toBe(20);
    t.enqueue(pageOf(items, undefined));
    const retry = await t.useCase.run();

    expect(retry).toMatchObject({ ok: true, val: { saved: 5, pushed: 0 } });
    expect(t.send).not.toHaveBeenCalled();
    expect(t.count('bluesky_notification_sync_state')).toBe(1);
  });

  it('2 回目以降の createdAt は取り込み時刻から 1ms ずつ増やし、同じ実行内のページングで欠落しない', async () => {
    const t = setup([pageOf([fresh(1)], undefined)]);
    await t.useCase.run();
    t.enqueue(pageOf([like(4, NOW - MINUTE), like(3, NOW - 2 * MINUTE), like(2, NOW - 3 * MINUTE)], undefined));

    await t.useCase.run();

    const added = t.rows().filter((row) => row.createdAt >= NOW);
    expect(added.map((row) => [row.blueskyUri.split('/').pop(), row.createdAt])).toEqual([
      ['2', NOW],
      ['3', NOW + 1],
      ['4', NOW + 2],
    ]);
    const resolver = createD1NotificationsResolverByPage(t.db);
    const ids: string[] = [];
    let olderThanId: string | undefined;
    for (let pageIndex = 0; pageIndex < 4; pageIndex++) {
      const items = await resolver.resolve({
        recipientUserId: UserId.orThrow(t.owner!.userId),
        page: { limit: 1, olderThanId, newerThanId: undefined, order: 'newestFirst' },
        types: ['blueskyLike'],
      });
      const [item] = items.val ?? [];
      if (item === undefined) break;
      ids.push(item.notification.notificationId);
      olderThanId = item.notification.notificationId;
    }
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    const grouped = t.rows().map((row) => toGroupedNotificationId(row.notificationId, row.createdAt));
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it('初回の createdAt は indexedAt で、同じ indexedAt の通知は 1ms ずつ増やして重複させない', async () => {
    const t = setup([pageOf([like(1, NOW - MINUTE), like(2, NOW - MINUTE), like(3, NOW - 2 * MINUTE)], undefined)]);

    await t.useCase.run();

    expect(t.rows().map((row) => [row.blueskyUri.split('/').pop(), row.createdAt])).toEqual([
      ['3', NOW - 2 * MINUTE],
      ['2', NOW - MINUTE],
      ['1', NOW - MINUTE + 1],
    ]);
  });

  it('未来の indexedAt は現在時刻に丸めて保存する', async () => {
    const t = setup([pageOf([like(1, NOW + 5 * MINUTE)], undefined)]);

    await t.useCase.run();

    expect(t.rows().map((row) => row.createdAt)).toEqual([NOW]);
  });
});
