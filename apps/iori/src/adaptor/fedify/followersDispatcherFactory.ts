import { type Context, type Recipient } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import type { ActorResolverByUserId, ActorsResolverByFollowingId } from '../../domain/actor/actor.ts';
import type { UserResolverByUsername } from '../../domain/user/user.ts';
import { Username } from '../../domain/user/username.ts';

export type FollowersDispatcherDeps = Readonly<{
  userResolverByUsername: UserResolverByUsername;
  actorResolverByUserId: ActorResolverByUserId;
  actorsResolverByFollowingId: ActorsResolverByFollowingId;
}>;

const resolveFollowers = (
  { userResolverByUsername, actorResolverByUserId, actorsResolverByFollowingId }: FollowersDispatcherDeps,
  identifier: string,
) =>
  RA.flow(
    RA.ok(identifier),
    RA.andThen(Username.parse),
    RA.andThen((username) => userResolverByUsername.resolve(username)),
    RA.andThen((user) =>
      user === undefined ? RA.err(new Error(`User not found: ${identifier}`)) : actorResolverByUserId.resolve(user.id)
    ),
    RA.andThen((actor) =>
      actor === undefined
        ? RA.err(new Error(`Actor not found: ${identifier}`))
        : actorsResolverByFollowingId.resolve(actor.id)
    ),
  );

export const createFollowersDispatcher = (deps: FollowersDispatcherDeps) => ({
  dispatch: (_ctx: Context<unknown>, identifier: string) =>
    RA.flow(
      resolveFollowers(deps, identifier),
      RA.match({
        ok: (followers) => ({
          items: followers.map((actor): Recipient => ({ id: new URL(actor.uri), inboxId: new URL(actor.inboxUrl) })),
        }),
        err: (error) => {
          getLogger().warn(`Failed to resolve followers for federation: ${identifier} - ${error}`);
          return { items: [] };
        },
      }),
    ),
});

export const createFollowersCounter = (deps: FollowersDispatcherDeps) => (_ctx: Context<unknown>, identifier: string) =>
  RA.flow(
    resolveFollowers(deps, identifier),
    RA.match({
      ok: (followers) => followers.length,
      err: (error) => {
        getLogger().warn(`Failed to resolve follower count for federation: ${identifier} - ${error}`);
        return 0;
      },
    }),
  );
