import { afterEach, describe, expect, it } from 'vitest';

import { Instant } from '../../../domain/instant/instant.ts';
import { Marker } from '../../../domain/marker/marker.ts';
import { Notification } from '../../../domain/notification/notification.ts';
import { NotificationId } from '../../../domain/notification/notificationId.ts';
import type { PageRequest } from '../../../domain/page/page.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { createD1MarkerSavedStore } from '../marker/markerSavedStore.ts';
import { createD1MarkersResolverByUserId } from '../marker/markersResolverByUserId.ts';
import {
  createD1NotificationDismissedStore,
  createD1NotificationsClearedStore,
} from '../notification/inboxNotificationAdapters.ts';
import { createD1NotificationCountResolverSinceMarker } from '../notification/notificationCountResolverSinceMarker.ts';
import { createD1NotificationResolverByUserIdAndId } from '../notification/notificationResolverByUserIdAndId.ts';
import { createD1NotificationsResolverByPage } from '../notification/notificationsResolverByPage.ts';
import { createMastodonSeed } from './mastodonSeed.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

const page = (overrides: Partial<PageRequest> = {}): PageRequest => ({
  limit: 20,
  olderThanId: undefined,
  newerThanId: undefined,
  order: 'newestFirst',
  ...overrides,
});

const allTypes: Notification['type'][] = ['like', 'reply', 'follow', 'emojiReact'];
const mastodonTypes: Notification['type'][] = ['like', 'reply', 'follow'];

const seedNotifications = () => {
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  const seed = createMastodonSeed(fixture);
  const me = seed.addLocalActor('kosui');
  const other = seed.addLocalActor('other');
  const alice = seed.addRemoteActor('alice');
  const myPost = seed.addLocalPost(me, 1_000);
  const aliceReply = seed.addRemotePost(alice, 1_500, { timeline: false });
  const ids = {
    like: seed.addLikeNotification(me.userId, alice.actorId, myPost.postId, 2_000),
    reply: seed.addReplyNotification(me.userId, alice.actorId, aliceReply.postId, myPost.postId, 3_000),
    follow: seed.addFollowNotification(me.userId, alice.actorId, 4_000),
    emoji: seed.addEmojiReactNotification(me.userId, alice.actorId, myPost.postId, 5_000, ':wave:', 'https://e/w.png'),
    others: seed.addLikeNotification(other.userId, alice.actorId, myPost.postId, 6_000),
  };
  const resolveByPage = (
    input: Partial<PageRequest> = {},
    types: Notification['type'][] = mastodonTypes,
  ) =>
    createD1NotificationsResolverByPage(fixture.db).resolve({
      recipientUserId: UserId.orThrow(me.userId),
      page: page(input),
      types,
    });
  const idsOf = async (...args: Parameters<typeof resolveByPage>) => {
    const result = await resolveByPage(...args);
    return result.ok ? result.val.map((item) => item.notification.notificationId as string) : undefined;
  };
  return { ...fixture, seed, me, other, alice, myPost, ids, idsOf, resolveByPage };
};

