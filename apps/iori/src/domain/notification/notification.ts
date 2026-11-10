import z from 'zod/v4';

import { safeAbsoluteUrl } from '../../helper/safeUrl.ts';
import { Schema } from '../../helper/schema.ts';
import type { Actor } from '../actor/actor.ts';
import { ActorId } from '../actor/actorId.ts';
import { AggregateEvent, type DomainEvent } from '../aggregate/event.ts';
import type { Agg } from '../aggregate/index.ts';
import type { Instant } from '../instant/instant.ts';
import type { PageRequest } from '../page/page.ts';
import type { Post } from '../post/post.ts';
import { PostId } from '../post/postId.ts';
import { UserId } from '../user/userId.ts';
import { NotificationId } from './notificationId.ts';

const likeNotificationZodType = z
  .object({
    type: z.literal('like'),
    notificationId: NotificationId.zodType,
    recipientUserId: UserId.zodType,
    isRead: z.boolean(),
    likerActorId: ActorId.zodType,
    likedPostId: PostId.zodType,
  })
  .describe('LikeNotification');

export type LikeNotification = z.output<typeof likeNotificationZodType>;
export const LikeNotification = Schema.create(likeNotificationZodType);

const followNotificationZodType = z
  .object({
    type: z.literal('follow'),
    notificationId: NotificationId.zodType,
    recipientUserId: UserId.zodType,
    isRead: z.boolean(),
    followerActorId: ActorId.zodType,
  })
  .describe('FollowNotification');

export type FollowNotification = z.output<typeof followNotificationZodType>;
export const FollowNotification = Schema.create(followNotificationZodType);

const emojiReactNotificationZodType = z
  .object({
    type: z.literal('emojiReact'),
    notificationId: NotificationId.zodType,
    recipientUserId: UserId.zodType,
    isRead: z.boolean(),
    reactorActorId: ActorId.zodType,
    reactedPostId: PostId.zodType,
    emoji: z.string(),
    emojiImageUrl: z.nullable(z.string()),
  })
  .describe('EmojiReactNotification');

export type EmojiReactNotification = z.output<typeof emojiReactNotificationZodType>;
export const EmojiReactNotification = Schema.create(emojiReactNotificationZodType);

const replyNotificationZodType = z
  .object({
    type: z.literal('reply'),
    notificationId: NotificationId.zodType,
    recipientUserId: UserId.zodType,
    isRead: z.boolean(),
    replierActorId: ActorId.zodType,
    replyPostId: PostId.zodType,
    originalPostId: PostId.zodType,
  })
  .describe('ReplyNotification');

export type ReplyNotification = z.output<typeof replyNotificationZodType>;
export const ReplyNotification = Schema.create(replyNotificationZodType);

const repostNotificationZodType = z
  .object({
    type: z.literal('repost'),
    notificationId: NotificationId.zodType,
    recipientUserId: UserId.zodType,
    isRead: z.boolean(),
    reposterActorId: ActorId.zodType,
    repostedPostId: PostId.zodType,
  })
  .describe('RepostNotification');

export type RepostNotification = z.output<typeof repostNotificationZodType>;
export const RepostNotification = Schema.create(repostNotificationZodType);

const httpUrlZodType = z.string().refine((value) => safeAbsoluteUrl(value) === value);

const blueskyNotificationAuthorZodType = z.object({
  did: z.string().min(1),
  handle: z.string().min(1),
  displayName: z.string().nullable(),
  avatarUrl: httpUrlZodType.nullable(),
});

export type BlueskyNotificationAuthor = z.output<typeof blueskyNotificationAuthorZodType>;
export const BlueskyNotificationAuthor = Schema.create(blueskyNotificationAuthorZodType);

const blueskyNotificationBaseShape = {
  notificationId: NotificationId.zodType,
  recipientUserId: UserId.zodType,
  isRead: z.boolean(),
  blueskyUri: z.string().min(1),
  author: blueskyNotificationAuthorZodType,
};

const blueskyLikeNotificationZodType = z
  .object({
    ...blueskyNotificationBaseShape,
    type: z.literal('blueskyLike'),
    subjectUri: z.string().min(1),
    targetPostId: z.nullable(PostId.zodType),
  })
  .describe('BlueskyLikeNotification');

