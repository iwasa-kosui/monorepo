import { Follow as ActivityPubFollow, Undo } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';

import type { ActorResolverById } from '../adaptor/d1/actor/actorResolverById.ts';
import type { ActorResolverByUserId } from '../domain/actor/actor.ts';
import {
  Follow as DomainFollow,
  type FollowRequestedStore,
  type FollowResolver,
  type UndoFollowingProcessedStore,
} from '../domain/follow/follow.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { SessionResolver, SessionWithUserAndActorResolver } from '../domain/session/session.ts';
import type { UserResolver } from '../domain/user/user.ts';
import {
  composeSessionWithUserAndActorResolver,
  resolveSessionWithUserAndActorWith,
} from '../useCase/helper/resolve.ts';
import type { WorkerRemoteActorAction } from './ports.ts';

export type WorkerRemoteActorActionInput = Parameters<WorkerRemoteActorAction>[0];

type WorkerRemoteActorActionsDeps = Readonly<{
  sessionResolver: SessionResolver;
  userResolver: UserResolver;
  actorResolverByUserId: ActorResolverByUserId;
  sessionWithUserAndActorResolver?: SessionWithUserAndActorResolver;
  actorResolverById: ActorResolverById;
  followResolver: FollowResolver;
  followRequestedStore: FollowRequestedStore;
  undoFollowingProcessedStore: UndoFollowingProcessedStore;
}>;

const actionActors = async (
  deps: Pick<
    WorkerRemoteActorActionsDeps,
    | 'actorResolverById'
    | 'actorResolverByUserId'
    | 'sessionResolver'
    | 'sessionWithUserAndActorResolver'
    | 'userResolver'
  >,
  input: WorkerRemoteActorActionInput,
) => {
  const authenticated = await resolveSessionWithUserAndActorWith(
    deps.sessionWithUserAndActorResolver
      ?? composeSessionWithUserAndActorResolver(deps.sessionResolver, deps.userResolver, deps.actorResolverByUserId),
    Instant.now(),
  )(input.sessionId);
  if (!authenticated.ok) return RA.err({ message: authenticated.err.message });
  const following = await deps.actorResolverById.resolve(input.actorId);
  if (!following.ok || following.val === undefined || following.val.type !== 'remote') {
    return RA.err({ message: `Remote actor not found: ${input.actorId}` });
  }
  return RA.ok({ user: authenticated.val.user, follower: authenticated.val.actor, following: following.val });
};

export const createWorkerRemoteActorActions = (
  deps: WorkerRemoteActorActionsDeps,
): Readonly<{
  followRemoteActor: WorkerRemoteActorAction;
  unfollowRemoteActor: WorkerRemoteActorAction;
}> => ({
  followRemoteActor: async (input) => {
    const actors = await actionActors(deps, input);
    if (!actors.ok) return actors;
    const { user, follower, following } = actors.val;
    const requested = DomainFollow.requestFollow({
      followerId: follower.id,
      followingId: following.id,
    }, Instant.now());
    const stored = await deps.followRequestedStore.store(requested);
    if (!stored.ok) return RA.err({ message: String(stored.err) });
    await input.ctx.sendActivity(
      { username: user.username },
      { id: new URL(following.uri), inboxId: new URL(following.inboxUrl) },
      new ActivityPubFollow({
        id: new URL(`${follower.uri}#follows/${following.id}`),
        actor: input.ctx.getActorUri(user.username),
        object: new URL(following.uri),
        to: new URL(following.uri),
      }),
    );
    return RA.ok(undefined);
  },
  unfollowRemoteActor: async (input) => {
    const actors = await actionActors(deps, input);
    if (!actors.ok) return actors;
    const { user, follower, following } = actors.val;
    const existing = await deps.followResolver.resolve({
      followerId: follower.id,
      followingId: following.id,
    });
    if (!existing.ok || existing.val === undefined) {
      return RA.err({ message: `Follow not found: ${follower.id} -> ${following.id}` });
    }
    const unfollowed = DomainFollow.undoFollow({
      followerId: follower.id,
      followingId: following.id,
    }, Instant.now());
    const stored = await deps.undoFollowingProcessedStore.store(unfollowed);
    if (!stored.ok) return RA.err({ message: String(stored.err) });
    const followActivityId = new URL(`${follower.uri}#follows/${following.id}`);
    await input.ctx.sendActivity(
      { username: user.username },
      { id: new URL(following.uri), inboxId: new URL(following.inboxUrl) },
      new Undo({
        id: new URL(`${follower.uri}#undo-follows/${following.id}`),
        actor: input.ctx.getActorUri(user.username),
        object: new ActivityPubFollow({
          id: followActivityId,
          actor: input.ctx.getActorUri(user.username),
          object: new URL(following.uri),
        }),
        to: new URL(following.uri),
      }),
    );
    return RA.ok(undefined);
  },
});
