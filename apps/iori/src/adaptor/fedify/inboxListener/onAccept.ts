import { type InboxContext } from '@fedify/fedify';
import { type Accept, Follow } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import type { ActorResolverByUri } from '../../../domain/actor/actor.ts';
import type { FollowAcceptedStore, FollowResolver } from '../../../domain/follow/follow.ts';
import { Follow as AppFollow } from '../../../domain/follow/follow.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { Relay, type RelayResolverByActorUri } from '../../../domain/relay/relay.ts';
import type { AcceptRelaySubscriptionUseCase } from '../../../useCase/acceptRelaySubscription.ts';
import type { InboxActorResolver } from '../inboxActorResolver.ts';
import { RELAY_FOLLOW_ID_HASH_PREFIX } from '../relayFollow.ts';
import { INSTANCE_ACTOR_IDENTIFIER } from '../sharedKeyDispatcher.ts';

export type OnAcceptDeps = Readonly<{
  origin: string;
  relayResolverByActorUri: RelayResolverByActorUri;
  inboxActorResolver: InboxActorResolver;
  acceptRelaySubscriptionUseCase: AcceptRelaySubscriptionUseCase;
  actorResolverByUri: ActorResolverByUri;
  followResolver: FollowResolver;
  followAcceptedStore: FollowAcceptedStore;
}>;

export const createOnAccept = (deps: OnAcceptDeps) => async (ctx: InboxContext<unknown>, activity: Accept) => {
  const actorId = activity.actorId;
  if (!actorId) {
    getLogger().warn('Accept activity has no actorId');
    return;
  }

  const actorUri = actorId.href;
  getLogger().info(`Received Accept activity from: ${actorUri}`);

  const acceptRelaySubscription = () =>
    RA.flow(
      deps.acceptRelaySubscriptionUseCase.run({ relayActorUri: actorUri }),
      RA.match({
        ok: (relay) => {
          getLogger().info(`Relay subscription accepted: ${relay.actorUri}`);
        },
        err: (err) => {
          getLogger().warn(`Failed to accept relay subscription: ${actorUri} - ${JSON.stringify(err)}`);
        },
      }),
    );

  const objectId = activity.objectId;
  if (
    objectId && objectId.origin === new URL(deps.origin).origin
    && objectId.hash.startsWith(RELAY_FOLLOW_ID_HASH_PREFIX)
  ) {
    const relayResult = await deps.relayResolverByActorUri.resolve({ actorUri });
    if (relayResult.ok && relayResult.val?.status === Relay.Status.Pending) {
      getLogger().info(`Processing relay subscription Accept from: ${actorUri}`);
      return acceptRelaySubscription();
    }
    if (relayResult.ok && relayResult.val?.status === Relay.Status.Accepted) {
      getLogger().info(`Relay subscription already accepted: ${actorUri}`);
      return;
    }
  }

  // Get the object that was accepted
  // 確定する行は送り主へのフォローに限られるので、別 origin の埋め込みを信頼してよい
  const object = await activity.getObject({ crossOrigin: 'trust' });
  if (!(object instanceof Follow)) {
    getLogger().info(`Accept activity object is not a Follow: ${actorUri}`);
    return;
  }

  // Check if this is an Accept for a relay subscription (from instance actor)
  const followActorId = object.actorId;
  if (!followActorId) {
    getLogger().warn('Accept activity Follow has no actorId');
    return;
  }

  const instanceActorUri = ctx.getActorUri(INSTANCE_ACTOR_IDENTIFIER);
  if (followActorId.href === instanceActorUri.href) {
    // This is an Accept for a relay subscription
    getLogger().info(`Processing relay subscription Accept from: ${actorUri}`);

    return acceptRelaySubscription();
  }

  // This is an Accept for a regular follow request
  getLogger().info(`Processing follow Accept from: ${actorUri}`);

  const actorResult = await deps.inboxActorResolver.resolve(ctx, activity);
  if (!actorResult.ok) {
    getLogger().warn(`Failed to resolve actor: ${actorResult.err.message}`);
    return;
  }

  const { actorIdentity: acceptingActorIdentity } = actorResult.val;

  // Find the pending follow request
  // Get the follower from the Follow object
  const followerUri = followActorId.href;

  const followerResult = await deps.actorResolverByUri.resolve(followerUri);
  if (!followerResult.ok || !followerResult.val) {
    getLogger().warn(`Failed to resolve follower: ${followerUri}`);
    return;
  }

  const follower = followerResult.val;

  // Resolve the accepting actor from our database
  const acceptingActorResult = await deps.actorResolverByUri.resolve(acceptingActorIdentity.uri);
  if (!acceptingActorResult.ok || !acceptingActorResult.val) {
    getLogger().warn(`Failed to resolve accepting actor: ${acceptingActorIdentity.uri}`);
    return;
  }

  const acceptingActor = acceptingActorResult.val;

  // Check if follow exists
  const followResult = await deps.followResolver.resolve({
    followerId: follower.id,
    followingId: acceptingActor.id,
  });

  if (!followResult.ok || !followResult.val) {
    getLogger().info(`Follow not found for ${follower.id} -> ${acceptingActor.id}`);
    return;
  }

  const follow = followResult.val;
  const now = Instant.now();
  const event = AppFollow.acceptFollow(follow, now);

  await deps.followAcceptedStore.store(event);
  getLogger().info(`Follow accepted: ${follower.id} -> ${acceptingActor.id}`);
};
