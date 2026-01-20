import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { ActorId } from '../actor/actorId.ts';
import { AggregateEvent, type DomainEvent } from '../aggregate/event.ts';
import type { Agg } from '../aggregate/index.ts';
import type { Instant } from '../instant/instant.ts';
import { PostId } from '../post/postId.ts';
import { LikeId } from './likeId.ts';

const zodType = z
  .object({
    likeId: LikeId.zodType,
    actorId: ActorId.zodType,
    postId: PostId.zodType,
  })
  .describe('Like');
const schema = Schema.create<z.output<typeof zodType>, z.input<typeof zodType>>(
  zodType,
);
export type Like = z.output<typeof zodType>;
export type LikeAggregateId = Readonly<{
  likeId: LikeId;
}>;
export type LikeAggregate = Agg.Aggregate<LikeAggregateId, 'like', Like>;
const toAggregateId = (like: Like): LikeAggregateId => ({
  likeId: like.likeId,
});

type LikeEvent<
  TAggregateState extends Agg.InferState<LikeAggregate> | undefined,
  TEventName extends string,
  TEventPayload extends Record<string, unknown>,
> = DomainEvent<LikeAggregate, TAggregateState, TEventName, TEventPayload>;
const LikeEvent = AggregateEvent.createFactory<LikeAggregate>('like');

export type LikeCreated = LikeEvent<Like, 'like.likeCreated', Like>;
export type LikeDeleted = LikeEvent<
  undefined,
  'like.likeDeleted',
  { likeId: LikeId }
>;

const createLike = (payload: Like, now: Instant): LikeCreated => {
  return LikeEvent.create(
    toAggregateId(payload),
    payload,
    'like.likeCreated',
    payload,
    now,
  );
};

const deleteLike = (like: Like, now: Instant): LikeDeleted => {
  return LikeEvent.create(
    toAggregateId(like),
    undefined,
    'like.likeDeleted',
    { likeId: like.likeId },
    now,
  );
};

export type LikeCreatedStore = Agg.Store<LikeCreated>;
export type LikeDeletedStore = Agg.Store<LikeDeleted>;
export type LikeResolver = Agg.Resolver<
  { actorId: ActorId; postId: PostId },
  Like | undefined
>;
export const Like = {
  ...schema,
  createLike,
  deleteLike,
  toAggregateId,
} as const;

export type AlreadyLikedError = Readonly<{
  type: 'AlreadyLikedError';
  message: string;
  detail: {
    actorId: ActorId;
    postId: PostId;
  };
}>;

export const AlreadyLikedError = {
  create: ({
    actorId,
    postId,
  }: { actorId: ActorId; postId: PostId }): AlreadyLikedError => ({
    type: 'AlreadyLikedError',
    message: `The actor with ID "${actorId}" has already liked the post "${postId}".`,
    detail: { actorId, postId },
  }),
} as const;

export type NotLikedError = Readonly<{
  type: 'NotLikedError';
  message: string;
  detail: {
    postId: PostId;
  };
}>;

export const NotLikedError = {
  create: (postId: PostId): NotLikedError => ({
    type: 'NotLikedError',
    message: `No like found for post "${postId}"`,
    detail: { postId },
  }),
} as const;
