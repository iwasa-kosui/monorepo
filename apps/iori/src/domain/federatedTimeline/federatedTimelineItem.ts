import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { ActorId } from '../actor/actorId.ts';
import { AggregateEvent, type DomainEvent } from '../aggregate/event.ts';
import type { Agg } from '../aggregate/index.ts';
import type { Instant } from '../instant/instant.ts';
import type { PostWithAuthor } from '../post/post.ts';
import { PostId } from '../post/postId.ts';
import { RelayId } from '../relay/relayId.ts';
import { FederatedTimelineItemId } from './federatedTimelineItemId.ts';

const zodType = z
  .object({
    federatedTimelineItemId: FederatedTimelineItemId.zodType,
    postId: PostId.zodType,
    relayId: RelayId.zodType,
    receivedAt: z.number(),
  })
  .describe('FederatedTimelineItem');
const schema = Schema.create<z.output<typeof zodType>, z.input<typeof zodType>>(
  zodType,
);
export type FederatedTimelineItem = z.output<typeof zodType>;
export type FederatedTimelineItemAggregateId = Readonly<{
  federatedTimelineItemId: FederatedTimelineItemId;
}>;
export type FederatedTimelineItemAggregate = Agg.Aggregate<
  FederatedTimelineItemAggregateId,
  'federatedTimelineItem',
  FederatedTimelineItem
>;
const toAggregateId = (item: FederatedTimelineItem): FederatedTimelineItemAggregateId => ({
  federatedTimelineItemId: item.federatedTimelineItemId,
});

type FederatedTimelineItemEvent<
  TAggregateState extends Agg.InferState<FederatedTimelineItemAggregate> | undefined,
  TEventName extends string,
  TEventPayload extends Record<string, unknown>,
> = DomainEvent<FederatedTimelineItemAggregate, TAggregateState, TEventName, TEventPayload>;
const FederatedTimelineItemEvent = AggregateEvent.createFactory<FederatedTimelineItemAggregate>(
  'federatedTimelineItem',
);

export type FederatedTimelineItemCreated = FederatedTimelineItemEvent<
  FederatedTimelineItem,
  'federatedTimelineItem.created',
  FederatedTimelineItem
>;
export type FederatedTimelineItemDeleted = FederatedTimelineItemEvent<
  undefined,
  'federatedTimelineItem.deleted',
  { federatedTimelineItemId: FederatedTimelineItemId }
>;

const createFederatedTimelineItem = (
  payload: FederatedTimelineItem,
  now: Instant,
): FederatedTimelineItemCreated => {
  return FederatedTimelineItemEvent.create(
    toAggregateId(payload),
    payload,
    'federatedTimelineItem.created',
    payload,
    now,
  );
};

const deleteFederatedTimelineItem = (
  federatedTimelineItemId: FederatedTimelineItemId,
  now: Instant,
): FederatedTimelineItemDeleted => {
  return FederatedTimelineItemEvent.create(
    { federatedTimelineItemId },
    undefined,
    'federatedTimelineItem.deleted',
    { federatedTimelineItemId },
    now,
  );
};

export type FederatedTimelineItemCreatedStore = Agg.Store<FederatedTimelineItemCreated>;
export type FederatedTimelineItemDeletedStore = Agg.Store<FederatedTimelineItemDeleted>;

export type FederatedTimelineItemsResolver = Agg.Resolver<
  {
    receivedAt: Instant | undefined;
    mutedActorIds: ReadonlyArray<ActorId>;
    currentActorId?: ActorId;
  },
  FederatedTimelineItemWithPost[]
>;
export type FederatedTimelineItemResolverByPostId = Agg.Resolver<
  { postId: PostId },
  FederatedTimelineItem | undefined
>;
export type FederatedTimelineItemsResolverByPostId = Agg.Resolver<
  { postId: PostId },
  FederatedTimelineItem[]
>;

export type FederatedTimelineItemWithPost = {
  federatedTimelineItemId: FederatedTimelineItemId;
  post: PostWithAuthor;
  relayId: RelayId;
  receivedAt: Instant;
};

export const FederatedTimelineItem = {
  ...schema,
  createFederatedTimelineItem,
  deleteFederatedTimelineItem,
  toAggregateId,
} as const;