export type BlueskyLikeNotification = z.output<typeof blueskyLikeNotificationZodType>;
export const BlueskyLikeNotification = Schema.create(blueskyLikeNotificationZodType);

const blueskyRepostNotificationZodType = z
  .object({
    ...blueskyNotificationBaseShape,
    type: z.literal('blueskyRepost'),
    subjectUri: z.string().min(1),
    targetPostId: z.nullable(PostId.zodType),
  })
  .describe('BlueskyRepostNotification');

export type BlueskyRepostNotification = z.output<typeof blueskyRepostNotificationZodType>;
export const BlueskyRepostNotification = Schema.create(blueskyRepostNotificationZodType);

const blueskyFollowNotificationZodType = z
  .object({
    ...blueskyNotificationBaseShape,
    type: z.literal('blueskyFollow'),
  })
  .describe('BlueskyFollowNotification');

export type BlueskyFollowNotification = z.output<typeof blueskyFollowNotificationZodType>;
export const BlueskyFollowNotification = Schema.create(blueskyFollowNotificationZodType);

const blueskyMentionNotificationZodType = z
  .object({
    ...blueskyNotificationBaseShape,
    type: z.literal('blueskyMention'),
    reason: z.enum(['mention', 'reply', 'quote']),
    subjectUri: z.string().min(1).nullable(),
    targetPostId: z.nullable(PostId.zodType),
    text: z.string(),
  })
  .describe('BlueskyMentionNotification');

export type BlueskyMentionNotification = z.output<typeof blueskyMentionNotificationZodType>;
export const BlueskyMentionNotification = Schema.create(blueskyMentionNotificationZodType);

const notificationZodType = z.discriminatedUnion('type', [
  likeNotificationZodType,
  followNotificationZodType,
  emojiReactNotificationZodType,
  replyNotificationZodType,
  repostNotificationZodType,
  blueskyLikeNotificationZodType,
  blueskyRepostNotificationZodType,
  blueskyFollowNotificationZodType,
  blueskyMentionNotificationZodType,
]);

export type Notification = z.output<typeof notificationZodType>;
const schema = Schema.create<Notification, z.input<typeof notificationZodType>>(notificationZodType);

export type NotificationAggregateId = Readonly<{
  notificationId: NotificationId;
}>;
export type NotificationAggregate = Agg.Aggregate<NotificationAggregateId, 'notification', Notification>;
const toAggregateId = (notification: Notification): NotificationAggregateId => ({
  notificationId: notification.notificationId,
});

type NotificationEvent<
  TAggregateState extends Agg.InferState<NotificationAggregate> | undefined,
  TEventName extends string,
  TEventPayload extends Record<string, unknown>,
> = DomainEvent<NotificationAggregate, TAggregateState, TEventName, TEventPayload>;
const NotificationEvent = AggregateEvent.createFactory<NotificationAggregate>('notification');

export type LikeNotificationCreated = NotificationEvent<
  LikeNotification,
  'notification.likeNotificationCreated',
  LikeNotification
>;

const createLikeNotification = (payload: LikeNotification, now: Instant): LikeNotificationCreated => {
  return NotificationEvent.create(
    toAggregateId(payload),
    payload,
    'notification.likeNotificationCreated',
    payload,
    now,
  );
};

export type LikeNotificationCreatedStore = Agg.Store<LikeNotificationCreated>;

// Follow通知作成イベント
export type FollowNotificationCreated = NotificationEvent<
  FollowNotification,
  'notification.followNotificationCreated',
  FollowNotification
>;

const createFollowNotification = (payload: FollowNotification, now: Instant): FollowNotificationCreated => {
  return NotificationEvent.create(
    toAggregateId(payload),
    payload,
    'notification.followNotificationCreated',
    payload,
    now,
  );
};

export type FollowNotificationCreatedStore = Agg.Store<FollowNotificationCreated>;

// Follow通知をActorIdで検索するリゾルバ（重複防止用）
export type FollowNotificationResolverByActorId = Agg.Resolver<
  { followerActorId: ActorId; recipientUserId: UserId },
  FollowNotification | undefined
>;

