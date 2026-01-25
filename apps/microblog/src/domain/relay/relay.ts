import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { AggregateEvent, type DomainEvent } from '../aggregate/event.ts';
import type { Agg } from '../aggregate/index.ts';
import type { Instant } from '../instant/instant.ts';
import { RelayId } from './relayId.ts';

const RelayStatus = {
  Pending: 'pending',
  Accepted: 'accepted',
  Rejected: 'rejected',
} as const;
type RelayStatus = (typeof RelayStatus)[keyof typeof RelayStatus];

const zodType = z
  .object({
    relayId: RelayId.zodType,
    inboxUrl: z.string().url(),
    actorUri: z.string().url(),
    status: z.enum(['pending', 'accepted', 'rejected']),
    createdAt: z.number(),
    acceptedAt: z.nullable(z.number()),
  })
  .describe('Relay');
const schema = Schema.create<z.output<typeof zodType>, z.input<typeof zodType>>(
  zodType,
);
export type Relay = z.output<typeof zodType>;
export type RelayAggregateId = Readonly<{
  relayId: RelayId;
}>;
export type RelayAggregate = Agg.Aggregate<RelayAggregateId, 'relay', Relay>;
const toAggregateId = (relay: Relay): RelayAggregateId => ({
  relayId: relay.relayId,
});

type RelayEvent<
  TAggregateState extends Agg.InferState<RelayAggregate> | undefined,
  TEventName extends string,
  TEventPayload extends Record<string, unknown>,
> = DomainEvent<RelayAggregate, TAggregateState, TEventName, TEventPayload>;
const RelayEvent = AggregateEvent.createFactory<RelayAggregate>('relay');

export type RelaySubscriptionRequested = RelayEvent<
  Relay,
  'relay.subscriptionRequested',
  Relay
>;
export type RelaySubscriptionAccepted = RelayEvent<
  Relay,
  'relay.subscriptionAccepted',
  { relayId: RelayId; acceptedAt: Instant }
>;
export type RelayUnsubscribed = RelayEvent<
  undefined,
  'relay.unsubscribed',
  { relayId: RelayId }
>;

const requestSubscription = (
  payload: Omit<Relay, 'status' | 'acceptedAt'>,
  now: Instant,
): RelaySubscriptionRequested => {
  const relay: Relay = {
    ...payload,
    status: RelayStatus.Pending,
    acceptedAt: null,
  };
  return RelayEvent.create(
    toAggregateId(relay),
    relay,
    'relay.subscriptionRequested',
    relay,
    now,
  );
};

const acceptSubscription = (
  relay: Relay,
  now: Instant,
): RelaySubscriptionAccepted => {
  const acceptedRelay: Relay = {
    ...relay,
    status: RelayStatus.Accepted,
    acceptedAt: now,
  };
  return RelayEvent.create(
    toAggregateId(acceptedRelay),
    acceptedRelay,
    'relay.subscriptionAccepted',
    { relayId: relay.relayId, acceptedAt: now },
    now,
  );
};

const unsubscribe = (relay: Relay, now: Instant): RelayUnsubscribed => {
  return RelayEvent.create(
    toAggregateId(relay),
    undefined,
    'relay.unsubscribed',
    { relayId: relay.relayId },
    now,
  );
};

export type RelaySubscriptionRequestedStore = Agg.Store<RelaySubscriptionRequested>;
export type RelaySubscriptionAcceptedStore = Agg.Store<RelaySubscriptionAccepted>;
export type RelayUnsubscribedStore = Agg.Store<RelayUnsubscribed>;

export type RelayResolver = Agg.Resolver<{ relayId: RelayId }, Relay | undefined>;
export type RelayResolverByActorUri = Agg.Resolver<{ actorUri: string }, Relay | undefined>;
export type AcceptedRelaysResolver = Agg.Resolver<void, readonly Relay[]>;
export type AllRelaysResolver = Agg.Resolver<void, readonly Relay[]>;

export const Relay = {
  ...schema,
  Status: RelayStatus,
  requestSubscription,
  acceptSubscription,
  unsubscribe,
  toAggregateId,
} as const;

export type RelayAlreadyExistsError = Readonly<{
  type: 'RelayAlreadyExistsError';
  message: string;
  detail: {
    actorUri: string;
  };
}>;

export const RelayAlreadyExistsError = {
  create: ({ actorUri }: { actorUri: string }): RelayAlreadyExistsError => ({
    type: 'RelayAlreadyExistsError',
    message: `A relay with actor URI "${actorUri}" already exists.`,
    detail: { actorUri },
  }),
} as const;

export type RelayNotFoundError = Readonly<{
  type: 'RelayNotFoundError';
  message: string;
  detail: {
    relayId?: RelayId;
    actorUri?: string;
  };
}>;

export const RelayNotFoundError = {
  create: (detail: { relayId?: RelayId; actorUri?: string }): RelayNotFoundError => ({
    type: 'RelayNotFoundError',
    message: detail.relayId
      ? `A relay with ID "${detail.relayId}" was not found.`
      : `A relay with actor URI "${detail.actorUri}" was not found.`,
    detail,
  }),
} as const;

export type RelayActorLookupError = Readonly<{
  type: 'RelayActorLookupError';
  message: string;
  detail: {
    actorUri: string;
  };
}>;

export const RelayActorLookupError = {
  create: ({ actorUri }: { actorUri: string }): RelayActorLookupError => ({
    type: 'RelayActorLookupError',
    message: `Failed to lookup relay actor at "${actorUri}".`,
    detail: { actorUri },
  }),
} as const;
