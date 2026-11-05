import { type InboxContext } from '@fedify/fedify';
import { Follow, type Reject } from '@fedify/vocab';
import { getLogger } from '@logtape/logtape';

import type { ActorResolverByUri } from '../../../domain/actor/actor.ts';
import type { FollowResolver, UndoFollowingProcessedStore } from '../../../domain/follow/follow.ts';
import { Follow as AppFollow } from '../../../domain/follow/follow.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import type { InboxActorResolver } from '../inboxActorResolver.ts';

export type OnRejectDeps = Readonly<{
  inboxActorResolver: InboxActorResolver;
  actorResolverByUri: ActorResolverByUri;
  followResolver: FollowResolver;
  undoFollowingProcessedStore: UndoFollowingProcessedStore;
}>;

export const createOnReject = (deps: OnRejectDeps) => async (ctx: InboxContext<unknown>, activity: Reject) => {
  const actorId = activity.actorId;
  if (!actorId) {
    getLogger().warn('Reject activity has no actorId');
    return;
  }

  const actorUri = actorId.href;
  getLogger().info(`Received Reject activity from: ${actorUri}`);

  const object = await activity.getObject();
  if (!(object instanceof Follow)) {
    getLogger().info(`Reject activity object is not a Follow: ${actorUri}`);
    return;
  }

  const followActorId = object.actorId;
  if (!followActorId) {
    getLogger().warn('Reject activity Follow has no actorId');
    return;
  }

  const parsedFollowActor = ctx.parseUri(followActorId);
  if (parsedFollowActor == null || parsedFollowActor.type !== 'actor') {
    getLogger().info(`Reject activity Follow actor is not a local actor: ${followActorId.href}`);
    return;
  }

  const actorResult = await deps.inboxActorResolver.resolve(ctx, activity);
  if (!actorResult.ok) {
    getLogger().warn(`Failed to resolve actor: ${actorResult.err.message}`);
    return;
  }

  const { actorIdentity: rejectingActorIdentity } = actorResult.val;

  const followObjectId = object.objectId;
  if (followObjectId && followObjectId.href !== rejectingActorIdentity.uri) {
    getLogger().warn(
      `Reject activity Follow object ${followObjectId.href} does not match the sender: ${rejectingActorIdentity.uri}`,
    );
    return;
  }

  const followerUri = followActorId.href;

  const followerResult = await deps.actorResolverByUri.resolve(followerUri);
  if (!followerResult.ok) {
    throw new Error(`Failed to resolve the follower ${followerUri}: ${String(followerResult.err)}`);
  }
  if (!followerResult.val) {
    getLogger().warn(`Follower not found: ${followerUri}`);
    return;
  }

  const follower = followerResult.val;

  const rejectingActorResult = await deps.actorResolverByUri.resolve(rejectingActorIdentity.uri);
  if (!rejectingActorResult.ok) {
    throw new Error(
      `Failed to resolve the rejecting actor ${rejectingActorIdentity.uri}: ${String(rejectingActorResult.err)}`,
    );
  }
  if (!rejectingActorResult.val) {
    getLogger().warn(`Rejecting actor not found: ${rejectingActorIdentity.uri}`);
    return;
  }

  const rejectingActor = rejectingActorResult.val;

  const followResult = await deps.followResolver.resolve({
    followerId: follower.id,
    followingId: rejectingActor.id,
  });

  if (!followResult.ok) {
    throw new Error(
      `Failed to resolve the follow ${follower.id} -> ${rejectingActor.id}: ${String(followResult.err)}`,
    );
  }
  if (!followResult.val) {
    getLogger().info(`Follow not found for ${follower.id} -> ${rejectingActor.id}`);
    return;
  }

  const follow = followResult.val;
  const now = Instant.now();
  const event = AppFollow.undoFollow(follow, now);

  await deps.undoFollowingProcessedStore.store(event);
  getLogger().info(`Follow rejected: ${follower.id} -> ${rejectingActor.id}`);
};
