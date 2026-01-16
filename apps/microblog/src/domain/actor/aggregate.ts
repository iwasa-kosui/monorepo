import type { Aggregate } from '../aggregate/aggregate.ts';
import { AggregateEvent, type DomainEvent } from '../aggregate/event.ts';
import type { Agg } from '../aggregate/index.ts';
import type { Actor } from './actor.ts';
import type { ActorId } from './actorId.ts';

export type ActorAggregate = Aggregate<ActorId, 'actor', Actor>;

export type ActorEvent<
  TAggregateState extends Agg.InferState<ActorAggregate> | undefined,
  TEventName extends string,
  TEventPayload extends Record<string, unknown>,
> = DomainEvent<ActorAggregate, TAggregateState, TEventName, TEventPayload>;

export const ActorEvent = AggregateEvent.createFactory<ActorAggregate>('actor');
