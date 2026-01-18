import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import type { Actor } from '../actor/actor.ts';
import { ActorId } from '../actor/actorId.ts';
import { AggregateEvent, type DomainEvent } from '../aggregate/event.ts';
import type { Agg } from '../aggregate/index.ts';
import type { Instant } from '../instant/instant.ts';
import type { Post } from '../post/post.ts';
import { PostId } from '../post/postId.ts';
import { RepostId } from '../repost/repostId.ts';
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

const repostNotificationZodType = z
  .object({
    type: z.literal('repost'),
    notificationId: NotificationId.zodType,
    recipientUserId: UserId.zodType,
    isRead: z.boolean(),
    reposterActorId: ActorId.zodType,
    repostedPostId: PostId.zodType,
    repostId: RepostId.zodType,
  })
  .describe('RepostNotification');

export type RepostNotification = z.output<typeof repostNotificationZodType>;
export const RepostNotification = Schema.create(repostNotificationZodType);

const notificationZodType = z.discriminatedUnion('type', [
  likeNotificationZodType,
  followNotificationZodType,
  repostNotificationZodType,
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

// Repost通知作成イベント
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

export const Notification = {
  ...schema,
  createLikeNotification,
  createFollowNotification,
  createRepostNotification,
  deleteLikeNotification,
  markAsRead,
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

// Repost通知と関連情報を含む型
export type RepostNotificationWithDetails = Readonly<{
  notification: RepostNotification;
  reposterActor: Actor;
  repostedPost: Post;
  createdAt: Instant;
}>;

// 通知と関連情報を含む型
export type NotificationWithDetails = LikeNotificationWithDetails | FollowNotificationWithDetails | RepostNotificationWithDetails;

// ユーザーIDで通知一覧を取得するリゾルバ
export type NotificationsResolverByUserId = Agg.Resolver<UserId, NotificationWithDetails[]>;

// 未読通知数を取得するリゾルバ
export type UnreadNotificationCountResolverByUserId = Agg.Resolver<UserId, number>;
