import type { AnyBusinessEvent } from './event.ts';

export type Aggregate<TId extends string, TName extends string, TState> = Readonly<{
  id: TId;
  name: TName;
  state: TState;
}>;

export type AnyAggregate = Aggregate<string, string, unknown>;

export type InferId<TAggregate extends AnyAggregate> = TAggregate['id'];
export type InferName<TAggregate extends AnyAggregate> = TAggregate['name'];
export type InferState<TAggregate extends AnyAggregate> = TAggregate['state'];

export type Resolver<TCondition, TResolved> = Readonly<{
  resolve: (condition: TCondition) => TResolved;
}>;

export type Store<TEvent extends AnyBusinessEvent> = Readonly<{
  store: (event: TEvent) => void;
}>;
