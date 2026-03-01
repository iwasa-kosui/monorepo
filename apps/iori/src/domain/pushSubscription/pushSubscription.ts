import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { AggregateEvent, type DomainEvent } from '../aggregate/event.ts';
import type { Agg } from '../aggregate/index.ts';
import type { Instant } from '../instant/instant.ts';
import { UserId } from '../user/userId.ts';
import { PushSubscriptionId } from './pushSubscriptionId.ts';

const pushSubscriptionZodType = z
  .object({
    subscriptionId: PushSubscriptionId.zodType,
    userId: UserId.zodType,
    endpoint: z.url(),
    p256dhKey: z.string().min(1),
    authKey: z.string().min(1),
  })
  .describe('PushSubscription');

export type PushSubscription = z.output<typeof pushSubscriptionZodType>;
const schema = Schema.create<PushSubscription, z.input<typeof pushSubscriptionZodType>>(
  pushSubscriptionZodType,
);

export type PushSubscriptionAggregateId = Readonly<{
  subscriptionId: PushSubscriptionId;
}>;
export type PushSubscriptionAggregate = Agg.Aggregate<
  PushSubscriptionAggregateId,
  'pushSubscription',
  PushSubscription
>;

const toAggregateId = (subscription: PushSubscription): PushSubscriptionAggregateId => ({
  subscriptionId: subscription.subscriptionId,
});

type PushSubscriptionEvent<
  TAggregateState extends Agg.InferState<PushSubscriptionAggregate> | undefined,
  TEventName extends string,
  TEventPayload extends Record<string, unknown>,
> = DomainEvent<PushSubscriptionAggregate, TAggregateState, TEventName, TEventPayload>;

const PushSubscriptionEvent = AggregateEvent.createFactory<PushSubscriptionAggregate>('pushSubscription');

// 購読作成イベント
export type PushSubscriptionCreated = PushSubscriptionEvent<
  PushSubscription,
  'pushSubscription.created',
  PushSubscription
>;

const createSubscription = (
  subscription: PushSubscription,
  now: Instant,
): PushSubscriptionCreated => {
  return PushSubscriptionEvent.create(
    toAggregateId(subscription),
    subscription,
    'pushSubscription.created',
    subscription,
    now,
  );
};

// 購読削除イベント
export type PushSubscriptionDeletedPayload = Readonly<{
  subscriptionId: PushSubscriptionId;
}>;

export type PushSubscriptionDeleted = PushSubscriptionEvent<
  undefined,
  'pushSubscription.deleted',
  PushSubscriptionDeletedPayload
>;

const deleteSubscription = (
  subscriptionId: PushSubscriptionId,
  now: Instant,
): PushSubscriptionDeleted => {
  return PushSubscriptionEvent.create(
    { subscriptionId },
    undefined,
    'pushSubscription.deleted',
    { subscriptionId },
    now,
  );
};

export type PushSubscriptionCreatedStore = Agg.Store<PushSubscriptionCreated>;
export type PushSubscriptionDeletedStore = Agg.Store<PushSubscriptionDeleted>;
export type PushSubscriptionsResolverByUserId = Agg.Resolver<UserId, PushSubscription[]>;
export type PushSubscriptionResolverByEndpoint = Agg.Resolver<string, PushSubscription | undefined>;

export const PushSubscription = {
  ...schema,
  createSubscription,
  deleteSubscription,
  toAggregateId,
} as const;
