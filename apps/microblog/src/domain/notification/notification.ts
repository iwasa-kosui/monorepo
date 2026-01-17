import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { ActorId } from '../actor/actorId.ts';
import { AggregateEvent, type DomainEvent } from '../aggregate/event.ts';
import type { Agg } from '../aggregate/index.ts';
import type { Instant } from '../instant/instant.ts';
import { PostId } from '../post/postId.ts';
import { UserId } from '../user/userId.ts';
import { NotificationId } from './notificationId.ts';

const NotificationTypeSym = Symbol('NotificationType');
const notificationTypeZodType = z.enum(['like']).brand(NotificationTypeSym).describe('NotificationType');
export type NotificationType = z.output<typeof notificationTypeZodType>;
export const NotificationType = {
  like: 'like' as NotificationType,
} as const;

const zodType = z
  .object({
    notificationId: NotificationId.zodType,
    recipientUserId: UserId.zodType,
    type: notificationTypeZodType,
    relatedActorId: z.nullable(ActorId.zodType),
    relatedPostId: z.nullable(PostId.zodType),
    isRead: z.boolean(),
  })
  .describe('Notification');
const schema = Schema.create<z.output<typeof zodType>, z.input<typeof zodType>>(
  zodType,
);
export type Notification = z.output<typeof zodType>;
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

export type NotificationCreated = NotificationEvent<Notification, 'notification.notificationCreated', Notification>;

const createNotification = (payload: Notification, now: Instant): NotificationCreated => {
  return NotificationEvent.create(
    toAggregateId(payload),
    payload,
    'notification.notificationCreated',
    payload,
    now,
  );
};

export type NotificationCreatedStore = Agg.Store<NotificationCreated>;

export const Notification = {
  ...schema,
  createNotification,
  toAggregateId,
} as const;
