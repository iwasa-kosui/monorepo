import { RA } from '@iwasa-kosui/result';
import { desc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';

import type { Actor } from '../../../domain/actor/actor.ts';
import { ActorId } from '../../../domain/actor/actorId.ts';
import type { RemoteActor } from '../../../domain/actor/remoteActor.ts';
import type { Instant } from '../../../domain/instant/instant.ts';
import type {
  EmojiReactNotification,
  EmojiReactNotificationWithDetails,
  FollowNotification,
  FollowNotificationWithDetails,
  LikeNotification,
  LikeNotificationWithDetails,
  NotificationsResolverByUserId,
  NotificationWithDetails,
  ReplyNotification,
  ReplyNotificationWithDetails,
} from '../../../domain/notification/notification.ts';
import { NotificationId } from '../../../domain/notification/notificationId.ts';
import { LocalPost, type Post, RemotePost } from '../../../domain/post/post.ts';
import { PostId } from '../../../domain/post/postId.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import type { IoriD1Db } from '../client.ts';
import {
  actorsTable,
  localActorsTable,
  localPostsTable,
  notificationEmojiReactsTable,
  notificationFollowsTable,
  notificationLikesTable,
  notificationRepliesTable,
  notificationsTable,
  postsTable,
  remoteActorsTable,
  remotePostsTable,
  usersTable,
} from '../schema.ts';

type ActorRow = Readonly<{
  actors: typeof actorsTable.$inferSelect;
  remote_actors: typeof remoteActorsTable.$inferSelect | null;
  local_actors: typeof localActorsTable.$inferSelect | null;
}>;

const reconstructActor = (row: ActorRow): Actor => {
  if (row.remote_actors !== null) {
    const actor: RemoteActor = {
      id: ActorId.orThrow(row.actors.actorId),
      uri: row.actors.uri,
      inboxUrl: row.actors.inboxUrl,
      type: 'remote',
      url: row.remote_actors.url ?? undefined,
      username: row.remote_actors.username ?? undefined,
      logoUri: row.actors.logoUri ?? undefined,
    };
    return actor;
  }
  if (row.local_actors !== null) {
    return {
      id: ActorId.orThrow(row.actors.actorId),
      uri: row.actors.uri,
      inboxUrl: row.actors.inboxUrl,
      type: 'local',
      userId: row.local_actors.userId as UserId,
      logoUri: row.actors.logoUri ?? undefined,
    };
  }
  throw new Error(`Actor type could not be determined for actorId: ${row.actors.actorId}`);
};

type PostRow = Readonly<{
  posts: typeof postsTable.$inferSelect;
  local_posts: typeof localPostsTable.$inferSelect | null;
  remote_posts: typeof remotePostsTable.$inferSelect | null;
}>;

const reconstructPost = (row: PostRow): Post => {
  if (row.local_posts !== null) {
    return LocalPost.orThrow({
      postId: row.posts.postId,
      actorId: row.posts.actorId,
      content: row.posts.content,
      createdAt: row.posts.createdAt.getTime(),
      userId: row.local_posts.userId,
      inReplyToUri: row.local_posts.inReplyToUri,
      type: 'local',
    });
  }
  if (row.remote_posts !== null) {
    return RemotePost.orThrow({
      postId: row.posts.postId,
      actorId: row.posts.actorId,
      content: row.posts.content,
      createdAt: row.posts.createdAt.getTime(),
      uri: row.remote_posts.uri,
      inReplyToUri: row.remote_posts.inReplyToUri,
      type: 'remote',
    });
  }
  throw new Error(`Post type could not be determined for postId: ${row.posts.postId}`);
};

export const createD1NotificationsResolverByUserId = (
  db: IoriD1Db,
): NotificationsResolverByUserId => ({
  resolve: async (userId) => {
    const likeRows = await db.select({
      notifications: notificationsTable,
      notificationLikes: notificationLikesTable,
      likerActors: actorsTable,
      likerRemoteActors: remoteActorsTable,
      likerLocalActors: localActorsTable,
      posts: postsTable,
      localPosts: localPostsTable,
      remotePosts: remotePostsTable,
    }).from(notificationsTable)
      .innerJoin(notificationLikesTable, eq(notificationsTable.notificationId, notificationLikesTable.notificationId))
      .innerJoin(actorsTable, eq(notificationLikesTable.likerActorId, actorsTable.actorId))
      .leftJoin(remoteActorsTable, eq(actorsTable.actorId, remoteActorsTable.actorId))
      .leftJoin(localActorsTable, eq(actorsTable.actorId, localActorsTable.actorId))
      .innerJoin(postsTable, eq(notificationLikesTable.likedPostId, postsTable.postId))
      .leftJoin(localPostsTable, eq(postsTable.postId, localPostsTable.postId))
      .leftJoin(remotePostsTable, eq(postsTable.postId, remotePostsTable.postId))
      .where(eq(notificationsTable.recipientUserId, userId))
      .orderBy(desc(notificationsTable.createdAt)).limit(50);
    const likes: LikeNotificationWithDetails[] = likeRows.map((row) => {
      const notification: LikeNotification = {
        type: 'like',
        notificationId: NotificationId.orThrow(row.notifications.notificationId),
        recipientUserId: row.notifications.recipientUserId as UserId,
        isRead: row.notifications.isRead === 1,
        likerActorId: ActorId.orThrow(row.notificationLikes.likerActorId),
        likedPostId: PostId.orThrow(row.notificationLikes.likedPostId),
      };
      return {
        notification,
        likerActor: reconstructActor({
          actors: row.likerActors,
          remote_actors: row.likerRemoteActors,
          local_actors: row.likerLocalActors,
        }),
        likedPost: reconstructPost({ posts: row.posts, local_posts: row.localPosts, remote_posts: row.remotePosts }),
        createdAt: row.notifications.createdAt.getTime() as Instant,
      };
    });

    const followRows = await db.select({
      notifications: notificationsTable,
      notificationFollows: notificationFollowsTable,
      followerActors: actorsTable,
      followerRemoteActors: remoteActorsTable,
      followerLocalActors: localActorsTable,
    }).from(notificationsTable)
      .innerJoin(
        notificationFollowsTable,
        eq(notificationsTable.notificationId, notificationFollowsTable.notificationId),
      )
      .innerJoin(actorsTable, eq(notificationFollowsTable.followerActorId, actorsTable.actorId))
      .leftJoin(remoteActorsTable, eq(actorsTable.actorId, remoteActorsTable.actorId))
      .leftJoin(localActorsTable, eq(actorsTable.actorId, localActorsTable.actorId))
      .where(eq(notificationsTable.recipientUserId, userId))
      .orderBy(desc(notificationsTable.createdAt)).limit(50);
    const follows: FollowNotificationWithDetails[] = followRows.map((row) => {
      const notification: FollowNotification = {
        type: 'follow',
        notificationId: NotificationId.orThrow(row.notifications.notificationId),
        recipientUserId: row.notifications.recipientUserId as UserId,
        isRead: row.notifications.isRead === 1,
        followerActorId: ActorId.orThrow(row.notificationFollows.followerActorId),
      };
      return {
        notification,
        followerActor: reconstructActor({
          actors: row.followerActors,
          remote_actors: row.followerRemoteActors,
          local_actors: row.followerLocalActors,
        }),
        createdAt: row.notifications.createdAt.getTime() as Instant,
      };
    });

    const emojiRows = await db.select({
      notifications: notificationsTable,
      notificationEmojiReacts: notificationEmojiReactsTable,
      reactorActors: actorsTable,
      reactorRemoteActors: remoteActorsTable,
      reactorLocalActors: localActorsTable,
      posts: postsTable,
      localPosts: localPostsTable,
      remotePosts: remotePostsTable,
    }).from(notificationsTable)
      .innerJoin(
        notificationEmojiReactsTable,
        eq(notificationsTable.notificationId, notificationEmojiReactsTable.notificationId),
      )
      .innerJoin(actorsTable, eq(notificationEmojiReactsTable.reactorActorId, actorsTable.actorId))
      .leftJoin(remoteActorsTable, eq(actorsTable.actorId, remoteActorsTable.actorId))
      .leftJoin(localActorsTable, eq(actorsTable.actorId, localActorsTable.actorId))
      .innerJoin(postsTable, eq(notificationEmojiReactsTable.reactedPostId, postsTable.postId))
      .leftJoin(localPostsTable, eq(postsTable.postId, localPostsTable.postId))
      .leftJoin(remotePostsTable, eq(postsTable.postId, remotePostsTable.postId))
      .where(eq(notificationsTable.recipientUserId, userId))
      .orderBy(desc(notificationsTable.createdAt)).limit(50);
    const reactions: EmojiReactNotificationWithDetails[] = emojiRows.map((row) => {
      const notification: EmojiReactNotification = {
        type: 'emojiReact',
        notificationId: NotificationId.orThrow(row.notifications.notificationId),
        recipientUserId: row.notifications.recipientUserId as UserId,
        isRead: row.notifications.isRead === 1,
        reactorActorId: ActorId.orThrow(row.notificationEmojiReacts.reactorActorId),
        reactedPostId: PostId.orThrow(row.notificationEmojiReacts.reactedPostId),
        emoji: row.notificationEmojiReacts.emoji,
        emojiImageUrl: row.notificationEmojiReacts.emojiImageUrl,
      };
      return {
        notification,
        reactorActor: reconstructActor({
          actors: row.reactorActors,
          remote_actors: row.reactorRemoteActors,
          local_actors: row.reactorLocalActors,
        }),
        reactedPost: reconstructPost({ posts: row.posts, local_posts: row.localPosts, remote_posts: row.remotePosts }),
        createdAt: row.notifications.createdAt.getTime() as Instant,
      };
    });

    const replyPosts = alias(postsTable, 'reply_posts');
    const replyLocalPosts = alias(localPostsTable, 'reply_local_posts');
    const replyRemotePosts = alias(remotePostsTable, 'reply_remote_posts');
    const replyPostAuthorUsers = alias(usersTable, 'reply_post_author_users');
    const originalPosts = alias(postsTable, 'original_posts');
    const originalLocalPosts = alias(localPostsTable, 'original_local_posts');
    const originalRemotePosts = alias(remotePostsTable, 'original_remote_posts');
    const replyRows = await db.select({
      notifications: notificationsTable,
      notificationReplies: notificationRepliesTable,
      replierActors: actorsTable,
      replierRemoteActors: remoteActorsTable,
      replierLocalActors: localActorsTable,
      replyPosts,
      replyLocalPosts,
      replyRemotePosts,
      replyPostAuthorUsers,
      originalPosts,
      originalLocalPosts,
      originalRemotePosts,
    }).from(notificationsTable)
      .innerJoin(
        notificationRepliesTable,
        eq(notificationsTable.notificationId, notificationRepliesTable.notificationId),
      )
      .innerJoin(actorsTable, eq(notificationRepliesTable.replierActorId, actorsTable.actorId))
      .leftJoin(remoteActorsTable, eq(actorsTable.actorId, remoteActorsTable.actorId))
      .leftJoin(localActorsTable, eq(actorsTable.actorId, localActorsTable.actorId))
      .innerJoin(replyPosts, eq(notificationRepliesTable.replyPostId, replyPosts.postId))
      .leftJoin(replyLocalPosts, eq(replyPosts.postId, replyLocalPosts.postId))
      .leftJoin(replyRemotePosts, eq(replyPosts.postId, replyRemotePosts.postId))
      .leftJoin(replyPostAuthorUsers, eq(replyLocalPosts.userId, replyPostAuthorUsers.userId))
      .leftJoin(originalPosts, eq(notificationRepliesTable.originalPostId, originalPosts.postId))
      .leftJoin(originalLocalPosts, eq(originalPosts.postId, originalLocalPosts.postId))
      .leftJoin(originalRemotePosts, eq(originalPosts.postId, originalRemotePosts.postId))
      .where(eq(notificationsTable.recipientUserId, userId))
      .orderBy(desc(notificationsTable.createdAt)).limit(50);
    const replies: ReplyNotificationWithDetails[] = replyRows.map((row) => {
      const notification: ReplyNotification = {
        type: 'reply',
        notificationId: NotificationId.orThrow(row.notifications.notificationId),
        recipientUserId: row.notifications.recipientUserId as UserId,
        isRead: row.notifications.isRead === 1,
        replierActorId: ActorId.orThrow(row.notificationReplies.replierActorId),
        replyPostId: PostId.orThrow(row.notificationReplies.replyPostId),
        originalPostId: PostId.orThrow(row.notificationReplies.originalPostId),
      };
      return {
        notification,
        replierActor: reconstructActor({
          actors: row.replierActors,
          remote_actors: row.replierRemoteActors,
          local_actors: row.replierLocalActors,
        }),
        replyPost: reconstructPost({
          posts: row.replyPosts,
          local_posts: row.replyLocalPosts,
          remote_posts: row.replyRemotePosts,
        }),
        replyPostAuthorUsername: row.replyPostAuthorUsers?.username,
        originalPost: row.originalPosts === null
          ? undefined
          : reconstructPost({
            posts: row.originalPosts,
            local_posts: row.originalLocalPosts,
            remote_posts: row.originalRemotePosts,
          }),
        createdAt: row.notifications.createdAt.getTime() as Instant,
      };
    });

    const notifications: NotificationWithDetails[] = [...likes, ...follows, ...reactions, ...replies]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50);
    return RA.ok(notifications);
  },
});
