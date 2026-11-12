import { RA } from '@iwasa-kosui/result';

import {
  type Actor,
  ActorNotFoundError,
  type ActorResolverByUri,
  type ActorResolverByUserId,
} from '../domain/actor/actor.ts';
import { Follow, type FollowResolver, type UndoFollowingProcessedStore } from '../domain/follow/follow.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { UserNotFoundError } from '../domain/user/user.ts';
import type { Username } from '../domain/user/username.ts';
import type { UserResolverByUsername } from './../domain/user/user.ts';
import { resolveLocalActorWith, resolveUserByUsernameWith } from './helper/resolve.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  username: Username;
  blocker: Pick<Actor, 'uri'>;
}>;

type Ok = void;
type Err = UserNotFoundError | ActorNotFoundError;

export type AcceptBlockUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  actorResolverByUri: ActorResolverByUri;
  actorResolverByUserId: ActorResolverByUserId;
  userResolverByUsername: UserResolverByUsername;
  unfollowedStore: UndoFollowingProcessedStore;
  followResolver: FollowResolver;
}>;

const create = ({
  unfollowedStore,
  followResolver,
  actorResolverByUri,
  userResolverByUsername,
  actorResolverByUserId,
}: Deps): AcceptBlockUseCase => {
  const resolveUserByUsername = resolveUserByUsernameWith(userResolverByUsername);
  const resolveLocalActor = resolveLocalActorWith(actorResolverByUserId);

  const run = async (input: Input) => {
    const now = Instant.now();
    return RA.flow(
      RA.ok(input),
      RA.andBind('blockedActor', ({ username }) =>
        RA.flow(
          resolveUserByUsername(username),
          RA.andThen((user) => resolveLocalActor(user.id)),
        )),
      RA.andBind('blockerActor', ({ blocker }) =>
        RA.flow(
          actorResolverByUri.resolve(blocker.uri),
          RA.andThen((actor) => actor ? RA.ok(actor) : RA.err(ActorNotFoundError.create(blocker.uri))),
        )),
      RA.andThen(async ({ blockedActor, blockerActor }) => {
        for (
          const pair of [
            { followerId: blockerActor.id, followingId: blockedActor.id },
            { followerId: blockedActor.id, followingId: blockerActor.id },
          ]
        ) {
          const existing = await followResolver.resolve(pair);
          if (!existing.ok) return existing;
          if (existing.val === undefined) continue;
          const stored = await unfollowedStore.store(Follow.undoFollow(pair, now));
          if (!stored.ok) return stored;
        }
        return RA.ok(undefined);
      }),
    );
  };

  return { run };
};

export const AcceptBlockUseCase = {
  create,
} as const;
