import type { Agg } from "../aggregate/index.ts";
import type { Instant } from "../instant/instant.ts";
import type { User } from "./user.ts"
import { UserEvent } from "./userAggregate.ts"
import { UserId } from "./userId.ts"

type Payload = Omit<User, 'id'>;

export type UserCreated = UserEvent<User, 'user.created', Payload>

export const createUser = (now: Instant) => (payload: Payload): UserCreated => {
  const user = {
    id: UserId.generate(),
    ...payload,
  }
  return UserEvent.create(user.id, user, 'user.created', payload, now);
}

export type UserCreatedStore = Agg.Store<UserCreated>;