describe('createD1NotificationsResolverByPage', () => {
  it('新しい順に返し、他人の通知と emojiReact を含めない', async () => {
    const t = seedNotifications();

    expect(await t.idsOf()).toEqual([t.ids.follow, t.ids.reply, t.ids.like]);
  });

  it('子表から通知の種類ごとの値を復元する', async () => {
    const t = seedNotifications();

    const result = await t.resolveByPage({}, allTypes);

    expect(result.ok && result.val.map((item) => item.notification)).toMatchObject([
      { type: 'emojiReact', emoji: ':wave:', emojiImageUrl: 'https://e/w.png', reactedPostId: t.myPost.postId },
      { type: 'follow', followerActorId: t.alice.actorId },
      { type: 'reply', replierActorId: t.alice.actorId, originalPostId: t.myPost.postId },
      { type: 'like', likerActorId: t.alice.actorId, likedPostId: t.myPost.postId },
    ]);
    expect(result.ok && result.val[0]?.createdAt).toBe(5_000);
  });

  it('types に含まれる種類だけを返し、emojiReact は明示されたときだけ返す', async () => {
    const t = seedNotifications();

    expect(await t.idsOf({}, ['like'])).toEqual([t.ids.like]);
    expect(await t.idsOf({}, ['emojiReact'])).toEqual([t.ids.emoji]);
    expect(await t.idsOf({}, [])).toEqual([]);
  });

  it('limit を絞り込みの後に当てる', async () => {
    const t = seedNotifications();

    expect(await t.idsOf({ limit: 2 }, ['like', 'reply'])).toEqual([t.ids.reply, t.ids.like]);
    expect(await t.idsOf({ limit: 1 })).toEqual([t.ids.follow]);
  });

  it('max_id、since_id、min_id でページを送る', async () => {
    const t = seedNotifications();

    expect(await t.idsOf({ olderThanId: t.ids.follow })).toEqual([t.ids.reply, t.ids.like]);
    expect(await t.idsOf({ newerThanId: t.ids.like })).toEqual([t.ids.follow, t.ids.reply]);
    expect(await t.idsOf({ newerThanId: t.ids.like, limit: 1, order: 'oldestFirst' })).toEqual([t.ids.reply]);
  });

  it('同じ時刻の通知は ID で順序を決める', async () => {
    const t = seedNotifications();
    const sameA = t.seed.addFollowNotification(t.me.userId, t.alice.actorId, 7_000);
    const sameB = t.seed.addFollowNotification(t.me.userId, t.alice.actorId, 7_000);

    const first = await t.idsOf({ limit: 1 });
    const next = await t.idsOf({ olderThanId: first?.[0], limit: 1 });

    expect([first, next]).toEqual([[sameB], [sameA]]);
  });

  it('存在しない ID を cursor にすると空を返す', async () => {
    const t = seedNotifications();

    expect(await t.idsOf({ olderThanId: t.seed.uuid() })).toEqual([]);
    expect(await t.idsOf({ newerThanId: t.seed.uuid() })).toEqual([]);
  });

  it('他人の通知の ID を cursor にしても、その位置から自分の通知を返す', async () => {
    const t = seedNotifications();

    expect(await t.idsOf({ olderThanId: t.ids.others })).toEqual([t.ids.follow, t.ids.reply, t.ids.like]);
  });

  it('D1 の変数の上限に収まる', async () => {
    const t = seedNotifications();
    for (let n = 0; n < 80; n++) t.seed.addFollowNotification(t.me.userId, t.alice.actorId, 10_000 + n);

    const ids = await t.idsOf({ limit: 80 });

    expect(ids).toHaveLength(80);
  });
});

describe('createD1NotificationResolverByUserIdAndId', () => {
  it('自分の通知だけを返す', async () => {
    const t = seedNotifications();
    const resolver = createD1NotificationResolverByUserIdAndId(t.db);
    const resolve = (recipient: string, id: string) =>
      resolver.resolve({ recipientUserId: UserId.orThrow(recipient), notificationId: NotificationId.orThrow(id) });

    const mine = await resolve(t.me.userId, t.ids.like);
    const others = await resolve(t.me.userId, t.ids.others);
    const missing = await resolve(t.me.userId, t.seed.uuid());

    expect(mine.ok && mine.val?.notification).toMatchObject({ type: 'like', notificationId: t.ids.like });
    expect(others.ok && others.val).toBeUndefined();
    expect(missing.ok && missing.val).toBeUndefined();
  });
});

describe('createD1NotificationCountResolverSinceMarker', () => {
  const count = (t: ReturnType<typeof seedNotifications>, limit = 100, userId = t.me.userId) =>
    createD1NotificationCountResolverSinceMarker(t.db).resolve({
      userId: UserId.orThrow(userId),
      types: mastodonTypes,
      limit,
    });

  it('マーカーがなければ全件を数え、emojiReact と他人の通知を数えない', async () => {
    const t = seedNotifications();

    expect(await count(t)).toEqual({ ok: true, val: 3, err: undefined });
  });

  it('マーカーの通知より新しいものだけを数える', async () => {
    const t = seedNotifications();
    t.seed.setMarker(t.me.userId, 'notifications', t.ids.reply);

    expect(await count(t)).toEqual({ ok: true, val: 1, err: undefined });
  });

  it('home のマーカーは数えるときに使わない', async () => {
    const t = seedNotifications();
    t.seed.setMarker(t.me.userId, 'home', t.ids.follow);

    expect(await count(t)).toEqual({ ok: true, val: 3, err: undefined });
  });

  it('マーカーの ID が通知として存在しなければ全件を数える', async () => {
    const t = seedNotifications();
    t.seed.setMarker(t.me.userId, 'notifications', 'not-a-notification');

    expect(await count(t)).toEqual({ ok: true, val: 3, err: undefined });
  });

  it('他人の通知を指すマーカーは、存在しない ID と同じく全件を数える', async () => {
    const t = seedNotifications();
    t.seed.setMarker(t.me.userId, 'notifications', t.ids.others);

    expect(await count(t)).toEqual({ ok: true, val: 3, err: undefined });
  });

  it('limit で件数を頭打ちにする', async () => {
    const t = seedNotifications();

    expect(await count(t, 2)).toEqual({ ok: true, val: 2, err: undefined });
  });
});

