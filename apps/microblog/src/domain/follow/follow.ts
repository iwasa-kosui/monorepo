import z from "zod";
import { ActorId } from "../actor/actorId.ts";
import type { Agg } from "../aggregate/index.ts";
import { AggregateEvent, type DomainEvent } from "../aggregate/event.ts";
import type { Instant } from "../instant/instant.ts";
import { Schema } from "../../helper/schema.ts";

const zodType = z.object({
  followerId: ActorId.zodType,
  followingId: ActorId.zodType,
}).describe('Follow');
const schema = Schema.create<z.output<typeof zodType>, z.input<typeof zodType>>(zodType);
export type Follow = z.output<typeof zodType>;
export type FollowAggregateId = Readonly<{
  followerId: ActorId;
  followingId: ActorId;
}>
export type FollowAggregate = Agg.Aggregate<FollowAggregateId, 'follow', Follow>;
const toAggregateId = (follow: Follow): FollowAggregateId => ({
  followerId: follow.followerId,
  followingId: follow.followingId,
});
const fromAggregateId = (aggregateId: FollowAggregateId): Follow => ({
  followerId: aggregateId.followerId,
  followingId: aggregateId.followingId,
});

type FollowEvent<TAggregateState extends Agg.InferState<FollowAggregate> | undefined,
  TEventName extends string,
  TEventPayload extends Record<string, unknown>
> = DomainEvent<FollowAggregate, TAggregateState, TEventName, TEventPayload>;
const FollowEvent = AggregateEvent.createFactory<FollowAggregate>('follow');

export type Followed = FollowEvent<Follow, 'follow.followed', Follow>
export type Unfollowed = FollowEvent<undefined, 'follow.unfollowed', Follow>

const follow = (payload: Follow, now: Instant): Followed => {
  return FollowEvent.create(toAggregateId(payload), payload, 'follow.followed', payload, now);
}

const unfollow = (payload: Follow, now: Instant): Unfollowed => {
  return FollowEvent.create(toAggregateId(payload), undefined, 'follow.unfollowed', payload, now);
}

export type FollowedStore = Agg.Store<Followed>;
export type UnfollowedStore = Agg.Store<Unfollowed>;
export type FollowResolver = Agg.Resolver<FollowAggregateId, Follow | undefined>
export const Follow = {
  ...schema,
  follow,
  unfollow,
  toAggregateId,
  fromAggregateId,
} as const;

export type AlreadyUnfollowedError = Readonly<{
  type: 'AlreadyUnfollowedError';
  message: string;
  detail: {
    followerId: ActorId;
    followingId: ActorId;
  }
}>;

export const AlreadyUnfollowedError = {
  create: ({ followerId, followingId }: { followerId: ActorId; followingId: ActorId }): AlreadyUnfollowedError => ({
    type: 'AlreadyUnfollowedError',
    message: `The actor with ID "${followerId}" has already unfollowed the actor with ID "${followingId}".`,
    detail: { followerId, followingId },
  }),
} as const;
