import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { ActorId } from '../actor/actorId.ts';
import { AggregateEvent, type DomainEvent } from '../aggregate/event.ts';
import type { Agg } from '../aggregate/index.ts';
import type { Instant } from '../instant/instant.ts';
import type { PageRequest } from '../page/page.ts';
import { UserId } from '../user/userId.ts';
import type { Username } from '../user/username.ts';
import { BlockId } from './blockId.ts';

const zodType = z
  .object({
    blockId: BlockId.zodType,
    userId: UserId.zodType,
    blockedActorId: ActorId.zodType,
  })
  .describe('Block');
const schema = Schema.create<z.output<typeof zodType>, z.input<typeof zodType>>(
  zodType,
);
export type Block = z.output<typeof zodType>;
export type BlockAggregateId = Readonly<{
  blockId: BlockId;
}>;
export type BlockAggregate = Agg.Aggregate<BlockAggregateId, 'block', Block>;
const toAggregateId = (block: Block): BlockAggregateId => ({
  blockId: block.blockId,
});

type BlockEvent<
  TAggregateState extends Agg.InferState<BlockAggregate> | undefined,
  TEventName extends string,
  TEventPayload extends Record<string, unknown>,
> = DomainEvent<BlockAggregate, TAggregateState, TEventName, TEventPayload>;
const BlockEvent = AggregateEvent.createFactory<BlockAggregate>('block');

export type BlockCreated = BlockEvent<Block, 'block.blockCreated', Block>;
export type BlockDeleted = BlockEvent<
  undefined,
  'block.blockDeleted',
  { blockId: BlockId }
>;

const createBlock = (payload: Block, now: Instant): BlockCreated => {
  return BlockEvent.create(
    toAggregateId(payload),
    payload,
    'block.blockCreated',
    payload,
    now,
  );
};

const deleteBlock = (block: Block, now: Instant): BlockDeleted => {
  return BlockEvent.create(
    toAggregateId(block),
    undefined,
    'block.blockDeleted',
    { blockId: block.blockId },
    now,
  );
};

export type BlockCreatedStore = Agg.Store<BlockCreated>;
export type BlockDeletedStore = Agg.Store<BlockDeleted>;
export type BlockResolver = Agg.Resolver<
  { userId: UserId; blockedActorId: ActorId },
  Block | undefined
>;
export type BlockedActorIdsResolverByUserId = Agg.Resolver<
  UserId,
  ReadonlyArray<ActorId>
>;
export type BlockedActorUriResolverByUsername = Agg.Resolver<
  Readonly<{ username: Username; actorUri: string }>,
  boolean
>;
export type BlockedActorsResolverByUserIdWithPagination = Agg.Resolver<
  Readonly<{ userId: UserId; page: PageRequest }>,
  ReadonlyArray<Readonly<{ blockId: BlockId; blockedActorId: ActorId }>>
>;
export const Block = {
  ...schema,
  createBlock,
  deleteBlock,
  toAggregateId,
} as const;

export type AlreadyBlockedError = Readonly<{
  type: 'AlreadyBlockedError';
  message: string;
  detail: {
    userId: UserId;
    blockedActorId: ActorId;
  };
}>;

export const AlreadyBlockedError = {
  create: ({
    userId,
    blockedActorId,
  }: { userId: UserId; blockedActorId: ActorId }): AlreadyBlockedError => ({
    type: 'AlreadyBlockedError',
    message: `User "${userId}" has already blocked actor "${blockedActorId}".`,
    detail: { userId, blockedActorId },
  }),
} as const;

export type NotBlockedError = Readonly<{
  type: 'NotBlockedError';
  message: string;
  detail: {
    userId: UserId;
    blockedActorId: ActorId;
  };
}>;

export const NotBlockedError = {
  create: ({
    userId,
    blockedActorId,
  }: { userId: UserId; blockedActorId: ActorId }): NotBlockedError => ({
    type: 'NotBlockedError',
    message: `User "${userId}" has not blocked actor "${blockedActorId}".`,
    detail: { userId, blockedActorId },
  }),
} as const;

export type CannotBlockSelfError = Readonly<{
  type: 'CannotBlockSelfError';
  message: string;
  detail: {
    userId: UserId;
    actorId: ActorId;
  };
}>;

export const CannotBlockSelfError = {
  create: ({
    userId,
    actorId,
  }: { userId: UserId; actorId: ActorId }): CannotBlockSelfError => ({
    type: 'CannotBlockSelfError',
    message: `User "${userId}" cannot block their own actor "${actorId}".`,
    detail: { userId, actorId },
  }),
} as const;
