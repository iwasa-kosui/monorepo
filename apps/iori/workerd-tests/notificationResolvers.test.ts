import { env } from 'cloudflare:test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createD1Db } from '../src/adaptor/d1/client.ts';
import { createD1NotificationCountResolverSinceMarker } from '../src/adaptor/d1/notification/notificationCountResolverSinceMarker.ts';
import { createD1NotificationResolverByUserIdAndId } from '../src/adaptor/d1/notification/notificationResolverByUserIdAndId.ts';
import { createD1NotificationsResolverByPage } from '../src/adaptor/d1/notification/notificationsResolverByPage.ts';
import { NotificationId } from '../src/domain/notification/notificationId.ts';
import { UserId } from '../src/domain/user/userId.ts';

const db = createD1Db(env.DB);
const types = ['like', 'mention'] as const;

const meId = crypto.randomUUID();
const otherId = crypto.randomUUID();
const alice = crypto.randomUUID();
const bob = crypto.randomUUID();
const carol = crypto.randomUUID();
const notificationIds: string[] = [];
const blockIds: string[] = [];

const addActor = (actorId: string) =>
  env.DB.prepare('INSERT INTO actors(actorId,uri,inboxUrl,type) VALUES (?,?,?,?)').bind(
    actorId,
    `https://remote.example/users/${actorId}`,
    `https://remote.example/users/${actorId}/inbox`,
    'remote',
  );

const addBlock = (userId: string, blockedActorId: string) => {
  const blockId = crypto.randomUUID();
  blockIds.push(blockId);
  return env.DB.prepare('INSERT INTO blocks(blockId,userId,blockedActorId,createdAt) VALUES (?,?,?,?)')
    .bind(blockId, userId, blockedActorId, 1);
};

const addNotification = (
  kind: 'like' | 'mention',
  recipientUserId: string,
  actorId: string,
  createdAt: number,
) => {
  const notificationId = crypto.randomUUID();
  notificationIds.push(notificationId);
  const postId = crypto.randomUUID();
  const child = kind === 'like'
    ? env.DB.prepare('INSERT INTO notification_likes(notificationId,likerActorId,likedPostId) VALUES (?,?,?)')
      .bind(notificationId, actorId, postId)
    : env.DB.prepare(
      'INSERT INTO notification_mentions(notificationId,recipientUserId,mentionerActorId,mentionPostId) VALUES (?,?,?,?)',
    ).bind(notificationId, recipientUserId, actorId, postId);
  return {
    notificationId,
    statements: [
      env.DB.prepare(
        'INSERT INTO notifications(notificationId,recipientUserId,type,isRead,createdAt) VALUES (?,?,?,?,?)',
      )
        .bind(notificationId, recipientUserId, kind, 0, createdAt),
      child,
    ],
  };
};

const aliceLike = addNotification('like', meId, alice, 1_000);
const bobLike = addNotification('like', meId, bob, 2_000);
const aliceMention = addNotification('mention', meId, alice, 3_000);
const bobMention = addNotification('mention', meId, bob, 4_000);
const carolLike = addNotification('like', meId, carol, 5_000);
const otherBobLike = addNotification('like', otherId, bob, 6_000);
const otherAliceLike = addNotification('like', otherId, alice, 7_000);

const resolveByPage = async (recipient: string) => {
  const result = await createD1NotificationsResolverByPage(db).resolve({
    recipientUserId: UserId.orThrow(recipient),
    page: { limit: 20, olderThanId: undefined, newerThanId: undefined, order: 'newestFirst' },
    types: [...types],
  });
  if (!result.ok) throw new Error('resolve failed');
  return result.val.map((item) => item.notification.notificationId as string);
};

const count = async (userId: string) => {
  const result = await createD1NotificationCountResolverSinceMarker(db).resolve({
    userId: UserId.orThrow(userId),
    types: [...types],
    limit: 100,
  });
  if (!result.ok) throw new Error('count failed');
  return result.val;
};

