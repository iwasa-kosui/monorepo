import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import type { Actor } from '../actor/actor.ts';
import { ActorId } from '../actor/actorId.ts';
import { AggregateEvent, type DomainEvent } from '../aggregate/event.ts';
import type { Agg } from '../aggregate/index.ts';
import type { Instant } from '../instant/instant.ts';
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

const notificationZodType = z.discriminatedUnion('type', [
  likeNotificationZodType,
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

export const Notification = {
  ...schema,
  createLikeNotification,
  toAggregateId,
} as const;

// Like通知と関連情報を含む型
export type LikeNotificationWithDetails = Readonly<{
  notification: LikeNotification;
  likerActor: Actor;
  likedPost: Post;
  createdAt: Instant;
}>;

// 通知と関連情報を含む型
export type NotificationWithDetails = LikeNotificationWithDetails;

// ユーザーIDで通知一覧を取得するリゾルバ
export type NotificationsResolverByUserId = Agg.Resolver<UserId, NotificationWithDetails[]>;
