import { Result } from '@iwasa-kosui/result';
import z from 'zod/v4';

import { PgActorResolverByUserId } from '../adaptor/pg/actor/actorResolverByUserId.ts';
import { PgActorResolverByFollowerId } from '../adaptor/pg/actor/followsResolverByFollowerId.ts';
import { PgActorResolverByFollowingId } from '../adaptor/pg/actor/followsResolverByFollowingId.ts';
import { PgPostsResolverByActorIds } from '../adaptor/pg/post/postsResolverByActorIds.ts';
import { PgUserResolverByUsername } from '../adaptor/pg/user/userResolverByUsername.ts';
import {
  Actor,
  type ActorResolverByUserId,
  type ActorsResolverByFollowerId,
  type ActorsResolverByFollowingId,
} from '../domain/actor/actor.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { PostsResolverByActorIds, PostWithAuthor } from '../domain/post/post.ts';
import { User, UserNotFoundError, type UserResolverByUsername } from '../domain/user/user.ts';
import { Username } from '../domain/user/username.ts';
import { Schema } from '../helper/schema.ts';
import { singleton } from '../helper/singleton.ts';
import { resolveLocalActorWith, resolveUserByUsernameWith } from './helper/resolve.ts';
import type { UseCase } from './useCase.ts';

const Input = Schema.create(
  z.object({
    username: Username.zodType,
    createdAt: z.optional(Instant.zodType),
  }),
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

export type GetUserPostsUseCase = UseCase<Input, Ok, Err>;

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
}: Deps): GetUserPostsUseCase => {
  const resolveLocalActor = resolveLocalActorWith(actorResolverByUserId);
  const resolveUserByUsername = resolveUserByUsernameWith(userResolverByUsername);

  const run = async (input: Input): Promise<Result<Ok, Err>> => {
    const { username, createdAt } = input;

    const userResult = await resolveUserByUsername(username);
    if (!userResult.ok) {
      return userResult;
    }
    const user = userResult.val;

    const actorResult = await resolveLocalActor(user.id);
    if (!actorResult.ok) {
      return actorResult;
    }
    const actor = actorResult.val;

    const [followingResult, followersResult, postsResult] = await Promise.all([
      actorsResolverByFollowerId.resolve(actor.id),
      actorsResolverByFollowingId.resolve(actor.id),
      postsResolverByActorIds.resolve({
        actorIds: [actor.id],
        currentActorId: undefined,
        createdAt,
      }),
    ]);

    if (!followingResult.ok) {
      return followingResult;
    }
    if (!followersResult.ok) {
      return followersResult;
    }
    if (!postsResult.ok) {
      return postsResult;
    }

    return Result.ok({
      user,
      actor,
      following: followingResult.val,
      followers: followersResult.val,
      posts: postsResult.val,
    });
  };

  return {
    run,
  };
};

export const GetUserPostsUseCase = {
  create,
  getInstance: singleton(() =>
    create({
      userResolverByUsername: PgUserResolverByUsername.getInstance(),
      actorResolverByUserId: PgActorResolverByUserId.getInstance(),
      actorsResolverByFollowingId: PgActorResolverByFollowingId.getInstance(),
      actorsResolverByFollowerId: PgActorResolverByFollowerId.getInstance(),
      postsResolverByActorIds: PgPostsResolverByActorIds.getInstance(),
    })
  ),
} as const;
