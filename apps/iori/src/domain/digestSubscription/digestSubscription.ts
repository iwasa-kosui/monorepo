import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { AggregateEvent, type DomainEvent } from '../aggregate/event.ts';
import type { Agg } from '../aggregate/index.ts';
import { Instant } from '../instant/instant.ts';
import { UserId } from '../user/userId.ts';

const zodType = z
  .object({
    userId: UserId.zodType,
    enabled: z.boolean(),
    createdAt: Instant.zodType,
    updatedAt: Instant.zodType,
  })
  .describe('DigestSubscription');
const schema = Schema.create<z.output<typeof zodType>, z.input<typeof zodType>>(zodType);
export type DigestSubscription = z.output<typeof zodType>;

export type DigestSubscriptionAggregateId = Readonly<{
  userId: UserId;
}>;
export type DigestSubscriptionAggregate = Agg.Aggregate<
  DigestSubscriptionAggregateId,
  'digestSubscription',
  DigestSubscription
>;
const toAggregateId = (subscription: DigestSubscription): DigestSubscriptionAggregateId => ({
  userId: subscription.userId,
});

type DigestSubscriptionEvent<
  TAggregateState extends Agg.InferState<DigestSubscriptionAggregate> | undefined,
  TEventName extends string,
  TEventPayload extends Record<string, unknown>,
> = DomainEvent<DigestSubscriptionAggregate, TAggregateState, TEventName, TEventPayload>;
const DigestSubscriptionEvent = AggregateEvent.createFactory<DigestSubscriptionAggregate>('digestSubscription');

export type DigestSubscriptionSaved = DigestSubscriptionEvent<
  DigestSubscription,
  'digestSubscription.saved',
  DigestSubscription
>;

const save = (
  input: Readonly<{ userId: UserId; enabled: boolean }>,
  previous: DigestSubscription | undefined,
  now: Instant,
): DigestSubscriptionSaved => {
  const subscription = schema.orThrow({
    ...input,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  });
  return DigestSubscriptionEvent.create(
    toAggregateId(subscription),
    subscription,
    'digestSubscription.saved',
    subscription,
    now,
  );
};

export type DigestSubscriptionSavedStore = Agg.Store<DigestSubscriptionSaved>;
export type DigestSubscriptionResolverByUserId = Agg.Resolver<UserId, DigestSubscription | undefined>;

export const DigestSubscription = {
  ...schema,
  save,
  toAggregateId,
} as const;
