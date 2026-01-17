import { RA } from '@iwasa-kosui/result';
import { desc, eq } from 'drizzle-orm';

import type { Actor } from '../../../domain/actor/actor.ts';
import { ActorId } from '../../../domain/actor/actorId.ts';
import type { RemoteActor } from '../../../domain/actor/remoteActor.ts';
import type { Instant } from '../../../domain/instant/instant.ts';
import {
  type LikeNotification,
  type NotificationsResolverByUserId,
  type NotificationWithDetails,
} from '../../../domain/notification/notification.ts';
import { NotificationId } from '../../../domain/notification/notificationId.ts';
import { LocalPost, type Post, RemotePost } from '../../../domain/post/post.ts';
import { PostId } from '../../../domain/post/postId.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import {
  actorsTable,
  localActorsTable,
  localPostsTable,
  notificationLikesTable,
  notificationsTable,
  postsTable,
  remoteActorsTable,
  remotePostsTable,
  usersTable,
} from '../schema.ts';

const reconstructActor = (row: {
  actors: {
    actorId: string;
    uri: string;
    logoUri: string | null;
    inboxUrl: string;
    type: string;
  };
  remote_actors: { actorId: string; url: string | null; username: string | null } | null;
  local_actors: { actorId: string; userId: string } | null;
}): Actor => {
  if (row.remote_actors) {
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
  if (row.local_actors) {
    const actor: Actor = {
      id: ActorId.orThrow(row.actors.actorId),
      uri: row.actors.uri,
      inboxUrl: row.actors.inboxUrl,
      type: 'local',
      userId: row.local_actors.userId as UserId,
      logoUri: row.actors.logoUri ?? undefined,
    };
    return actor;
  }
  throw new Error(`Actor type could not be determined for actorId: ${row.actors.actorId}`);
};

const reconstructPost = (row: {
  posts: {
    postId: string;
    actorId: string;
    content: string;
    createdAt: Date;
    type: string;
    deletedAt: Date | null;
  };
  local_posts: { postId: string; userId: string } | null;
  remote_posts: { postId: string; uri: string } | null;
}): Post => {
  if (row.local_posts) {
    return LocalPost.orThrow({
      postId: row.posts.postId,
      actorId: row.posts.actorId,
      content: row.posts.content,
      createdAt: row.posts.createdAt.getTime(),
      userId: row.local_posts.userId,
      type: 'local',
    });
  }
  if (row.remote_posts) {
    return RemotePost.orThrow({
      postId: row.posts.postId,
      actorId: row.posts.actorId,
      content: row.posts.content,
      createdAt: row.posts.createdAt.getTime(),
      uri: row.remote_posts.uri,
      type: 'remote',
    });
  }
  throw new Error(`Post type could not be determined for postId: ${row.posts.postId}`);
};

const getInstance = singleton((): NotificationsResolverByUserId => {
  const resolve = async (userId: UserId): RA<NotificationWithDetails[], never> => {
    const db = DB.getInstance();

    // Like通知を取得（アクターとポスト情報も含む）
    const rows = await db
      .select({
        notifications: notificationsTable,
        notificationLikes: notificationLikesTable,
        likerActors: actorsTable,
        likerRemoteActors: remoteActorsTable,
        likerLocalActors: localActorsTable,
        likerUsers: usersTable,
        posts: postsTable,
        localPosts: localPostsTable,
        remotePosts: remotePostsTable,
      })
      .from(notificationsTable)
      .innerJoin(
        notificationLikesTable,
        eq(notificationsTable.notificationId, notificationLikesTable.notificationId),
      )
      .innerJoin(actorsTable, eq(notificationLikesTable.likerActorId, actorsTable.actorId))
      .leftJoin(remoteActorsTable, eq(actorsTable.actorId, remoteActorsTable.actorId))
      .leftJoin(localActorsTable, eq(actorsTable.actorId, localActorsTable.actorId))
      .leftJoin(usersTable, eq(localActorsTable.userId, usersTable.userId))
      .innerJoin(postsTable, eq(notificationLikesTable.likedPostId, postsTable.postId))
      .leftJoin(localPostsTable, eq(postsTable.postId, localPostsTable.postId))
      .leftJoin(remotePostsTable, eq(postsTable.postId, remotePostsTable.postId))
      .where(eq(notificationsTable.recipientUserId, userId))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(50)
      .execute();

    const notifications: NotificationWithDetails[] = rows.map((row) => {
      const likeNotification: LikeNotification = {
        type: 'like',
        notificationId: NotificationId.orThrow(row.notifications.notificationId),
        recipientUserId: row.notifications.recipientUserId as UserId,
        isRead: row.notifications.isRead === 1,
        likerActorId: ActorId.orThrow(row.notificationLikes.likerActorId),
        likedPostId: PostId.orThrow(row.notificationLikes.likedPostId),
      };

      const likerActor = reconstructActor({
        actors: row.likerActors,
        remote_actors: row.likerRemoteActors,
        local_actors: row.likerLocalActors,
      });

      const likedPost = reconstructPost({
        posts: row.posts,
        local_posts: row.localPosts,
        remote_posts: row.remotePosts,
      });

      return {
        notification: likeNotification,
        likerActor,
        likedPost,
        createdAt: row.notifications.createdAt.getTime() as Instant,
      };
    });

    return RA.ok(notifications);
  };

  return { resolve };
});

export const PgNotificationsResolverByUserId = {
  getInstance,
} as const;
