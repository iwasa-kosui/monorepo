import { Block as ActivityPubBlock, Follow as ActivityPubFollow, Reject, Undo } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';

import type { ActorResolverById } from '../adaptor/d1/actor/actorResolverById.ts';
import type { ActorResolverByUserId } from '../domain/actor/actor.ts';
import type { ActorId } from '../domain/actor/actorId.ts';
import {
  Follow as DomainFollow,
  type FollowRequestedStore,
  type FollowResolver,
  type UndoFollowingProcessedStore,
} from '../domain/follow/follow.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { UserResolver } from '../domain/user/user.ts';
import type { CreateBlockUseCase } from '../useCase/createBlock.ts';
import type { DeleteBlockUseCase } from '../useCase/deleteBlock.ts';
import { resolveLocalActorWith, resolveUserWith } from '../useCase/helper/resolve.ts';
import type { WorkerBlockAction, WorkerRemoteActorAction } from './ports.ts';

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

type WorkerBlockActionsDeps = Readonly<{
  userResolver: UserResolver;
  actorResolverByUserId: ActorResolverByUserId;
  actorResolverById: ActorResolverById;
  followResolver: FollowResolver;
  undoFollowingProcessedStore: UndoFollowingProcessedStore;
  createBlockUseCase: CreateBlockUseCase;
  deleteBlockUseCase: DeleteBlockUseCase;
  unfollowRemoteActor: WorkerRemoteActorAction;
}>;

const blockActors = async (deps: WorkerBlockActionsDeps, input: WorkerRemoteActorActionInput) => {
  const user = await resolveUserWith(deps.userResolver)(input.userId);
  if (!user.ok) return RA.err({ message: user.err.message });
  const blocker = await resolveLocalActorWith(deps.actorResolverByUserId)(input.userId);
  if (!blocker.ok) return RA.err({ message: blocker.err.message });
  const target = await deps.actorResolverById.resolve(input.actorId);
  if (!target.ok || target.val === undefined) {
    return RA.err({ message: `Actor not found: ${input.actorId}` });
  }
  return RA.ok({ user: user.val, blocker: blocker.val, target: target.val });
};

export const createWorkerBlockActions = (
  deps: WorkerBlockActionsDeps,
): Readonly<{
  blockActor: WorkerBlockAction;
  unblockActor: WorkerBlockAction;
}> => {
  const hasFollow = async (followerId: ActorId, followingId: ActorId) => {
    const follow = await deps.followResolver.resolve({ followerId, followingId });
    return follow.ok && follow.val !== undefined;
  };
  const removeFollow = (followerId: ActorId, followingId: ActorId) =>
    deps.undoFollowingProcessedStore.store(DomainFollow.undoFollow({ followerId, followingId }, Instant.now()));

  return {
    blockActor: async (input) => {
      const actors = await blockActors(deps, input);
      if (!actors.ok) return actors;
      const { user, blocker, target } = actors.val;
      const created = await deps.createBlockUseCase.run({ userId: input.userId, blockedActorId: target.id });
      if (!created.ok) {
        return created.err.type === 'AlreadyBlockedError' ? RA.ok(undefined) : RA.err({ message: created.err.message });
      }
      if (await hasFollow(blocker.id, target.id)) {
        const unfollowed = target.type === 'remote'
          ? await deps.unfollowRemoteActor(input)
          : await removeFollow(blocker.id, target.id);
        if (!unfollowed.ok) return RA.err({ message: String(unfollowed.err) });
      }
      const blockerUri = input.ctx.getActorUri(user.username);
      if (await hasFollow(target.id, blocker.id)) {
        const removed = await removeFollow(target.id, blocker.id);
        if (!removed.ok) return RA.err({ message: String(removed.err) });
        if (target.type === 'remote') {
          await input.ctx.sendActivity(
            { username: user.username },
            { id: new URL(target.uri), inboxId: new URL(target.inboxUrl) },
            new Reject({
              id: new URL(`${blocker.uri}#reject-follows/${target.id}`),
              actor: blockerUri,
              object: new ActivityPubFollow({ actor: new URL(target.uri), object: blockerUri }),
              to: new URL(target.uri),
            }),
          );
        }
      }
      if (target.type === 'remote') {
        await input.ctx.sendActivity(
          { username: user.username },
          { id: new URL(target.uri), inboxId: new URL(target.inboxUrl) },
          new ActivityPubBlock({
            id: new URL(`${blocker.uri}#blocks/${target.id}`),
            actor: blockerUri,
            object: new URL(target.uri),
            to: new URL(target.uri),
          }),
        );
      }
      return RA.ok(undefined);
    },
    unblockActor: async (input) => {
      const actors = await blockActors(deps, input);
      if (!actors.ok) return actors;
      const { user, blocker, target } = actors.val;
      const deleted = await deps.deleteBlockUseCase.run({ userId: input.userId, blockedActorId: target.id });
      if (!deleted.ok) {
        return deleted.err.type === 'NotBlockedError' ? RA.ok(undefined) : RA.err({ message: deleted.err.message });
      }
      if (target.type === 'remote') {
        const blockerUri = input.ctx.getActorUri(user.username);
        await input.ctx.sendActivity(
          { username: user.username },
          { id: new URL(target.uri), inboxId: new URL(target.inboxUrl) },
          new Undo({
            id: new URL(`${blocker.uri}#undo-blocks/${target.id}`),
            actor: blockerUri,
            object: new ActivityPubBlock({
              id: new URL(`${blocker.uri}#blocks/${target.id}`),
              actor: blockerUri,
              object: new URL(target.uri),
            }),
            to: new URL(target.uri),
          }),
        );
      }
      return RA.ok(undefined);
    },
  };
};