describe('通知の削除と notifications のマーカー', () => {
  const dismiss = (t: ReturnType<typeof seedNotifications>, notificationId: string) =>
    createD1NotificationDismissedStore(t.db).store(
      Notification.dismissNotification({
        type: 'like',
        notificationId: NotificationId.orThrow(notificationId),
        recipientUserId: UserId.orThrow(t.me.userId),
        isRead: false,
        likerActorId: t.alice.actorId as never,
        likedPostId: t.myPost.postId as never,
      }, Instant.orThrow(9_000)),
    );
  const unread = (t: ReturnType<typeof seedNotifications>) =>
    createD1NotificationCountResolverSinceMarker(t.db).resolve({
      userId: UserId.orThrow(t.me.userId),
      types: mastodonTypes,
      limit: 100,
    });
  const markerOf = (t: ReturnType<typeof seedNotifications>, timeline: string) =>
    t.sqlite.prepare('SELECT lastReadId FROM mastodon_markers WHERE userId = ? AND timeline = ?').get(
      t.me.userId,
      timeline,
    ) as { lastReadId: string } | undefined;

  it('マーカーが指す最新の通知を削除しても、未読件数が増えない', async () => {
    const t = seedNotifications();
    t.seed.setMarker(t.me.userId, 'notifications', t.ids.follow);
    expect(await unread(t)).toEqual({ ok: true, val: 0, err: undefined });

    await dismiss(t, t.ids.follow);

    expect(await unread(t)).toEqual({ ok: true, val: 0, err: undefined });
    expect(markerOf(t, 'notifications')).toEqual({ lastReadId: t.ids.reply });
  });

  it('マーカーが指す通知より古い自分の通知がなければ、マーカーを消す', async () => {
    const t = seedNotifications();
    t.seed.setMarker(t.me.userId, 'notifications', t.ids.like);

    await dismiss(t, t.ids.like);

    expect(markerOf(t, 'notifications')).toBeUndefined();
  });

  it('マーカーが指さない通知の削除では、マーカーを変えない', async () => {
    const t = seedNotifications();
    t.seed.setMarker(t.me.userId, 'notifications', t.ids.reply);

    await dismiss(t, t.ids.follow);

    expect(markerOf(t, 'notifications')).toEqual({ lastReadId: t.ids.reply });
  });

  it('全件削除は notifications のマーカーだけを消す', async () => {
    const t = seedNotifications();
    t.seed.setMarker(t.me.userId, 'notifications', t.ids.reply);
    t.seed.setMarker(t.me.userId, 'home', 'h');

    await createD1NotificationsClearedStore(t.db).store(
      Notification.clearNotifications(UserId.orThrow(t.me.userId), Instant.orThrow(9_000)),
    );

    expect(markerOf(t, 'notifications')).toBeUndefined();
    expect(markerOf(t, 'home')).toEqual({ lastReadId: 'h' });
    expect(t.sqlite.prepare('SELECT count(*) AS n FROM notifications WHERE recipientUserId = ?').get(t.me.userId))
      .toMatchObject({ n: 0 });
  });
});

describe('マーカーの保存と取得', () => {
  it('同じ timeline への保存で version を進め、別の timeline と別のユーザーには影響しない', async () => {
    const fixture = createSqliteD1Fixture();
    fixtures.push(fixture);
    const seed = createMastodonSeed(fixture);
    const me = UserId.orThrow(seed.addLocalActor('kosui').userId);
    const other = UserId.orThrow(seed.addLocalActor('other').userId);
    const store = createD1MarkerSavedStore(fixture.db);
    const resolver = createD1MarkersResolverByUserId(fixture.db);
    const first = Marker.save({ userId: me, timeline: 'home', lastReadId: 'a' }, undefined, Instant.orThrow(1_000));
    const second = Marker.save(
      { userId: me, timeline: 'home', lastReadId: 'b' },
      first.aggregateState,
      Instant.orThrow(2_000),
    );
    const notifications = Marker.save(
      { userId: me, timeline: 'notifications', lastReadId: 'n' },
      undefined,
      Instant.orThrow(2_000),
    );
    const others = Marker.save({ userId: other, timeline: 'home', lastReadId: 'x' }, undefined, Instant.orThrow(1));

    await store.store(first);
    await store.store(second, notifications, others);

    const markers = await resolver.resolve({ userId: me, timelines: ['home', 'notifications'] });
    const homeOnly = await resolver.resolve({ userId: me, timelines: ['home'] });
    const none = await resolver.resolve({ userId: me, timelines: [] });
    const events = fixture.sqlite.prepare('SELECT count(*) AS n FROM domain_events WHERE aggregateName = ?').get(
      'marker',
    );

    expect(markers.ok && markers.val).toMatchObject([
      { timeline: 'home', lastReadId: 'b', version: 2, updatedAt: 2_000 },
      { timeline: 'notifications', lastReadId: 'n', version: 1, updatedAt: 2_000 },
    ]);
    expect(homeOnly.ok && homeOnly.val).toHaveLength(1);
    expect(none.ok && none.val).toEqual([]);
    expect(events).toMatchObject({ n: 4 });
  });
});
