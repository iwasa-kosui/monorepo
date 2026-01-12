import { resolveUserByUsernameWith } from "./helper/resolve.ts";
import type { UserResolverByUsername } from "./../domain/user/user.ts";
import { RA } from "@iwasa-kosui/result";
import {
  ActorNotFoundError,
  type Actor,
  type ActorResolverByUri,
  type ActorResolverByUserId,
} from "../domain/actor/actor.ts";
import {
  RemoteActor,
  type RemoteActorCreatedStore,
} from "../domain/actor/remoteActor.ts";
import type { Username } from "../domain/user/username.ts";
import type { UseCase } from "./useCase.ts";
import {
  AlreadyUnfollowedError,
  Follow,
  type FollowAggregateId,
  type FollowResolver,
  type UndoFollowingProcessedStore,
} from "../domain/follow/follow.ts";
import { UserNotFoundError } from "../domain/user/user.ts";
import { Instant } from "../domain/instant/instant.ts";
import { resolveLocalActorWith } from "./helper/resolve.ts";

type Input = Readonly<{
  username: Username;
  follower: Pick<Actor, "uri">;
}>;

type Ok = FollowAggregateId | undefined;
type Err = UserNotFoundError | ActorNotFoundError | AlreadyUnfollowedError

type CreateUserUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  actorResolverByUri: ActorResolverByUri;
  actorResolverByUserId: ActorResolverByUserId;
  userResolverByUsername: UserResolverByUsername;
  remoteActorCreatedStore: RemoteActorCreatedStore;
  unfollowedStore: UndoFollowingProcessedStore;
  followResolver: FollowResolver;
}>;

const create = ({
  unfollowedStore,
  followResolver,
  actorResolverByUri,
  userResolverByUsername,
  remoteActorCreatedStore,
  actorResolverByUserId,
}: Deps): CreateUserUseCase => {
  const now = Instant.now();
  const resolveUserByUsername = resolveUserByUsernameWith(
    userResolverByUsername
  );
  const resolveLocalActor = resolveLocalActorWith(actorResolverByUserId);
  const resolveActorByUri = (uri: string): RA<Actor, ActorNotFoundError> =>
    RA.flow(
      actorResolverByUri.resolve(uri),
      RA.andThen((actor) =>
        actor ? RA.ok(actor) : RA.err(ActorNotFoundError.create(uri))
      )
    );

  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind("followingActor", ({ username }) =>
        RA.flow(
          resolveUserByUsername(username),
          RA.andThen((user) => resolveLocalActor(user.id))
        )
      ),
      RA.andBind("followerActor", ({ follower }) =>
        resolveActorByUri(follower.uri)
      ),
      RA.andBind("existingFollow", ({ followerActor, followingActor }) =>
        followResolver.resolve({
          followerId: followerActor.id,
          followingId: followingActor.id,
        })
      ),
      RA.andThen(({ followerActor, followingActor, existingFollow }) => {
        if (!existingFollow) {
          return RA.err(AlreadyUnfollowedError.create({
            followerId: followerActor.id,
            followingId: followingActor.id,
          }));
        }
        const unfollowed = Follow.undoFollow(
          {
            followerId: followerActor.id,
            followingId: followingActor.id,
          },
          now,
        );
        return RA.flow(
          RA.ok(unfollowed.aggregateId),
          RA.andThrough(() => unfollowedStore.store(unfollowed))
        );
      })
    );

  return { run };
};

export const AcceptUnfollowUseCase = {
  create,
} as const;
