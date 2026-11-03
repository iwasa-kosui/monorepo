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
import type { UserResolver } from '../domain/user/user.ts';
import { resolveLocalActorWith, resolveUserWith } from '../useCase/helper/resolve.ts';
import type { WorkerRemoteActorAction } from './ports.ts';

export type WorkerRemoteActorActionInput = Parameters<WorkerRemoteActorAction>[0];

type WorkerRemoteActorActionsDeps = Readonly<{
  userResolver: UserResolver;
  actorResolverByUserId: ActorResolverByUserId;
  actorResolverById: ActorResolverById;
  followResolver: FollowResolver;
  followRequestedStore: FollowRequestedStore;
  undoFollowingProcessedStore: UndoFollowingProcessedStore;
}>;

const actionActors = async (
  deps: Pick<WorkerRemoteActorActionsDeps, 'actorResolverById' | 'actorResolverByUserId' | 'userResolver'>,
  input: WorkerRemoteActorActionInput,
) => {
  const user = await resolveUserWith(deps.userResolver)(input.userId);
  if (!user.ok) return RA.err({ message: user.err.message });
  const follower = await resolveLocalActorWith(deps.actorResolverByUserId)(input.userId);
  if (!follower.ok) return RA.err({ message: follower.err.message });
  const following = await deps.actorResolverById.resolve(input.actorId);
  if (!following.ok || following.val === undefined || following.val.type !== 'remote') {
    return RA.err({ message: `Remote actor not found: ${input.actorId}` });
  }
  return RA.ok({ user: user.val, follower: follower.val, following: following.val });
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
