import type { Instant } from "../instant/instant.ts";
import type { Agg } from "./index.ts";

const EventIdSym = Symbol("EventId");
export type EventId = string & { [EventIdSym]: true };
export const EventId = {
  generate: (): EventId => {
    const uuid = crypto.randomUUID();
    return uuid as EventId;
  },
} as const;

type AnyEventName = string;
type AnyEventPayload = Record<string, unknown>;

export type DomainEvent<
  TAggregate extends Agg.AnyAggregate,
  TAggregateState extends Agg.InferState<TAggregate> | undefined,
  TEventName extends AnyEventName,
  TEventPayload extends AnyEventPayload
> = Readonly<{
  aggregateId: Agg.InferId<TAggregate>;
  aggregateName: Agg.InferName<TAggregate>;
  aggregateState: TAggregateState;
  eventId: EventId;
  eventName: TEventName;
  eventPayload: TEventPayload;
  occurredAt: Instant;
}>;

export type AnyDomainEvent = DomainEvent<
  Agg.AnyAggregate,
  Agg.InferState<Agg.AnyAggregate> | undefined,
  AnyEventName,
  AnyEventPayload
>;

export type AggregateEvent<TAggregate extends Agg.AnyAggregate, TAggregateState extends Agg.InferState<TAggregate> | undefined> = DomainEvent<
  TAggregate,
  TAggregateState,
  AnyEventName,
  AnyEventPayload
>;

const createAggregateEventFactory = <
  TAggregate extends Agg.AnyAggregate,
>(name: Agg.InferName<TAggregate>) => {
  const createDomainEventFactory = <
    TAggregateState extends Agg.InferState<TAggregate> | undefined,
    TEventName extends AnyEventName,
    TEventPayload extends AnyEventPayload,
  >(
    aggregateId: Agg.InferId<TAggregate>,
    aggregateState: TAggregateState,
    eventName: TEventName,
    eventPayload: TEventPayload,
    occurredAt: Instant,
  ): DomainEvent<
    TAggregate,
    TAggregateState,
    TEventName,
    TEventPayload
  > => ({
    aggregateId,
    aggregateName: name,
    aggregateState,
    eventId: EventId.generate(),
    eventName,
    eventPayload,
    occurredAt,
  })

  return {
    create: createDomainEventFactory,
  } as const;
}

export const AggregateEvent = {
  createFactory: createAggregateEventFactory,
} as const;