// Like通知削除イベント
export type LikeNotificationDeletedPayload = Readonly<{
  notificationId: NotificationId;
  likerActorId: ActorId;
  likedPostId: PostId;
}>;

export type LikeNotificationDeleted = NotificationEvent<
  undefined,
  'notification.likeNotificationDeleted',
  LikeNotificationDeletedPayload
>;

const deleteLikeNotification = (
  notification: LikeNotification,
  now: Instant,
): LikeNotificationDeleted => {
  return NotificationEvent.create(
    toAggregateId(notification),
    undefined,
    'notification.likeNotificationDeleted',
    {
      notificationId: notification.notificationId,
      likerActorId: notification.likerActorId,
      likedPostId: notification.likedPostId,
    },
    now,
  );
};

export type LikeNotificationDeletedStore = Agg.Store<LikeNotificationDeleted>;

// Like通知をActorIdとPostIdで検索するリゾルバ
export type LikeNotificationResolverByActorIdAndPostId = Agg.Resolver<
  { likerActorId: ActorId; likedPostId: PostId },
  LikeNotification | undefined
>;

// Like通知をPostIdで検索するリゾルバ
export type LikeNotificationsResolverByPostId = Agg.Resolver<
  { postId: PostId },
  LikeNotification[]
>;

// EmojiReact通知作成イベント
export type EmojiReactNotificationCreated = NotificationEvent<
  EmojiReactNotification,
  'notification.emojiReactNotificationCreated',
  EmojiReactNotification
>;

const createEmojiReactNotification = (payload: EmojiReactNotification, now: Instant): EmojiReactNotificationCreated => {
  return NotificationEvent.create(
    toAggregateId(payload),
    payload,
    'notification.emojiReactNotificationCreated',
    payload,
    now,
  );
};

export type EmojiReactNotificationCreatedStore = Agg.Store<EmojiReactNotificationCreated>;

// EmojiReact通知削除イベント
export type EmojiReactNotificationDeletedPayload = Readonly<{
  notificationId: NotificationId;
  reactorActorId: ActorId;
  reactedPostId: PostId;
  emoji: string;
}>;

export type EmojiReactNotificationDeleted = NotificationEvent<
  undefined,
  'notification.emojiReactNotificationDeleted',
  EmojiReactNotificationDeletedPayload
>;

const deleteEmojiReactNotification = (
  notification: EmojiReactNotification,
  now: Instant,
): EmojiReactNotificationDeleted => {
  return NotificationEvent.create(
    toAggregateId(notification),
    undefined,
    'notification.emojiReactNotificationDeleted',
    {
      notificationId: notification.notificationId,
      reactorActorId: notification.reactorActorId,
      reactedPostId: notification.reactedPostId,
      emoji: notification.emoji,
    },
    now,
  );
};

export type EmojiReactNotificationDeletedStore = Agg.Store<EmojiReactNotificationDeleted>;

// EmojiReact通知をActorIdとPostIdとEmojiで検索するリゾルバ
export type EmojiReactNotificationResolverByActorIdAndPostIdAndEmoji = Agg.Resolver<
  { reactorActorId: ActorId; reactedPostId: PostId; emoji: string },
  EmojiReactNotification | undefined
>;

// EmojiReact通知をPostIdで検索するリゾルバ
export type EmojiReactNotificationsResolverByPostId = Agg.Resolver<
  { postId: PostId },
  EmojiReactNotification[]
>;

// Reply通知作成イベント
export type ReplyNotificationCreated = NotificationEvent<
  ReplyNotification,
  'notification.replyNotificationCreated',
  ReplyNotification
>;

const createReplyNotification = (payload: ReplyNotification, now: Instant): ReplyNotificationCreated => {
  return NotificationEvent.create(
    toAggregateId(payload),
    payload,
    'notification.replyNotificationCreated',
    payload,
    now,
  );
};

export type ReplyNotificationCreatedStore = Agg.Store<ReplyNotificationCreated>;

// Reply通知削除イベント
export type ReplyNotificationDeletedPayload = Readonly<{
  notificationId: NotificationId;
  replierActorId: ActorId;
  replyPostId: PostId;
  originalPostId: PostId;
}>;

