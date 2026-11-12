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
  createD1MentionNotificationCreatedStore,
  createD1MentionNotificationDeletedStore,
  createD1MentionNotificationResolverByRecipientAndMentionPostId,
  createD1MentionNotificationsResolverByMentionPostId,
  createD1NotificationDismissedStore,
  createD1NotificationsClearedStore,
  createD1RepostNotificationCreatedStore,
  createD1RepostNotificationResolverByRecipientAndActorIdAndPostId,
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

describe('ブロックした相手の通知', () => {
  const blockedTypes: Notification['type'][] = ['like', 'mention'];
  const seedBlocked = () => {
    const t = seedNotifications();
    const bob = t.seed.addRemoteActor('bob');
    const aliceMentionPost = t.seed.addRemotePost(t.alice, 8_000, { timeline: false });
    const bobMentionPost = t.seed.addRemotePost(bob, 8_100, { timeline: false });
    const blocked = {
      like: t.ids.like,
      mention: t.seed.addMentionNotification(t.me.userId, t.alice.actorId, aliceMentionPost.postId, 9_000),
    };
    const visible = {
      like: t.seed.addLikeNotification(t.me.userId, bob.actorId, t.myPost.postId, 9_500),
      mention: t.seed.addMentionNotification(t.me.userId, bob.actorId, bobMentionPost.postId, 9_600),
    };
    t.seed.addBlock(t.me.userId, t.alice.actorId);
    return { ...t, bob, blocked, visible };
  };

  it('一覧から、ブロックした相手のいいねとメンションを除く', async () => {
    const t = seedBlocked();

    expect(await t.idsOf({}, blockedTypes)).toEqual([t.visible.mention, t.visible.like]);
  });

  it('件数から、ブロックした相手のいいねとメンションを除く', async () => {
    const t = seedBlocked();

    const unread = await createD1NotificationCountResolverSinceMarker(t.db).resolve({
      userId: UserId.orThrow(t.me.userId),
      types: blockedTypes,
      limit: 100,
    });

    expect(unread).toEqual({ ok: true, val: 2, err: undefined });
  });

  it('1件の取得で、ブロックした相手のいいねとメンションを返さない', async () => {
    const t = seedBlocked();
    const resolver = createD1NotificationResolverByUserIdAndId(t.db);
    const resolve = (id: string) =>
      resolver.resolve({ recipientUserId: UserId.orThrow(t.me.userId), notificationId: NotificationId.orThrow(id) });

    const blockedLike = await resolve(t.blocked.like);
    const blockedMention = await resolve(t.blocked.mention);
    const visibleLike = await resolve(t.visible.like);
    const visibleMention = await resolve(t.visible.mention);

    expect(blockedLike.ok && blockedLike.val).toBeUndefined();
    expect(blockedMention.ok && blockedMention.val).toBeUndefined();
    expect(visibleLike.ok && visibleLike.val?.notification).toMatchObject({ type: 'like' });
    expect(visibleMention.ok && visibleMention.val?.notification).toMatchObject({ type: 'mention' });
  });

  it('ほかのユーザーのブロックは、自分の通知に影響しない', async () => {
    const t = seedBlocked();
    t.seed.addBlock(t.other.userId, t.bob.actorId);

    expect(await t.idsOf({}, blockedTypes)).toEqual([t.visible.mention, t.visible.like]);
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

describe('repost 通知', () => {
  const seedReposts = () => {
    const t = seedNotifications();
    const repost = t.seed.addRepostNotification(t.me.userId, t.alice.actorId, t.myPost.postId, 8_000);
    return { ...t, repost };
  };

  it('types に repost が含まれるときだけ、子表から値を復元して返す', async () => {
    const t = seedReposts();

    const result = await t.resolveByPage({}, ['repost']);

    expect(await t.idsOf()).not.toContain(t.repost);
    expect(result.ok && result.val.map((item) => item.notification)).toMatchObject([
      {
        type: 'repost',
        notificationId: t.repost,
        recipientUserId: t.me.userId,
        reposterActorId: t.alice.actorId,
        repostedPostId: t.myPost.postId,
      },
    ]);
    expect(result.ok && result.val[0]?.createdAt).toBe(8_000);
  });

  it('作成ストアが通知、子表、ドメインイベントを保存する', async () => {
    const t = seedNotifications();
    const event = Notification.createRepostNotification({
      type: 'repost',
      notificationId: NotificationId.generate(),
      recipientUserId: UserId.orThrow(t.me.userId),
      isRead: false,
      reposterActorId: t.alice.actorId as never,
      repostedPostId: t.myPost.postId as never,
    }, Instant.orThrow(9_000));

    await createD1RepostNotificationCreatedStore(t.db).store(event);

    const items = await t.resolveByPage({}, ['repost']);
    const events = t.sqlite.prepare('SELECT count(*) AS n FROM domain_events WHERE eventName = ?').get(
      'notification.repostNotificationCreated',
    );
    expect(items.ok && items.val.map((item) => item.notification)).toEqual([event.aggregateState]);
    expect(events).toMatchObject({ n: 1 });
  });

  it('受信者、reposter、投稿が一致する通知だけをリゾルバーが返す', async () => {
    const t = seedReposts();
    const resolver = createD1RepostNotificationResolverByRecipientAndActorIdAndPostId(t.db);
    const resolve = (recipientUserId: string, reposterActorId: string, repostedPostId: string) =>
      resolver.resolve({
        recipientUserId: UserId.orThrow(recipientUserId),
        reposterActorId: reposterActorId as never,
        repostedPostId: repostedPostId as never,
      });

    const found = await resolve(t.me.userId, t.alice.actorId, t.myPost.postId);
    const otherRecipient = await resolve(t.other.userId, t.alice.actorId, t.myPost.postId);
    const otherReposter = await resolve(t.me.userId, t.other.actorId, t.myPost.postId);
    const otherPost = await resolve(t.me.userId, t.alice.actorId, t.seed.uuid());

    expect(found.ok && found.val).toMatchObject({ type: 'repost', notificationId: t.repost });
    expect(otherRecipient.ok && otherRecipient.val).toBeUndefined();
    expect(otherReposter.ok && otherReposter.val).toBeUndefined();
    expect(otherPost.ok && otherPost.val).toBeUndefined();
  });

  it('同じ (reposter, 投稿) の組で2件目の通知を作ると一意索引で失敗する', () => {
    const t = seedReposts();

    expect(() => t.seed.addRepostNotification(t.other.userId, t.alice.actorId, t.myPost.postId, 8_600))
      .toThrow(/UNIQUE/);
    expect(() => t.seed.addRepostNotification(t.me.userId, t.other.actorId, t.myPost.postId, 8_700))
      .not.toThrow();
  });

  it('通知の削除と全件削除で子表の行も消える', async () => {
    const t = seedReposts();
    t.seed.addRepostNotification(t.me.userId, t.alice.actorId, t.seed.uuid(), 8_500);
    const count = () => t.sqlite.prepare('SELECT count(*) AS n FROM notification_reposts').get();

    await createD1NotificationDismissedStore(t.db).store(
      Notification.dismissNotification({
        type: 'repost',
        notificationId: NotificationId.orThrow(t.repost),
        recipientUserId: UserId.orThrow(t.me.userId),
        isRead: false,
        reposterActorId: t.alice.actorId as never,
        repostedPostId: t.myPost.postId as never,
      }, Instant.orThrow(9_000)),
    );
    expect(count()).toMatchObject({ n: 1 });

    await createD1NotificationsClearedStore(t.db).store(
      Notification.clearNotifications(UserId.orThrow(t.me.userId), Instant.orThrow(9_500)),
    );
    expect(count()).toMatchObject({ n: 0 });
  });
});

describe('mention 通知', () => {
  const seedMentions = () => {
    const t = seedNotifications();
    const mentionPost = t.seed.addRemotePost(t.alice, 8_000, { timeline: false });
    const mention = t.seed.addMentionNotification(t.me.userId, t.alice.actorId, mentionPost.postId, 8_100);
    return { ...t, mentionPost, mention };
  };

  it('types に mention が含まれるときだけ、子表から値を復元して返す', async () => {
    const t = seedMentions();

    const result = await t.resolveByPage({}, ['mention']);

    expect(await t.idsOf()).not.toContain(t.mention);
    expect(result.ok && result.val.map((item) => item.notification)).toMatchObject([
      {
        type: 'mention',
        notificationId: t.mention,
        recipientUserId: t.me.userId,
        mentionerActorId: t.alice.actorId,
        mentionPostId: t.mentionPost.postId,
      },
    ]);
    expect(result.ok && result.val[0]?.createdAt).toBe(8_100);
  });

  it('作成ストアが通知、子表、ドメインイベントを保存する', async () => {
    const t = seedNotifications();
    const mentionPost = t.seed.addRemotePost(t.alice, 8_000, { timeline: false });
    const event = Notification.createMentionNotification({
      type: 'mention',
      notificationId: NotificationId.generate(),
      recipientUserId: UserId.orThrow(t.me.userId),
      isRead: false,
      mentionerActorId: t.alice.actorId as never,
      mentionPostId: mentionPost.postId as never,
    }, Instant.orThrow(9_000));

    await createD1MentionNotificationCreatedStore(t.db).store(event);

    const items = await t.resolveByPage({}, ['mention']);
    const events = t.sqlite.prepare('SELECT count(*) AS n FROM domain_events WHERE eventName = ?').get(
      'notification.mentionNotificationCreated',
    );
    expect(items.ok && items.val.map((item) => item.notification)).toEqual([event.aggregateState]);
    expect(events).toMatchObject({ n: 1 });
  });

  it('受信者と投稿が一致する通知だけをリゾルバーが返す', async () => {
    const t = seedMentions();
    const resolver = createD1MentionNotificationResolverByRecipientAndMentionPostId(t.db);
    const resolve = (recipientUserId: string, mentionPostId: string) =>
      resolver.resolve({ recipientUserId: UserId.orThrow(recipientUserId), mentionPostId: mentionPostId as never });

    const found = await resolve(t.me.userId, t.mentionPost.postId);
    const otherRecipient = await resolve(t.other.userId, t.mentionPost.postId);
    const otherPost = await resolve(t.me.userId, t.seed.uuid());

    expect(found.ok && found.val).toMatchObject({ type: 'mention', notificationId: t.mention });
    expect(otherRecipient.ok && otherRecipient.val).toBeUndefined();
    expect(otherPost.ok && otherPost.val).toBeUndefined();
  });

  it('同じ (受信者, 投稿) の組で2件目の通知を作ると一意索引で失敗し、別の受信者なら作れる', () => {
    const t = seedMentions();

    expect(() => t.seed.addMentionNotification(t.me.userId, t.other.actorId, t.mentionPost.postId, 8_600))
      .toThrow(/UNIQUE/);
    expect(() => t.seed.addMentionNotification(t.other.userId, t.alice.actorId, t.mentionPost.postId, 8_700))
      .not.toThrow();
  });

  it('投稿の ID で通知を引き、削除ストアが通知、子表、ドメインイベントを消して記録する', async () => {
    const t = seedMentions();
    const otherPost = t.seed.addRemotePost(t.alice, 8_200, { timeline: false });
    const keep = t.seed.addMentionNotification(t.me.userId, t.alice.actorId, otherPost.postId, 8_300);
    const resolved = await createD1MentionNotificationsResolverByMentionPostId(t.db).resolve({
      mentionPostId: t.mentionPost.postId as never,
    });

    expect(resolved.ok && resolved.val.map((n) => n.notificationId)).toEqual([t.mention]);

    await createD1MentionNotificationDeletedStore(t.db).store(
      ...(resolved.ok
        ? resolved.val.map((n) => Notification.deleteMentionNotification(n, Instant.orThrow(9_000)))
        : []),
    );

    const remaining = (table: string) =>
      t.sqlite.prepare(`SELECT notificationId FROM ${table}`).all().map((row) => row.notificationId);
    expect(remaining('notification_mentions')).toEqual([keep]);
    expect(remaining('notifications')).not.toContain(t.mention);
    expect(
      t.sqlite.prepare('SELECT count(*) AS n FROM domain_events WHERE eventName = ?').get(
        'notification.mentionNotificationDeleted',
      ),
    ).toMatchObject({ n: 1 });
  });

  it('通知の削除と全件削除で子表の行も消える', async () => {
    const t = seedMentions();
    t.seed.addMentionNotification(t.me.userId, t.alice.actorId, t.seed.uuid(), 8_500);
    const count = () => t.sqlite.prepare('SELECT count(*) AS n FROM notification_mentions').get();

    await createD1NotificationDismissedStore(t.db).store(
      Notification.dismissNotification({
        type: 'mention',
        notificationId: NotificationId.orThrow(t.mention),
        recipientUserId: UserId.orThrow(t.me.userId),
        isRead: false,
        mentionerActorId: t.alice.actorId as never,
        mentionPostId: t.mentionPost.postId as never,
      }, Instant.orThrow(9_000)),
    );
    expect(count()).toMatchObject({ n: 1 });

    await createD1NotificationsClearedStore(t.db).store(
      Notification.clearNotifications(UserId.orThrow(t.me.userId), Instant.orThrow(9_500)),
    );
    expect(count()).toMatchObject({ n: 0 });
  });
});

describe('Bluesky の通知', () => {
  const blueskyTypes: Notification['type'][] = ['blueskyLike', 'blueskyRepost', 'blueskyFollow', 'blueskyMention'];
  const seedBluesky = () => {
    const t = seedNotifications();
    const targetPostId = t.myPost.postId;
    const ids = {
      like: t.seed.addBlueskyNotification(t.me.userId, 'blueskyLike', 11_000, { targetPostId }),
      repost: t.seed.addBlueskyNotification(t.me.userId, 'blueskyRepost', 12_000),
      follow: t.seed.addBlueskyNotification(t.me.userId, 'blueskyFollow', 13_000),
      mention: t.seed.addBlueskyNotification(t.me.userId, 'blueskyMention', 14_000, {
        reason: 'reply',
        subjectUri: null,
        text: 'hello',
      }),
    };
    return { ...t, blueskyIds: ids };
  };
  const receipts = (t: ReturnType<typeof seedBluesky>) =>
    (t.sqlite.prepare('SELECT count(*) AS n FROM bluesky_notification_receipts').get() as { n: number }).n;
  const subtypeRows = (t: ReturnType<typeof seedBluesky>) =>
    (t.sqlite.prepare('SELECT count(*) AS n FROM notification_bluesky').get() as { n: number }).n;

  it('types に含まれるときだけ、子表から 4 種の値を復元して返す', async () => {
    const t = seedBluesky();

    const result = await t.resolveByPage({}, blueskyTypes);

    expect(await t.idsOf()).not.toContain(t.blueskyIds.like);
    expect(result.ok && result.val.map((item) => item.notification)).toMatchObject([
      {
        type: 'blueskyMention',
        reason: 'reply',
        subjectUri: null,
        targetPostId: null,
        text: 'hello',
        author: { did: 'did:plc:alice', handle: 'alice.bsky.social', displayName: 'Alice', avatarUrl: null },
      },
      { type: 'blueskyFollow' },
      { type: 'blueskyRepost', subjectUri: 'at://did:plc:me/app.bsky.feed.post/3kpost', targetPostId: null },
      { type: 'blueskyLike', targetPostId: t.myPost.postId, notificationId: t.blueskyIds.like },
    ]);
    expect(result.ok && result.val[0]?.createdAt).toBe(14_000);
  });

  it('未読件数に数える', async () => {
    const t = seedBluesky();

    const unread = await createD1NotificationCountResolverSinceMarker(t.db).resolve({
      userId: UserId.orThrow(t.me.userId),
      types: [...mastodonTypes, ...blueskyTypes],
      limit: 100,
    });

    expect(unread).toEqual({ ok: true, val: 7, err: undefined });
  });

  it('個別の削除で通知と子表の行が消え、受信の記録は残る', async () => {
    const t = seedBluesky();

    await createD1NotificationDismissedStore(t.db).store(
      Notification.dismissNotification({
        type: 'blueskyFollow',
        notificationId: NotificationId.orThrow(t.blueskyIds.follow),
        recipientUserId: UserId.orThrow(t.me.userId),
        isRead: false,
        blueskyUri: 'at://x',
        author: { did: 'did:plc:alice', handle: 'alice.bsky.social', displayName: null, avatarUrl: null },
      }, Instant.orThrow(20_000)),
    );

    expect(subtypeRows(t)).toBe(3);
    expect(receipts(t)).toBe(4);
    expect(await t.idsOf({}, blueskyTypes)).not.toContain(t.blueskyIds.follow);
  });

  it('全件削除で通知と子表の行が消え、受信の記録は残る', async () => {
    const t = seedBluesky();

    await createD1NotificationsClearedStore(t.db).store(
      Notification.clearNotifications(UserId.orThrow(t.me.userId), Instant.orThrow(20_000)),
    );

    expect(subtypeRows(t)).toBe(0);
    expect(receipts(t)).toBe(4);
    expect(await t.idsOf({}, [...mastodonTypes, ...blueskyTypes])).toEqual([]);
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
