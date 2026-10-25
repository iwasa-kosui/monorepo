import { describe, expect, it } from 'vitest';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { Notification } from '../../../domain/notification/notification.ts';
import { NotificationId } from '../../../domain/notification/notificationId.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { UserId } from '../../../domain/user/userId.ts';
import type { IoriD1Db } from '../client.ts';
import { createD1NotificationsReadStore } from '../notification/notificationsReadStore.ts';
import { createD1NotificationsResolverByUserId } from '../notification/notificationsResolverByUserId.ts';
import { createD1UnreadNotificationCountResolverByUserId } from '../notification/unreadNotificationCountResolverByUserId.ts';

const queryDb = (results: unknown[][]): IoriD1Db => ({
  select: () => {
    const rows = results.shift() ?? [];
    const builder = {
      from: () => builder,
      innerJoin: () => builder,
      leftJoin: () => builder,
      where: () => builder,
      orderBy: () => builder,
      limit: () => builder,
      then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
    };
    return builder;
  },
} as unknown as IoriD1Db);

describe('D1 notification query adapters', () => {
  it('reconstructs and globally orders all four notification variants', async () => {
    const userId = UserId.generate();
    const actorId = ActorId.generate();
    const postId = PostId.generate();
    const originalPostId = PostId.generate();
    const actor = {
      actorId,
      uri: 'https://remote.test/users/alice',
      logoUri: null,
      inboxUrl: 'https://remote.test/inbox',
      type: 'remote',
    };
    const remoteActor = { actorId, url: null, username: 'alice' };
    const post = { postId, actorId, content: '<p>post</p>', createdAt: new Date(100), type: 'remote', deletedAt: null };
    const remotePost = { postId, uri: 'https://remote.test/posts/1', inReplyToUri: null };
    const notification = (type: string, createdAt: number) => ({
      notificationId: NotificationId.generate(),
      recipientUserId: userId,
      type,
      isRead: 0,
      createdAt: new Date(createdAt),
    });
    const result = await createD1NotificationsResolverByUserId(queryDb([
      [{
        notifications: notification('like', 200),
        notificationLikes: { notificationId: NotificationId.generate(), likerActorId: actorId, likedPostId: postId },
        likerActors: actor,
        likerRemoteActors: remoteActor,
        likerLocalActors: null,
        posts: post,
        localPosts: null,
        remotePosts: remotePost,
      }],
      [{
        notifications: notification('follow', 400),
        notificationFollows: { notificationId: NotificationId.generate(), followerActorId: actorId },
        followerActors: actor,
        followerRemoteActors: remoteActor,
        followerLocalActors: null,
      }],
      [{
        notifications: notification('emojiReact', 300),
        notificationEmojiReacts: {
          notificationId: NotificationId.generate(),
          reactorActorId: actorId,
          reactedPostId: postId,
          emoji: ':wave:',
          emojiImageUrl: null,
        },
        reactorActors: actor,
        reactorRemoteActors: remoteActor,
        reactorLocalActors: null,
        posts: post,
        localPosts: null,
        remotePosts: remotePost,
      }],
      [{
        notifications: notification('reply', 100),
        notificationReplies: {
          notificationId: NotificationId.generate(),
          replierActorId: actorId,
          replyPostId: postId,
          originalPostId,
        },
        replierActors: actor,
        replierRemoteActors: remoteActor,
        replierLocalActors: null,
        replyPosts: post,
        replyLocalPosts: null,
        replyRemotePosts: remotePost,
        replyPostAuthorUsers: null,
        originalPosts: null,
        originalLocalPosts: null,
        originalRemotePosts: null,
      }],
    ])).resolve(userId);

    expect(result.ok && result.val.map((item) => item.notification.type)).toEqual([
      'follow',
      'emojiReact',
      'like',
      'reply',
    ]);
  });

  it('counts unread rows and batches read-state with its domain event', async () => {
    const userId = UserId.generate();
    const notificationId = NotificationId.generate();
    const count = await createD1UnreadNotificationCountResolverByUserId(queryDb([[{ count: 5 }]])).resolve(userId);
    const statements: unknown[] = [];
    const db = {
      update: (table: unknown) => ({ set: (values: unknown) => ({ where: () => ({ table, values }) }) }),
      insert: (table: unknown) => ({ values: (values: unknown) => ({ table, values }) }),
      batch: async (items: unknown[]) => statements.push(...items),
    } as unknown as IoriD1Db;
    const event = Notification.markAsRead(
      [notificationId],
      userId,
      Instant.orThrow(Date.parse('2026-08-05T00:00:00.000Z')),
    );

    await createD1NotificationsReadStore(db).store(event);

    expect(count).toEqual({ ok: true, val: 5, err: undefined });
    expect(statements).toHaveLength(2);
  });
});
