import { RA } from "@iwasa-kosui/result";
import type { ActorResolverByUserId } from "../domain/actor/actor.ts";
import type { ActorId } from "../domain/actor/actorId.ts";
import type { UseCase } from "./useCase.ts";
import {
  AlreadyUnfollowedError,
  Follow,
  type FollowAggregateId,
  type FollowResolver,
  type UndoFollowingProcessedStore,
} from "../domain/follow/follow.ts";
import { Instant } from "../domain/instant/instant.ts";
import { resolveLocalActorWith } from "./helper/resolve.ts";
import type { UserId } from "../domain/user/userId.ts";
import { singleton } from "../helper/singleton.ts";
import { PgActorResolverByUserId } from "../adaptor/pg/actor/actorResolverByUserId.ts";
import { PgFollowResolver } from "../adaptor/pg/follow/followResolver.ts";
import { PgUnfollowedStore } from "../adaptor/pg/follow/undoFollowingProcessedStore.ts";
import { UserNotFoundError } from "../domain/user/user.ts";

type Input = Readonly<{
  followerUserId: UserId;
  followingActorId: ActorId;
}>;

type Ok = FollowAggregateId;
type Err = UserNotFoundError | AlreadyUnfollowedError;

export type UnfollowUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  actorResolverByUserId: ActorResolverByUserId;
  unfollowedStore: UndoFollowingProcessedStore;
  followResolver: FollowResolver;
}>;

const create = ({
  unfollowedStore,
  followResolver,
  actorResolverByUserId,
}: Deps): UnfollowUseCase => {
  const resolveLocalActor = resolveLocalActorWith(actorResolverByUserId);

  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind("followerActor", ({ followerUserId }) =>
        resolveLocalActor(followerUserId)
      ),
      RA.andBind("existingFollow", ({ followerActor, followingActorId }) =>
        followResolver.resolve({
          followerId: followerActor.id,
          followingId: followingActorId,
        })
      ),
      RA.andThen(({ followerActor, followingActorId, existingFollow }) => {
        if (!existingFollow) {
          return RA.err(AlreadyUnfollowedError.create({
            followerId: followerActor.id,
            followingId: followingActorId,
          }));
        }
        const unfollowed = Follow.undoFollow(
          {
            followerId: followerActor.id,
            followingId: followingActorId,
          },
          Instant.now(),
        );
        return RA.flow(
          RA.ok(unfollowed.aggregateId),
          RA.andThrough(() => unfollowedStore.store(unfollowed))
        );
      })
    );

  return { run };
};

export const UnfollowUseCase = {
  create,
  getInstance: singleton(() =>
    create({
      actorResolverByUserId: PgActorResolverByUserId.getInstance(),
      unfollowedStore: PgUnfollowedStore.getInstance(),
      followResolver: PgFollowResolver.getInstance(),
    })
  ),
} as const;
