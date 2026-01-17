import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { ActorId } from '../actor/actorId.ts';
import { AggregateEvent, type DomainEvent } from '../aggregate/event.ts';
import type { Agg } from '../aggregate/index.ts';
import type { Instant } from '../instant/instant.ts';
import { LikeId } from './likeId.ts';

const zodType = z
  .object({
    likeId: LikeId.zodType,
    actorId: ActorId.zodType,
    objectUri: z.string(),
    likeActivityUri: z.nullable(z.string()),
  })
  .describe('LikeV2');
const schema = Schema.create<z.output<typeof zodType>, z.input<typeof zodType>>(
  zodType,
);
export type LikeV2 = z.output<typeof zodType>;
export type LikeV2AggregateId = Readonly<{
  likeId: LikeId;
}>;
export type LikeV2Aggregate = Agg.Aggregate<LikeV2AggregateId, 'likeV2', LikeV2>;
const toAggregateId = (like: LikeV2): LikeV2AggregateId => ({
  likeId: like.likeId,
});

type LikeV2Event<
  TAggregateState extends Agg.InferState<LikeV2Aggregate> | undefined,
  TEventName extends string,
  TEventPayload extends Record<string, unknown>,
> = DomainEvent<LikeV2Aggregate, TAggregateState, TEventName, TEventPayload>;
const LikeV2Event = AggregateEvent.createFactory<LikeV2Aggregate>('likeV2');

export type LikeV2Created = LikeV2Event<LikeV2, 'likeV2.likeV2Created', LikeV2>;
export type LikeV2Deleted = LikeV2Event<
  undefined,
  'likeV2.likeV2Deleted',
  { likeActivityUri: string }
>;

const createLikeV2 = (payload: LikeV2, now: Instant): LikeV2Created => {
  return LikeV2Event.create(
    toAggregateId(payload),
    payload,
    'likeV2.likeV2Created',
    payload,
    now,
  );
};

const deleteLikeV2 = (like: LikeV2, now: Instant): LikeV2Deleted => {
  if (!like.likeActivityUri) {
    throw new Error('Cannot delete a like without likeActivityUri');
  }
  return LikeV2Event.create(
    toAggregateId(like),
    undefined,
    'likeV2.likeV2Deleted',
    { likeActivityUri: like.likeActivityUri },
    now,
  );
};

export type LikeV2CreatedStore = Agg.Store<LikeV2Created>;
export type LikeV2DeletedStore = Agg.Store<LikeV2Deleted>;
export type LikeV2ResolverByActivityUri = Agg.Resolver<
  { likeActivityUri: string },
  LikeV2 | undefined
>;

export const LikeV2 = {
  ...schema,
  createLikeV2,
  deleteLikeV2,
  toAggregateId,
} as const;

export type AlreadyLikedV2Error = Readonly<{
  type: 'AlreadyLikedV2Error';
  message: string;
  detail: {
    actorId: ActorId;
    objectUri: string;
  };
}>;

export const AlreadyLikedV2Error = {
  create: ({
    actorId,
    objectUri,
  }: { actorId: ActorId; objectUri: string }): AlreadyLikedV2Error => ({
    type: 'AlreadyLikedV2Error',
    message: `The actor with ID "${actorId}" has already liked the object "${objectUri}".`,
    detail: { actorId, objectUri },
  }),
} as const;

export type LikeV2NotFoundError = Readonly<{
  type: 'LikeV2NotFoundError';
  message: string;
  detail: {
    likeActivityUri: string;
  };
}>;

export const LikeV2NotFoundError = {
  create: ({ likeActivityUri }: { likeActivityUri: string }): LikeV2NotFoundError => ({
    type: 'LikeV2NotFoundError',
    message: `The like activity "${likeActivityUri}" was not found.`,
    detail: { likeActivityUri },
  }),
} as const;
