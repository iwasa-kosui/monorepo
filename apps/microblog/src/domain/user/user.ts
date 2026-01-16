import { Result } from "@iwasa-kosui/result";
import z from "zod/v4";

import { type InferSchema,Schema } from "../../helper/schema.ts";
import { Agg } from "../aggregate/index.ts";
import { createUser } from "./createUser.ts";
import { UserId } from "./userId.ts";
import { Username } from "./username.ts";

const schema = Schema.create(z.object({
  id: UserId.zodType,
  username: Username.zodType,
}));

export type User = InferSchema<typeof schema>;

const checkIfUsernameAcceptable = (username: Username): Result<void, UnacceptableUsernameError> => {
  if (username !== 'kosui') {
    return Result.err(
      UnacceptableUsernameError.create(username, 'Only "kosui" is acceptable as username for now.')
    );
  }
  return Result.ok(undefined);
}

export const User = {
  ...schema,
  createUser,
  checkIfUsernameAcceptable,
} as const;

export type UnacceptableUsernameError = Readonly<{
  type: 'UnacceptableUsernameError';
  message: string;
  detail: {
    username: Username;
    reason: string;
  }
}>;

export const UnacceptableUsernameError = {
  create: (username: Username, reason: string): UnacceptableUsernameError => ({
    type: 'UnacceptableUsernameError',
    message: `The username "${username}" is unacceptable. Reason: ${reason}`,
    detail: { username, reason },
  }),
} as const;

export type UsernameAlreadyTakenError = Readonly<{
  type: 'UsernameAlreadyTakenError';
  message: string;
  detail: {
    username: Username;
  }
}>;

export const UsernameAlreadyTakenError = {
  create: (username: Username): UsernameAlreadyTakenError => ({
    type: 'UsernameAlreadyTakenError',
    message: `The username "${username}" is already taken.`,
    detail: { username },
  }),
} as const;

export type UserNotFoundError = Readonly<{
  type: 'UserNotFoundError';
  message: string;
  detail: {
    username: Username;
  } | {
    userId: UserId;
  }
}>;

export const UserNotFoundError = {
  create: (detail: { username: Username } | { userId: UserId }): UserNotFoundError => ({
    type: 'UserNotFoundError',
    message: 'username' in detail
      ? `The user with username "${detail.username}" was not found.`
      : `The user with ID "${detail.userId}" was not found.`,
    detail,
  }),
} as const;

export type UserResolver = Agg.Resolver<UserId, User | undefined>
export type UserResolverByUsername = Agg.Resolver<Username, User | undefined>
