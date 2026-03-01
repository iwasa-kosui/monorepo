import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { ActorId } from '../actor/actorId.ts';
import { AggregateEvent, type DomainEvent } from '../aggregate/event.ts';
import type { Agg } from '../aggregate/index.ts';
import type { Instant } from '../instant/instant.ts';
import { UserId } from '../user/userId.ts';
import { MuteId } from './muteId.ts';

const zodType = z
  .object({
    muteId: MuteId.zodType,
    userId: UserId.zodType,
    mutedActorId: ActorId.zodType,
  })
  .describe('Mute');
const schema = Schema.create<z.output<typeof zodType>, z.input<typeof zodType>>(
  zodType,
);
export type Mute = z.output<typeof zodType>;
export type MuteAggregateId = Readonly<{
  muteId: MuteId;
}>;
export type MuteAggregate = Agg.Aggregate<MuteAggregateId, 'mute', Mute>;
const toAggregateId = (mute: Mute): MuteAggregateId => ({
  muteId: mute.muteId,
});

type MuteEvent<
  TAggregateState extends Agg.InferState<MuteAggregate> | undefined,
  TEventName extends string,
  TEventPayload extends Record<string, unknown>,
> = DomainEvent<MuteAggregate, TAggregateState, TEventName, TEventPayload>;
const MuteEvent = AggregateEvent.createFactory<MuteAggregate>('mute');

export type MuteCreated = MuteEvent<Mute, 'mute.muteCreated', Mute>;
export type MuteDeleted = MuteEvent<
  undefined,
  'mute.muteDeleted',
  { muteId: MuteId }
>;

const createMute = (payload: Mute, now: Instant): MuteCreated => {
  return MuteEvent.create(
    toAggregateId(payload),
    payload,
    'mute.muteCreated',
    payload,
    now,
  );
};

const deleteMute = (mute: Mute, now: Instant): MuteDeleted => {
  return MuteEvent.create(
    toAggregateId(mute),
    undefined,
    'mute.muteDeleted',
    { muteId: mute.muteId },
    now,
  );
};

export type MuteCreatedStore = Agg.Store<MuteCreated>;
export type MuteDeletedStore = Agg.Store<MuteDeleted>;
export type MuteResolver = Agg.Resolver<
  { userId: UserId; mutedActorId: ActorId },
  Mute | undefined
>;
export type MutesResolverByUserId = Agg.Resolver<UserId, ReadonlyArray<Mute>>;
export type MutedActorIdsResolverByUserId = Agg.Resolver<
  UserId,
  ReadonlyArray<ActorId>
>;
export const Mute = {
  ...schema,
  createMute,
  deleteMute,
  toAggregateId,
} as const;

export type AlreadyMutedError = Readonly<{
  type: 'AlreadyMutedError';
  message: string;
  detail: {
    userId: UserId;
    mutedActorId: ActorId;
  };
}>;

export const AlreadyMutedError = {
  create: ({
    userId,
    mutedActorId,
  }: { userId: UserId; mutedActorId: ActorId }): AlreadyMutedError => ({
    type: 'AlreadyMutedError',
    message: `User "${userId}" has already muted actor "${mutedActorId}".`,
    detail: { userId, mutedActorId },
  }),
} as const;

export type NotMutedError = Readonly<{
  type: 'NotMutedError';
  message: string;
  detail: {
    userId: UserId;
    mutedActorId: ActorId;
  };
}>;

export const NotMutedError = {
  create: ({
    userId,
    mutedActorId,
  }: { userId: UserId; mutedActorId: ActorId }): NotMutedError => ({
    type: 'NotMutedError',
    message: `User "${userId}" has not muted actor "${mutedActorId}".`,
    detail: { userId, mutedActorId },
  }),
} as const;

export type CannotMuteSelfError = Readonly<{
  type: 'CannotMuteSelfError';
  message: string;
  detail: {
    userId: UserId;
    actorId: ActorId;
  };
}>;

export const CannotMuteSelfError = {
  create: ({
    userId,
    actorId,
  }: { userId: UserId; actorId: ActorId }): CannotMuteSelfError => ({
    type: 'CannotMuteSelfError',
    message: `User "${userId}" cannot mute their own actor "${actorId}".`,
    detail: { userId, actorId },
  }),
} as const;