const resolveById = async (recipient: string, notificationId: string) => {
  const result = await createD1NotificationResolverByUserIdAndId(db).resolve({
    recipientUserId: UserId.orThrow(recipient),
    notificationId: NotificationId.orThrow(notificationId),
  });
  if (!result.ok) throw new Error('resolve failed');
  return result.val;
};

beforeAll(async () => {
  await env.DB.batch([
    env.DB.prepare('INSERT INTO users(userId,username) VALUES (?,?)').bind(meId, `notification-me-${meId}`),
    env.DB.prepare('INSERT INTO users(userId,username) VALUES (?,?)').bind(otherId, `notification-other-${otherId}`),
    addActor(alice),
    addActor(bob),
    addActor(carol),
    addBlock(meId, alice),
    addBlock(otherId, bob),
    addBlock(otherId, carol),
    ...[aliceLike, bobLike, aliceMention, bobMention, carolLike, otherBobLike, otherAliceLike]
      .flatMap((notification) => notification.statements),
  ]);
});

afterAll(async () => {
  const notifications = JSON.stringify(notificationIds);
  const blocks = JSON.stringify(blockIds);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM mastodon_markers WHERE userId IN (?, ?)').bind(meId, otherId),
    env.DB.prepare('DELETE FROM notification_likes WHERE notificationId IN (SELECT value FROM json_each(?))').bind(
      notifications,
    ),
    env.DB.prepare('DELETE FROM notification_mentions WHERE notificationId IN (SELECT value FROM json_each(?))').bind(
      notifications,
    ),
    env.DB.prepare('DELETE FROM notifications WHERE notificationId IN (SELECT value FROM json_each(?))').bind(
      notifications,
    ),
    env.DB.prepare('DELETE FROM blocks WHERE blockId IN (SELECT value FROM json_each(?))').bind(blocks),
    env.DB.prepare('DELETE FROM actors WHERE actorId IN (?, ?, ?)').bind(alice, bob, carol),
    env.DB.prepare('DELETE FROM users WHERE userId IN (?, ?)').bind(meId, otherId),
  ]);
});

describe('通知のリゾルバーが workerd の D1 でブロックを除く', () => {
  it('一覧は、失敗せずに、ブロックした相手のいいねとメンションを除いて新しい順に返す', async () => {
    const ids = await resolveByPage(meId);

    expect(ids).toEqual([carolLike.notificationId, bobMention.notificationId, bobLike.notificationId]);
  });

  it('件数は、失敗せずに、ブロックした相手の通知を数えず、マーカーより新しいものだけを数える', async () => {
    expect(await count(meId)).toBe(3);

    await env.DB.prepare(
      'INSERT INTO mastodon_markers(userId,timeline,lastReadId,version,updatedAt) VALUES (?,?,?,?,?)',
    )
      .bind(meId, 'notifications', bobLike.notificationId, 1, 1).run();

    expect(await count(meId)).toBe(2);
  });

  it('1件の取得は、ブロックした相手の通知を返さず、ほかの通知を返す', async () => {
    const blockedLike = await resolveById(meId, aliceLike.notificationId);
    const blockedMention = await resolveById(meId, aliceMention.notificationId);
    const visibleLike = await resolveById(meId, bobLike.notificationId);
    const visibleMention = await resolveById(meId, bobMention.notificationId);

    expect(blockedLike).toBeUndefined();
    expect(blockedMention).toBeUndefined();
    expect(visibleLike?.notification).toMatchObject({ type: 'like', notificationId: bobLike.notificationId });
    expect(visibleMention?.notification).toMatchObject({ type: 'mention', notificationId: bobMention.notificationId });
  });

  it('ほかのユーザーのブロックは、自分の通知に影響しない', async () => {
    expect(await resolveByPage(otherId)).toEqual([otherAliceLike.notificationId]);
    expect(await resolveById(otherId, otherBobLike.notificationId)).toBeUndefined();
    expect(await resolveById(meId, bobLike.notificationId)).toBeDefined();
    expect(await resolveById(meId, carolLike.notificationId)).toBeDefined();
  });
});
