import { AggregateEvent, type DomainEvent } from '../aggregate/event.ts';
import { Agg } from '../aggregate/index.ts';
import type { User } from './user.ts';
import type { UserId } from './userId.ts';

export type UserAggregate = Agg.Aggregate<UserId, 'user', User>;
export type UserEvent<
  TAggregateState extends Agg.InferState<UserAggregate> | undefined,
  TEventName extends string,
  TEventPayload extends Record<string, unknown>,
> = DomainEvent<UserAggregate, TAggregateState, TEventName, TEventPayload>;
export const UserEvent = AggregateEvent.createFactory<UserAggregate>('user');