export type ReplyNotificationDeleted = NotificationEvent<
  undefined,
  'notification.replyNotificationDeleted',
  ReplyNotificationDeletedPayload
>;

const deleteReplyNotification = (
  notification: ReplyNotification,
  now: Instant,
): ReplyNotificationDeleted => {
  return NotificationEvent.create(
    toAggregateId(notification),
    undefined,
    'notification.replyNotificationDeleted',
    {
      notificationId: notification.notificationId,
      replierActorId: notification.replierActorId,
      replyPostId: notification.replyPostId,
      originalPostId: notification.originalPostId,
    },
    now,
  );
};

export type ReplyNotificationDeletedStore = Agg.Store<ReplyNotificationDeleted>;

// Reply通知をActorIdとReplyPostIdで検索するリゾルバ（重複防止用）
export type ReplyNotificationResolverByActorIdAndReplyPostId = Agg.Resolver<
  { replierActorId: ActorId; replyPostId: PostId },
  ReplyNotification | undefined
>;

// Reply通知をReplyPostIdで検索するリゾルバ（リプライ投稿削除時に使用）
export type ReplyNotificationsResolverByReplyPostId = Agg.Resolver<
  { replyPostId: PostId },
  ReplyNotification[]
>;

// Reply通知をOriginalPostIdで検索するリゾルバ（元投稿削除時に使用）
export type ReplyNotificationsResolverByOriginalPostId = Agg.Resolver<
  { originalPostId: PostId },
  ReplyNotification[]
>;

export type RepostNotificationCreated = NotificationEvent<
  RepostNotification,
  'notification.repostNotificationCreated',
  RepostNotification
>;

const createRepostNotification = (payload: RepostNotification, now: Instant): RepostNotificationCreated => {
  return NotificationEvent.create(
    toAggregateId(payload),
    payload,
    'notification.repostNotificationCreated',
    payload,
    now,
  );
};

export type RepostNotificationCreatedStore = Agg.Store<RepostNotificationCreated>;

export type RepostNotificationResolverByRecipientAndActorIdAndPostId = Agg.Resolver<
  { recipientUserId: UserId; reposterActorId: ActorId; repostedPostId: PostId },
  RepostNotification | undefined
>;

export type BlueskyNotification =
  | BlueskyLikeNotification
  | BlueskyRepostNotification
  | BlueskyFollowNotification
  | BlueskyMentionNotification;

export type BlueskyNotificationCreated = NotificationEvent<
  BlueskyNotification,
  'notification.blueskyNotificationCreated',
  BlueskyNotification
>;

const createBlueskyNotification = (payload: BlueskyNotification, now: Instant): BlueskyNotificationCreated => {
  return NotificationEvent.create(
    toAggregateId(payload),
    payload,
    'notification.blueskyNotificationCreated',
    payload,
    now,
  );
};

export type BlueskyNotificationCreatedStore = Agg.Store<BlueskyNotificationCreated>;

// 通知既読イベント
export type NotificationsReadPayload = Readonly<{
  notificationIds: ReadonlyArray<NotificationId>;
  userId: UserId;
}>;

export type NotificationsRead = NotificationEvent<
  undefined,
  'notification.notificationsRead',
  NotificationsReadPayload
>;

const markAsRead = (
  notificationIds: ReadonlyArray<NotificationId>,
  userId: UserId,
  now: Instant,
): NotificationsRead => {
  // 集約IDは最初のnotificationIdを使用（バッチ処理のため）
  const aggregateId: NotificationAggregateId = {
    notificationId: notificationIds[0] ?? NotificationId.generate(),
  };
  return NotificationEvent.create(
    aggregateId,
    undefined,
    'notification.notificationsRead',
    { notificationIds, userId },
    now,
  );
};

export type NotificationsReadStore = Agg.Store<NotificationsRead>;

export type NotificationDismissedPayload = Readonly<{
  notificationId: NotificationId;
  userId: UserId;
}>;

export type NotificationDismissed = NotificationEvent<
  undefined,
  'notification.notificationDismissed',
  NotificationDismissedPayload
>;

