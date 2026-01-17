import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { ActorId } from '../actor/actorId.ts';
import { AggregateEvent, type DomainEvent } from '../aggregate/event.ts';
import type { Agg } from '../aggregate/index.ts';
import type { Instant } from '../instant/instant.ts';
import { PostId } from '../post/postId.ts';
import { ReceivedLikeId } from './receivedLikeId.ts';

const zodType = z
  .object({
    receivedLikeId: ReceivedLikeId.zodType,
    likerActorId: ActorId.zodType,
    likedPostId: PostId.zodType,
    likeActivityUri: z.string(),
  })
  .describe('ReceivedLike');
const schema = Schema.create<z.output<typeof zodType>, z.input<typeof zodType>>(
  zodType,
);
export type ReceivedLike = z.output<typeof zodType>;
export type ReceivedLikeAggregateId = Readonly<{
  receivedLikeId: ReceivedLikeId;
}>;
export type ReceivedLikeAggregate = Agg.Aggregate<ReceivedLikeAggregateId, 'receivedLike', ReceivedLike>;
const toAggregateId = (receivedLike: ReceivedLike): ReceivedLikeAggregateId => ({
  receivedLikeId: receivedLike.receivedLikeId,
});

type ReceivedLikeEvent<
  TAggregateState extends Agg.InferState<ReceivedLikeAggregate> | undefined,
  TEventName extends string,
  TEventPayload extends Record<string, unknown>,
> = DomainEvent<ReceivedLikeAggregate, TAggregateState, TEventName, TEventPayload>;
const ReceivedLikeEvent = AggregateEvent.createFactory<ReceivedLikeAggregate>('receivedLike');

export type ReceivedLikeCreated = ReceivedLikeEvent<ReceivedLike, 'receivedLike.receivedLikeCreated', ReceivedLike>;
export type ReceivedLikeDeleted = ReceivedLikeEvent<
  undefined,
  'receivedLike.receivedLikeDeleted',
  { likeActivityUri: string }
>;

const createReceivedLike = (payload: ReceivedLike, now: Instant): ReceivedLikeCreated => {
  return ReceivedLikeEvent.create(
    toAggregateId(payload),
    payload,
    'receivedLike.receivedLikeCreated',
    payload,
    now,
  );
};

const deleteReceivedLike = (receivedLike: ReceivedLike, now: Instant): ReceivedLikeDeleted => {
  return ReceivedLikeEvent.create(
    toAggregateId(receivedLike),
    undefined,
    'receivedLike.receivedLikeDeleted',
    { likeActivityUri: receivedLike.likeActivityUri },
    now,
  );
};

export type ReceivedLikeCreatedStore = Agg.Store<ReceivedLikeCreated>;
export type ReceivedLikeDeletedStore = Agg.Store<ReceivedLikeDeleted>;
export type ReceivedLikeResolverByActivityUri = Agg.Resolver<
  { likeActivityUri: string },
  ReceivedLike | undefined
>;

export const ReceivedLike = {
  ...schema,
  createReceivedLike,
  deleteReceivedLike,
  toAggregateId,
} as const;

export type AlreadyReceivedLikeError = Readonly<{
  type: 'AlreadyReceivedLikeError';
  message: string;
  detail: {
    likeActivityUri: string;
  };
}>;

export const AlreadyReceivedLikeError = {
  create: ({ likeActivityUri }: { likeActivityUri: string }): AlreadyReceivedLikeError => ({
    type: 'AlreadyReceivedLikeError',
    message: `The like activity "${likeActivityUri}" has already been received.`,
    detail: { likeActivityUri },
  }),
} as const;

export type ReceivedLikeNotFoundError = Readonly<{
  type: 'ReceivedLikeNotFoundError';
  message: string;
  detail: {
    likeActivityUri: string;
  };
}>;

export const ReceivedLikeNotFoundError = {
  create: ({ likeActivityUri }: { likeActivityUri: string }): ReceivedLikeNotFoundError => ({
    type: 'ReceivedLikeNotFoundError',
    message: `The like activity "${likeActivityUri}" was not found.`,
    detail: { likeActivityUri },
  }),
} as const;
