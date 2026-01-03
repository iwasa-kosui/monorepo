import type { UserResolverByUsername } from './../domain/user/user.ts';
import { RA } from "@iwasa-kosui/result";
import type { Actor, ActorResolverByUri, ActorResolverByUserId } from "../domain/actor/actor.ts";
import { RemoteActor, type RemoteActorCreatedStore } from "../domain/actor/remoteActor.ts";
import type { Username } from "../domain/user/username.ts";
import type { UseCase } from "./useCase.ts";
import { Follow, type FollowAggregateId, type FollowedStore, type FollowResolver, type UnfollowedStore } from "../domain/follow/follow.ts";
import { UserNotFoundError } from '../domain/user/user.ts';
import { Instant } from '../domain/instant/instant.ts';

type Input = Readonly<{
  username: Username
  follower: Pick<Actor, 'uri'>
}>;

type Ok = FollowAggregateId | undefined
type Err = UserNotFoundError

type CreateUserUseCase = UseCase<
  Input,
  Ok,
  Err
>;

type Deps = Readonly<{
  actorResolverByUri: ActorResolverByUri
  actorResolverByUserId: ActorResolverByUserId
  userResolverByUsername: UserResolverByUsername
  remoteActorCreatedStore: RemoteActorCreatedStore;
  unfollowedStore: UnfollowedStore
  followResolver: FollowResolver
}>;

const create = ({
  unfollowedStore,
  followResolver,
  actorResolverByUri,
  userResolverByUsername,
  remoteActorCreatedStore,
  actorResolverByUserId
}: Deps): CreateUserUseCase => {
  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.bind('followingActor', ({ username }) =>
        RA.flow(
          userResolverByUsername.resolve(username),
          RA.andThen((user): RA<Actor | undefined, UserNotFoundError> => {
            if (!user) {
              return RA.err(UserNotFoundError.create({ username }))
            }
            return actorResolverByUserId.resolve(user.id);
          }),
          RA.andThen((actor) => {
            if (!actor) {
              return RA.err(UserNotFoundError.create({ username }))
            }
            return RA.ok(actor);
          })
        ),
      ),
      RA.bind('existingFollowerActor', ({ follower }) =>
        actorResolverByUri.resolve(follower.uri)
      ),
      RA.andThen(({ username, followingActor, existingFollowerActor, follower }) => {
        if (!followingActor) {
          return RA.err(UserNotFoundError.create({ username }));
        }
        return RA.ok({
          followerActor: existingFollowerActor,
          followingActor,
        });
      }),
      RA.andThen(({ followerActor, followingActor }) => {
        if (!followerActor) {
          return RA.ok(undefined);
        }
        return RA.flow(
          RA.ok({ followerActor, followingActor }),
          RA.bind('existingFollow', ({ followerActor, followingActor }) => {
            return followResolver.resolve({
              followerId: followerActor.id,
              followingId: followingActor.id,
            });
          }),
          RA.andThen(({ followerActor, followingActor, existingFollow }) => {
            if (!existingFollow) {
              return RA.ok({
                followingId: followingActor.id,
                followerId: followerActor.id,
              });
            }
            const unfollowed = Follow.unfollow({
              followerId: followerActor.id,
              followingId: followingActor.id,
            }, Instant.now());
            return RA.flow(
              RA.ok(unfollowed.aggregateId),
              RA.andThrough(() => unfollowedStore.store(unfollowed)),
            );
          }),
        )
      })
    )

  return { run };
}

export const AcceptUnfollowUseCase = {
  create,
} as const;