const dismissNotification = (notification: Notification, now: Instant): NotificationDismissed => {
  return NotificationEvent.create(
    toAggregateId(notification),
    undefined,
    'notification.notificationDismissed',
    { notificationId: notification.notificationId, userId: notification.recipientUserId },
    now,
  );
};

export type NotificationDismissedStore = Agg.Store<NotificationDismissed>;

export type NotificationsClearedPayload = Readonly<{ userId: UserId }>;

export type NotificationsCleared = NotificationEvent<
  undefined,
  'notification.notificationsCleared',
  NotificationsClearedPayload
>;

const clearNotifications = (userId: UserId, now: Instant): NotificationsCleared => {
  // 全件削除は特定の通知に紐づかないので、集約IDは新しく採番する
  return NotificationEvent.create(
    { notificationId: NotificationId.generate() },
    undefined,
    'notification.notificationsCleared',
    { userId },
    now,
  );
};

export type NotificationsClearedStore = Agg.Store<NotificationsCleared>;

export type NotificationNotFoundError = Readonly<{
  type: 'NotificationNotFoundError';
  message: string;
  detail: { notificationId: NotificationId };
}>;

export const NotificationNotFoundError = {
  create: (notificationId: NotificationId): NotificationNotFoundError => ({
    type: 'NotificationNotFoundError',
    message: `The notification with ID "${notificationId}" was not found.`,
    detail: { notificationId },
  }),
} as const;

export const Notification = {
  ...schema,
  createLikeNotification,
  createFollowNotification,
  deleteLikeNotification,
  createEmojiReactNotification,
  deleteEmojiReactNotification,
  createReplyNotification,
  deleteReplyNotification,
  createRepostNotification,
  createBlueskyNotification,
  markAsRead,
  dismissNotification,
  clearNotifications,
  toAggregateId,
} as const;

// Like通知と関連情報を含む型
export type LikeNotificationWithDetails = Readonly<{
  notification: LikeNotification;
  likerActor: Actor;
  likedPost: Post;
  createdAt: Instant;
}>;

// Follow通知と関連情報を含む型
export type FollowNotificationWithDetails = Readonly<{
  notification: FollowNotification;
  followerActor: Actor;
  createdAt: Instant;
}>;

// EmojiReact通知と関連情報を含む型
export type EmojiReactNotificationWithDetails = Readonly<{
  notification: EmojiReactNotification;
  reactorActor: Actor;
  reactedPost: Post;
  createdAt: Instant;
}>;

// Reply通知と関連情報を含む型
export type ReplyNotificationWithDetails = Readonly<{
  notification: ReplyNotification;
  replierActor: Actor;
  replyPost: Post;
  replyPostAuthorUsername: string | undefined;
  /** 返信先の投稿（削除済みの場合はundefined） */
  originalPost: Post | undefined;
  createdAt: Instant;
}>;

// 通知と関連情報を含む型
export type NotificationWithDetails =
  | LikeNotificationWithDetails
  | FollowNotificationWithDetails
  | EmojiReactNotificationWithDetails
  | ReplyNotificationWithDetails;

// ユーザーIDで通知一覧を取得するリゾルバ
export type NotificationsResolverByUserId = Agg.Resolver<UserId, NotificationWithDetails[]>;

// 未読通知数を取得するリゾルバ
export type UnreadNotificationCountResolverByUserId = Agg.Resolver<UserId, number>;

export type NotificationItem = Readonly<{
  notification: Notification;
  createdAt: Instant;
}>;

export type NotificationsResolverByPage = Agg.Resolver<
  Readonly<{ recipientUserId: UserId; page: PageRequest; types: ReadonlyArray<Notification['type']> }>,
  NotificationItem[]
>;

export type NotificationResolverByUserIdAndId = Agg.Resolver<
  Readonly<{ recipientUserId: UserId; notificationId: NotificationId }>,
  NotificationItem | undefined
>;

export type NotificationIdsResolverByUserIdAndCreatedAt = Agg.Resolver<
  Readonly<{ recipientUserId: UserId; createdAt: Instant }>,
  NotificationId[]
>;

export type NotificationCountResolverSinceMarker = Agg.Resolver<
  Readonly<{ userId: UserId; types: ReadonlyArray<Notification['type']>; limit: number }>,
  number
>;
