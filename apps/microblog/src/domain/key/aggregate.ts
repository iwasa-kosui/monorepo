import type { Aggregate } from "../aggregate/aggregate.ts"
import { AggregateEvent, type DomainEvent } from "../aggregate/event.ts";
import type { Agg } from "../aggregate/index.ts";
import type { Key } from "./key.ts";
import type { KeyId } from "./keyId.ts"

export type KeyAggregate = Aggregate<KeyId, "key", Key>;

export type KeyEvent<TAggregateState extends Agg.InferState<KeyAggregate> | undefined,
  TEventName extends string,
  TEventPayload extends Record<string, unknown>
> = DomainEvent<KeyAggregate, TAggregateState, TEventName, TEventPayload>;

export const KeyEvent = AggregateEvent.createFactory<KeyAggregate>("key");
