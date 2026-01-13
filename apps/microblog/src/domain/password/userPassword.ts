import z from "zod/v4";
import { UserId } from "../user/userId.ts";
import { HashedPassword } from "./password.ts";
import type { Agg } from "../aggregate/index.ts";
import { AggregateEvent, type DomainEvent } from "../aggregate/event.ts";
import type { Instant } from "../instant/instant.ts";

const zodType = z.object({
  userId: UserId.zodType,
  hashedPassword: HashedPassword.zodType,
}).describe('UserPassword');

export type UserPassword = z.output<typeof zodType>;

export type UserPasswordAggregate = Agg.Aggregate<UserId, 'userPassword', UserPassword>;
export type UserPasswordEvent<TAggregateState extends Agg.InferState<UserPasswordAggregate> | undefined,
  TEventName extends string,
  TEventPayload extends Record<string, unknown>
> = DomainEvent<UserPasswordAggregate, TAggregateState, TEventName, TEventPayload>;

export const UserPasswordEvent = AggregateEvent.createFactory<UserPasswordAggregate>('userPassword');
export type UserPasswordSet = UserPasswordEvent<UserPassword, 'userPassword.set', UserPassword>;

const setUserPassword = (now: Instant) => (payload: UserPassword): UserPasswordSet =>
  UserPasswordEvent.create(
    payload.userId,
    payload,
    'userPassword.set',
    payload,
    now,
  );

export const UserPassword = {
  zodType,
  setUserPassword,
} as const;

export type UserPasswordSetStore = Agg.Store<UserPasswordSet>;
export type UserPasswordResolver = Agg.Resolver<UserId, UserPassword | undefined>;
