import z from "zod/v4";
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
import {
  resolveLocalActorWith,
  resolveUserByUsernameWith,
} from "./helper/resolve.ts";
import type { PostsResolverByActorIds, PostWithAuthor } from "../domain/post/post.ts";
import { singleton } from "../helper/singleton.ts";
import { PgUserResolverByUsername } from "../adaptor/pg/user/userResolverByUsername.ts";
import { PgActorResolverByUserId } from "../adaptor/pg/actor/actorResolverByUserId.ts";
import { PgActorResolverByFollowingId } from "../adaptor/pg/actor/followsResolverByFollowingId.ts";
import { PgActorResolverByFollowerId } from "../adaptor/pg/actor/followsResolverByFollowerId.ts";
import { PgPostsResolverByActorIds } from "../adaptor/pg/post/postsResolverByActorIds.ts";

const Input = Schema.create(
  z.object({
    username: Username.zodType,
  })
);
type Input = z.infer<typeof Input.zodType>;

type Ok = Readonly<{
  user: User;
  actor: Actor;
  following: ReadonlyArray<Actor>;
  followers: ReadonlyArray<Actor>;
  posts: ReadonlyArray<PostWithAuthor>;
}>;

type Err = UserNotFoundError;

export type GetUserProfileUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  userResolverByUsername: UserResolverByUsername;
  actorResolverByUserId: ActorResolverByUserId;
  actorsResolverByFollowerId: ActorsResolverByFollowerId;
  actorsResolverByFollowingId: ActorsResolverByFollowingId;
  postsResolverByActorIds: PostsResolverByActorIds;
}>;

const create = ({
  userResolverByUsername,
  actorResolverByUserId,
  actorsResolverByFollowerId,
  actorsResolverByFollowingId,
  postsResolverByActorIds,
}: Deps): GetUserProfileUseCase => {
  const resolveLocalActor = resolveLocalActorWith(actorResolverByUserId);
  const resolveUserByUsername = resolveUserByUsernameWith(
    userResolverByUsername
  );

  const run = (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind("user", ({ username }) => resolveUserByUsername(username)),
      RA.andBind("actor", ({ user }) => resolveLocalActor(user.id)),
      RA.andBind("following", ({ actor }) =>
        actorsResolverByFollowerId.resolve(actor.id)
      ),
      RA.andBind("followers", ({ actor }) =>
        actorsResolverByFollowingId.resolve(actor.id)
      ),
      RA.andBind("posts", ({ actor }) =>
        postsResolverByActorIds.resolve({ actorIds: [actor.id], currentActorId: undefined, createdAt: undefined })
      )
    );

  return {
    run,
  };
};

export const GetUserProfileUseCase = {
  create,
  getInstance: singleton(() =>
    create({
      userResolverByUsername: PgUserResolverByUsername.getInstance(),
      actorResolverByUserId: PgActorResolverByUserId.getInstance(),
      actorsResolverByFollowingId: PgActorResolverByFollowingId.getInstance(),
      actorsResolverByFollowerId: PgActorResolverByFollowerId.getInstance(),
      postsResolverByActorIds: PgPostsResolverByActorIds.getInstance(),
    })
  )
} as const;
