import type { UserResolverByUsername } from './../domain/user/user.ts';
import { RA } from "@iwasa-kosui/result";
import type { Actor, ActorResolverByUri, ActorResolverByUserId } from "../domain/actor/actor.ts";
import { RemoteActor, type RemoteActorCreatedStore } from "../domain/actor/remoteActor.ts";
import type { Username } from "../domain/user/username.ts";
import type { UseCase } from "./useCase.ts";
import { Follow, type FollowAcceptedStore, type FollowResolver } from "../domain/follow/follow.ts";
import { UserNotFoundError } from '../domain/user/user.ts';
import { Instant } from '../domain/instant/instant.ts';
import { upsertRemoteActor } from './helper/upsertRemoteActor.ts';
import type { LogoUriUpdatedStore } from '../domain/actor/updateLogoUri.ts';

type Input = Readonly<{
  username: Username
  follower: Pick<RemoteActor, 'uri' | 'inboxUrl' | 'url' | 'username'>
}>;

type Ok = Follow
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
  logoUriUpdatedStore: LogoUriUpdatedStore
  followedStore: FollowAcceptedStore
  followResolver: FollowResolver
}>;

const create = ({
  followedStore,
  followResolver,
  actorResolverByUri,
  userResolverByUsername,
  remoteActorCreatedStore,
  logoUriUpdatedStore,
  actorResolverByUserId
}: Deps): CreateUserUseCase => {
  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind('followingActor', ({ username }) =>
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
      RA.andBind('followerActor', ({ follower }) => upsertRemoteActor({
        now: Instant.now(),
        remoteActorCreatedStore,
        logoUriUpdatedStore,
      })(follower)),
      RA.andThen(({ username, followingActor, followerActor, follower }) => {
        if (!followingActor) {
          return RA.err(UserNotFoundError.create({ username }));
        }
        return RA.ok({
          followerActor,
          followingActor,
        });
      }),
      RA.andBind('existingFollow', ({ followerActor, followingActor }) =>
        followResolver.resolve({
          followerId: followerActor.id,
          followingId: followingActor.id,
        })
      ),
      RA.andThen(({ followerActor, followingActor, existingFollow }) => {
        if (existingFollow) {
          return RA.ok(existingFollow);
        }
        const followCreated = Follow.acceptFollow({
          followerId: followerActor.id,
          followingId: followingActor.id,
        }, Instant.now());
        return RA.flow(
          RA.ok(followCreated.aggregateState),
          RA.andThrough(() => followedStore.store(followCreated)),
        );
      }),
    )

  return { run };
}

export const AcceptFollowRequestUseCase = {
  create,
} as const;
