/* eslint-disable @typescript-eslint/no-explicit-any */
import type { RA } from '@iwasa-kosui/result';

import type { AnyDomainEvent } from './event.ts';

type AnyId = string | number | symbol | Readonly<Record<string, string | number | symbol>>;
type AnyName = string;
type AnyState = Record<string, unknown>;

export type Aggregate<TId extends AnyId, TName extends AnyName, TState extends AnyState> = Readonly<{
  id: TId;
  name: TName;
  state: TState;
}>;

export type AnyAggregate = Aggregate<AnyId, AnyName, AnyState>;

export type InferId<TAggregate> = TAggregate extends Aggregate<infer TId, any, any> ? TId
  : never;

export type InferName<TAggregate> = TAggregate extends Aggregate<any, infer TName, any> ? TName
  : never;

export type InferState<TAggregate> = TAggregate extends Aggregate<any, any, infer TState> ? TState
  : never;

export type Resolver<TCondition, TResolved> = Readonly<{
  resolve: (condition: TCondition) => RA<TResolved, never>;
}>;

export type Store<T extends AnyDomainEvent> = Readonly<{
  store: (event: T) => RA<void, never>;
}>;
