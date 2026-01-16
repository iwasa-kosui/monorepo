import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { ActorId } from '../actor/actorId.ts';
import { AggregateEvent, type DomainEvent } from '../aggregate/event.ts';
import type { Agg } from '../aggregate/index.ts';
import type { Instant } from '../instant/instant.ts';

const zodType = z.object({
  followerId: ActorId.zodType,
  followingId: ActorId.zodType,
}).describe('Follow');
const schema = Schema.create<z.output<typeof zodType>, z.input<typeof zodType>>(zodType);
export type Follow = z.output<typeof zodType>;
export type FollowAggregateId = Readonly<{
  followerId: ActorId;
  followingId: ActorId;
}>;
export type FollowAggregate = Agg.Aggregate<FollowAggregateId, 'follow', Follow>;
const toAggregateId = (follow: Follow): FollowAggregateId => ({
  followerId: follow.followerId,
  followingId: follow.followingId,
});
const fromAggregateId = (aggregateId: FollowAggregateId): Follow => ({
  followerId: aggregateId.followerId,
  followingId: aggregateId.followingId,
});

type FollowEvent<
  TAggregateState extends Agg.InferState<FollowAggregate> | undefined,
  TEventName extends string,
  TEventPayload extends Record<string, unknown>,
> = DomainEvent<FollowAggregate, TAggregateState, TEventName, TEventPayload>;
const FollowEvent = AggregateEvent.createFactory<FollowAggregate>('follow');

export type FollowAccepted = FollowEvent<Follow, 'follow.followAccepted', Follow>;
export type UndoFollowingProcessed = FollowEvent<undefined, 'follow.undoFollowingProcessed', Follow>;
export type FollowRequested = FollowEvent<Follow, 'follow.followRequested', Follow>;

const acceptFollow = (payload: Follow, now: Instant): FollowAccepted => {
  return FollowEvent.create(toAggregateId(payload), payload, 'follow.followAccepted', payload, now);
};

const undoFollow = (payload: Follow, now: Instant): UndoFollowingProcessed => {
  return FollowEvent.create(toAggregateId(payload), undefined, 'follow.undoFollowingProcessed', payload, now);
};

const requestFollow = (payload: Follow, now: Instant): FollowRequested => {
  return FollowEvent.create(toAggregateId(payload), payload, 'follow.followRequested', payload, now);
};

export type FollowAcceptedStore = Agg.Store<FollowAccepted>;
export type UndoFollowingProcessedStore = Agg.Store<UndoFollowingProcessed>;
export type FollowRequestedStore = Agg.Store<FollowRequested>;
export type FollowResolver = Agg.Resolver<FollowAggregateId, Follow | undefined>;
export const Follow = {
  ...schema,
  acceptFollow,
  undoFollow,
  requestFollow,
  toAggregateId,
  fromAggregateId,
} as const;

export type AlreadyUnfollowedError = Readonly<{
  type: 'AlreadyUnfollowedError';
  message: string;
  detail: {
    followerId: ActorId;
    followingId: ActorId;
  };
}>;

export const AlreadyUnfollowedError = {
  create: ({ followerId, followingId }: { followerId: ActorId; followingId: ActorId }): AlreadyUnfollowedError => ({
    type: 'AlreadyUnfollowedError',
    message: `The actor with ID "${followerId}" has already unfollowed the actor with ID "${followingId}".`,
    detail: { followerId, followingId },
  }),
} as const;
