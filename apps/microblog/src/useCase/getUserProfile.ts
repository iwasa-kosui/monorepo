import z from "zod";
import { Schema } from "../helper/schema.ts";
import type { UseCase } from "./useCase.ts";
import { Username } from "../domain/user/username.ts";
import {
  User,
  UserNotFoundError,
  type UserResolverByUsername,
} from "../domain/user/user.ts";
import { RA } from "@iwasa-kosui/result";
import {
  Actor,
  type ActorResolverByUserId,
  type ActorsResolverByFollowerId,
  type ActorsResolverByFollowingId,
} from "../domain/actor/actor.ts";

const Input = Schema.create(
  z.object({
    username: Username.zodType,
  })
);
type Input = z.infer<typeof Input.zodType>;

const Ok = Schema.create(
  z.object({
    user: User.zodType,
    following: z.array(Actor.zodType),
    followers: z.array(Actor.zodType),
  })
);
type Ok = z.infer<typeof Ok.zodType>;

type Err = UserNotFoundError;

export type FindUserUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  userResolverByUsername: UserResolverByUsername;
  actorResolverByUserId: ActorResolverByUserId;
  actorsResolverByFollowerId: ActorsResolverByFollowerId;
  actorsResolverByFollowingId: ActorsResolverByFollowingId;
}>;

const create = ({
  userResolverByUsername,
  actorResolverByUserId,
  actorsResolverByFollowerId,
  actorsResolverByFollowingId,
}: Deps): FindUserUseCase => {
  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.bind("user", async ({ username }) =>
        userResolverByUsername.resolve(username)
      ),
      RA.bind("user", ({ user, username }) =>
        user ? RA.ok(user) : RA.err(UserNotFoundError.create({ username }))
      ),
      RA.bind("actor", async ({ user }) => {
        return actorResolverByUserId.resolve(user.id);
      }),
      RA.bind("actor", ({ actor, username }) => {
        if (!actor) {
          return RA.err(UserNotFoundError.create({ username }));
        }
        return RA.ok(actor);
      }),
      RA.bind("following", async ({ actor }) => {
        return actorsResolverByFollowerId.resolve(actor.id);
      }),
      RA.bind("followers", async ({ actor }) => {
        return actorsResolverByFollowingId.resolve(actor.id);
      }),
    );

  return {
    run,
  };
};

export const GetUserProfileUseCase = {
  create,
} as const;
