import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { ActorId } from '../actor/actorId.ts';
import { AggregateEvent, type DomainEvent } from '../aggregate/event.ts';
import type { Agg } from '../aggregate/index.ts';
import type { Instant } from '../instant/instant.ts';
import { UserId } from '../user/userId.ts';
import { MuteId } from './muteId.ts';

const zodType = z.object({
  muteId: MuteId.zodType,
  muterId: UserId.zodType,
  mutedActorId: ActorId.zodType,
}).describe('Mute');
const schema = Schema.create<z.output<typeof zodType>, z.input<typeof zodType>>(zodType);
export type Mute = z.output<typeof zodType>;
export type MuteAggregateId = MuteId;
export type MuteAggregate = Agg.Aggregate<MuteAggregateId, 'mute', Mute>;

const toAggregateId = (mute: Mute): MuteAggregateId => mute.muteId;

type MuteEvent<
  TAggregateState extends Agg.InferState<MuteAggregate> | undefined,
  TEventName extends string,
  TEventPayload extends Record<string, unknown>,
> = DomainEvent<MuteAggregate, TAggregateState, TEventName, TEventPayload>;
const MuteEvent = AggregateEvent.createFactory<MuteAggregate>('mute');

export type MuteCreated = MuteEvent<Mute, 'mute.muteCreated', Mute>;
export type MuteDeleted = MuteEvent<undefined, 'mute.muteDeleted', { muteId: MuteId }>;

const createMute = (payload: Omit<Mute, 'muteId'>, now: Instant): MuteCreated => {
  const muteId = MuteId.generate();
  const mute: Mute = { muteId, ...payload };
  return MuteEvent.create(muteId, mute, 'mute.muteCreated', mute, now);
};

const deleteMute = (mute: Mute, now: Instant): MuteDeleted => {
  return MuteEvent.create(toAggregateId(mute), undefined, 'mute.muteDeleted', { muteId: mute.muteId }, now);
};

export type MuteCreatedStore = Agg.Store<MuteCreated>;
export type MuteDeletedStore = Agg.Store<MuteDeleted>;
export type MuteResolver = Agg.Resolver<{ muterId: UserId; mutedActorId: ActorId }, Mute | undefined>;
export type MutesResolverByMuterId = Agg.Resolver<{ muterId: UserId }, readonly Mute[]>;
export type MutedActorIdsResolverByMuterId = Agg.Resolver<{ muterId: UserId }, readonly ActorId[]>;

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
    muterId: UserId;
    mutedActorId: ActorId;
  };
}>;

export const AlreadyMutedError = {
  create: ({ muterId, mutedActorId }: { muterId: UserId; mutedActorId: ActorId }): AlreadyMutedError => ({
    type: 'AlreadyMutedError',
    message: `The user with ID "${muterId}" has already muted the actor with ID "${mutedActorId}".`,
    detail: { muterId, mutedActorId },
  }),
} as const;

export type NotMutedError = Readonly<{
  type: 'NotMutedError';
  message: string;
  detail: {
    muterId: UserId;
    mutedActorId: ActorId;
  };
}>;

export const NotMutedError = {
  create: ({ muterId, mutedActorId }: { muterId: UserId; mutedActorId: ActorId }): NotMutedError => ({
    type: 'NotMutedError',
    message: `The user with ID "${muterId}" has not muted the actor with ID "${mutedActorId}".`,
    detail: { muterId, mutedActorId },
  }),
} as const;
