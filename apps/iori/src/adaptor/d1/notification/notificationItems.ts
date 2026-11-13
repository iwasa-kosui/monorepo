import { inArray } from 'drizzle-orm';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import type { Notification, NotificationItem } from '../../../domain/notification/notification.ts';
import { NotificationId } from '../../../domain/notification/notificationId.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { UserId } from '../../../domain/user/userId.ts';
import type { IoriD1Db } from '../client.ts';
import {
  notificationBlueskyTable,
  notificationEmojiReactsTable,
  notificationFollowsTable,
  notificationLikesTable,
  notificationMentionsTable,
  notificationRepliesTable,
  notificationRepostsTable,
  type notificationsTable,
} from '../schema.ts';

type NotificationRow = typeof notificationsTable.$inferSelect;
type BlueskyRow = typeof notificationBlueskyTable.$inferSelect;

const blueskyTypes: ReadonlyArray<string> = [
  'blueskyLike',
  'blueskyRepost',
  'blueskyLikeViaRepost',
  'blueskyRepostViaRepost',
  'blueskyFollow',
  'blueskyMention',
  'blueskySubscribedPost',
];
const mentionReasons: ReadonlyArray<string> = ['mention', 'reply', 'quote'];

const toBlueskyNotification = (
  base: Readonly<{ notificationId: NotificationId; recipientUserId: UserId; isRead: boolean }>,
  type: string,
  row: BlueskyRow,
): Notification | undefined => {
  const common = {
    ...base,
    blueskyUri: row.blueskyUri,
    author: {
      did: row.authorDid,
      handle: row.authorHandle,
      displayName: row.authorDisplayName,
      avatarUrl: row.authorAvatar,
    },
  };
  const targetPostId = row.targetPostId === null ? null : PostId.orThrow(row.targetPostId);
  if (type === 'blueskyFollow') return { ...common, type };
  if (type === 'blueskyMention') {
    return mentionReasons.includes(row.reason)
      ? {
        ...common,
        type,
        reason: row.reason as 'mention' | 'reply' | 'quote',
        subjectUri: row.subjectUri,
        targetPostId,
        text: row.text ?? '',
      }
      : undefined;
  }
  if (type === 'blueskySubscribedPost') {
    return { ...common, type, subjectUri: row.subjectUri, targetPostId, text: row.text ?? '' };
  }
  return row.subjectUri === null
      || (type !== 'blueskyLike' && type !== 'blueskyRepost' && type !== 'blueskyLikeViaRepost'
        && type !== 'blueskyRepostViaRepost')
    ? undefined
    : { ...common, type, subjectUri: row.subjectUri, targetPostId };
};

const rowsByNotificationId = async <T extends { notificationId: string }>(
  ids: ReadonlyArray<string>,
  select: (ids: string[]) => PromiseLike<T[]>,
): Promise<ReadonlyMap<string, T>> =>
  new Map((ids.length === 0 ? [] : await select([...ids])).map((row) => [row.notificationId, row]));

export const loadNotificationItems = async (
  db: IoriD1Db,
  rows: ReadonlyArray<NotificationRow>,
): Promise<NotificationItem[]> => {
  const idsOf = (type: Notification['type']) =>
    rows.filter((row) => row.type === type).map((row) => row.notificationId);
  const [likes, follows, reacts, replies, mentions, reposts, blueskyRows] = await Promise.all([
    rowsByNotificationId(
      idsOf('like'),
      (ids) => db.select().from(notificationLikesTable).where(inArray(notificationLikesTable.notificationId, ids)),
    ),
    rowsByNotificationId(
      idsOf('follow'),
      (ids) => db.select().from(notificationFollowsTable).where(inArray(notificationFollowsTable.notificationId, ids)),
    ),
    rowsByNotificationId(
      idsOf('emojiReact'),
      (ids) =>
        db.select().from(notificationEmojiReactsTable).where(inArray(notificationEmojiReactsTable.notificationId, ids)),
    ),
    rowsByNotificationId(
      idsOf('reply'),
      (ids) => db.select().from(notificationRepliesTable).where(inArray(notificationRepliesTable.notificationId, ids)),
    ),
    rowsByNotificationId(
      idsOf('mention'),
      (ids) =>
        db.select().from(notificationMentionsTable).where(inArray(notificationMentionsTable.notificationId, ids)),
    ),
    rowsByNotificationId(
      idsOf('repost'),
      (ids) => db.select().from(notificationRepostsTable).where(inArray(notificationRepostsTable.notificationId, ids)),
    ),
    rowsByNotificationId(
      rows.filter((row) => blueskyTypes.includes(row.type)).map((row) => row.notificationId),
      (ids) => db.select().from(notificationBlueskyTable).where(inArray(notificationBlueskyTable.notificationId, ids)),
    ),
  ]);

  return rows.flatMap((row): NotificationItem[] => {
    const base = {
      notificationId: NotificationId.orThrow(row.notificationId),
      recipientUserId: UserId.orThrow(row.recipientUserId),
      isRead: row.isRead === 1,
    };
    const toItem = (notification: Notification): NotificationItem[] => [{
      notification,
      createdAt: Instant.orThrow(row.createdAt.getTime()),
    }];
    const like = likes.get(row.notificationId);
    const follow = follows.get(row.notificationId);
    const react = reacts.get(row.notificationId);
    const reply = replies.get(row.notificationId);
    const mention = mentions.get(row.notificationId);
    const repost = reposts.get(row.notificationId);
    const blueskyRow = blueskyRows.get(row.notificationId);
    if (blueskyRow !== undefined && blueskyTypes.includes(row.type)) {
      const bluesky = toBlueskyNotification(base, row.type, blueskyRow);
      return bluesky === undefined ? [] : toItem(bluesky);
    }
    if (row.type === 'like' && like !== undefined) {
      return toItem({
        ...base,
        type: 'like',
        likerActorId: ActorId.orThrow(like.likerActorId),
        likedPostId: PostId.orThrow(like.likedPostId),
      });
    }
    if (row.type === 'follow' && follow !== undefined) {
      return toItem({ ...base, type: 'follow', followerActorId: ActorId.orThrow(follow.followerActorId) });
    }
    if (row.type === 'emojiReact' && react !== undefined) {
      return toItem({
        ...base,
        type: 'emojiReact',
        reactorActorId: ActorId.orThrow(react.reactorActorId),
        reactedPostId: PostId.orThrow(react.reactedPostId),
        emoji: react.emoji,
        emojiImageUrl: react.emojiImageUrl,
      });
    }
    if (row.type === 'reply' && reply !== undefined) {
      return toItem({
        ...base,
        type: 'reply',
        replierActorId: ActorId.orThrow(reply.replierActorId),
        replyPostId: PostId.orThrow(reply.replyPostId),
        originalPostId: PostId.orThrow(reply.originalPostId),
      });
    }
    if (row.type === 'mention' && mention !== undefined) {
      return toItem({
        ...base,
        type: 'mention',
        mentionerActorId: ActorId.orThrow(mention.mentionerActorId),
        mentionPostId: PostId.orThrow(mention.mentionPostId),
      });
    }
    if (row.type === 'repost' && repost !== undefined) {
      return toItem({
        ...base,
        type: 'repost',
        reposterActorId: ActorId.orThrow(repost.reposterActorId),
        repostedPostId: PostId.orThrow(repost.repostedPostId),
      });
    }
    return [];
  });
};
