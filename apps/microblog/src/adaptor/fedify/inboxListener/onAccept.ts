import { type Accept, Follow, type InboxContext } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import { Follow as AppFollow } from '../../../domain/follow/follow.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { AcceptRelaySubscriptionUseCase } from '../../../useCase/acceptRelaySubscription.ts';
import { PgActorResolverByUri } from '../../pg/actor/actorResolverByUri.ts';
import { PgFollowedStore } from '../../pg/follow/followAcceptedStore.ts';
import { PgFollowResolver } from '../../pg/follow/followResolver.ts';
import { PgRelayResolverByActorUri } from '../../pg/relay/relayResolverByActorUri.ts';
import { PgRelaySubscriptionAcceptedStore } from '../../pg/relay/relaySubscriptionAcceptedStore.ts';
import { InboxActorResolver } from '../inboxActorResolver.ts';
import { INSTANCE_ACTOR_IDENTIFIER } from '../sharedKeyDispatcher.ts';

export const onAccept = async (ctx: InboxContext<unknown>, activity: Accept) => {
  const actorId = activity.actorId;
  if (!actorId) {
    getLogger().warn('Accept activity has no actorId');
    return;
  }

  const actorUri = actorId.href;
  getLogger().info(`Received Accept activity from: ${actorUri}`);

  // Get the object that was accepted
  const object = await activity.getObject();
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

    const useCase = AcceptRelaySubscriptionUseCase.create({
      relayResolverByActorUri: PgRelayResolverByActorUri.getInstance(),
      relaySubscriptionAcceptedStore: PgRelaySubscriptionAcceptedStore.getInstance(),
    });

    return RA.flow(
      useCase.run({ relayActorUri: actorUri }),
      RA.match({
        ok: (relay) => {
          getLogger().info(`Relay subscription accepted: ${relay.actorUri}`);
        },
        err: (err) => {
          getLogger().warn(`Failed to accept relay subscription: ${actorUri} - ${JSON.stringify(err)}`);
        },
      }),
    );
  }

  // This is an Accept for a regular follow request
  getLogger().info(`Processing follow Accept from: ${actorUri}`);

  const actorResult = await InboxActorResolver.getInstance().resolve(ctx, activity);
  if (!actorResult.ok) {
    getLogger().warn(`Failed to resolve actor: ${actorResult.err.message}`);
    return;
  }

  const { actorIdentity: acceptingActorIdentity } = actorResult.val;

  // Find the pending follow request
  const followResolver = PgFollowResolver.getInstance();
  const followAcceptedStore = PgFollowedStore.getInstance();

  // Get the follower from the Follow object
  const localActorResolver = PgActorResolverByUri.getInstance();
  const followerUri = followActorId.href;

  const followerResult = await localActorResolver.resolve(followerUri);
  if (!followerResult.ok || !followerResult.val) {
    getLogger().warn(`Failed to resolve follower: ${followerUri}`);
    return;
  }

  const follower = followerResult.val;

  // Resolve the accepting actor from our database
  const acceptingActorResult = await localActorResolver.resolve(acceptingActorIdentity.uri);
  if (!acceptingActorResult.ok || !acceptingActorResult.val) {
    getLogger().warn(`Failed to resolve accepting actor: ${acceptingActorIdentity.uri}`);
    return;
  }

  const acceptingActor = acceptingActorResult.val;

  // Check if follow exists
  const followResult = await followResolver.resolve({
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

  await followAcceptedStore.store(event);
  getLogger().info(`Follow accepted: ${follower.id} -> ${acceptingActor.id}`);
};
