import z from "zod";
import { UserId } from "./userId.ts";
import { Username } from "./username.ts";
import { ResultAsync } from "@iwasa-kosui/result";
import { Schema, type InferSchema } from "../../helper/schema.ts";
import { createUser } from "./createUser.ts";
import { Agg } from "../aggregate/index.ts";

const schema = Schema.create(z.object({
  id: UserId.zodType,
  username: Username.zodType,
}));

export type User = InferSchema<typeof schema>;

export const User = {
  ...schema,
  createUser,
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

