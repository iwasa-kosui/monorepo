import { Accept, type Follow, type InboxContext } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import { Username } from '../../../domain/user/username.ts';
import { AcceptFollowRequestUseCase } from '../../../useCase/acceptFollowRequest.ts';
import { PgActorResolverByUri } from '../../pg/actor/actorResolverByUri.ts';
import { PgActorResolverByUserId } from '../../pg/actor/actorResolverByUserId.ts';
import { PgLogoUriUpdatedStore } from '../../pg/actor/logoUriUpdatedStore.ts';
import { PgRemoteActorCreatedStore } from '../../pg/actor/remoteActorCreatedStore.ts';
import { PgFollowedStore } from '../../pg/follow/followAcceptedStore.ts';
import { PgFollowResolver } from '../../pg/follow/followResolver.ts';
import { PgFollowNotificationCreatedStore } from '../../pg/notification/followNotificationCreatedStore.ts';
import { PgPushSubscriptionsResolverByUserId } from '../../pg/pushSubscription/pushSubscriptionsResolverByUserId.ts';
import { PgUserResolverByUsername } from '../../pg/user/userResolverByUsername.ts';
import { WebPushSender } from '../../webPush/webPushSender.ts';
import { ActorIdentity } from '../actorIdentity.ts';

export const onFollow = async (ctx: InboxContext<unknown>, activity: Follow) => {
  if (!activity.objectId) {
    return;
  }
  const follower = await activity.getActor();
  if (!follower || !follower.id || !follower.inboxId) {
    return;
  }
  const useCase = AcceptFollowRequestUseCase.create({
    followedStore: PgFollowedStore.getInstance(),
    followResolver: PgFollowResolver.getInstance(),
    actorResolverByUri: PgActorResolverByUri.getInstance(),
    actorResolverByUserId: PgActorResolverByUserId.getInstance(),
    remoteActorCreatedStore: PgRemoteActorCreatedStore.getInstance(),
    userResolverByUsername: PgUserResolverByUsername.getInstance(),
    logoUriUpdatedStore: PgLogoUriUpdatedStore.getInstance(),
    followNotificationCreatedStore: PgFollowNotificationCreatedStore.getInstance(),
    pushSubscriptionsResolver: PgPushSubscriptionsResolverByUserId.getInstance(),
    webPushSender: WebPushSender.getInstance(),
  });
  return RA.flow(
    RA.ok({}),
    RA.andBind('object', () => {
      const object = ctx.parseUri(activity.objectId);
      if (!object) {
        return RA.err(new Error('Invalid object URI'));
      }
      if (object.type !== 'actor') {
        return RA.err(new Error('Object is not an actor'));
      }
      return RA.ok(object);
    }),
    RA.andBind('follower', async () => {
      const follower = await activity.getActor();
      if (!follower || !follower.id || !follower.inboxId) {
        return RA.err(new Error('Invalid follower actor'));
      }
      return RA.ok(follower);
    }),
    RA.andBind('followerIdentity', ({ follower }) => ActorIdentity.fromFedifyActor(follower)),
    RA.andBind('username', ({ object }) => Username.parse(object.identifier)),
    RA.andThrough(async ({ username, followerIdentity, object }) => {
      await useCase.run({
        username,
        follower: followerIdentity,
      });
      await ctx.sendActivity(
        object,
        follower,
        new Accept({
          actor: activity.objectId,
          to: activity.actorId,
          object: activity,
        }),
      );
      return RA.ok(undefined);
    }),
    RA.match({
      ok: () => {
        getLogger().info(
          `Processed Follow activity from ${activity.actorId?.href} for ${activity.objectId?.href}`,
        );
      },
      err: (err) => {
        getLogger().warn(
          `Failed to process Follow activity from ${activity.actorId?.href} for ${activity.objectId?.href} - ${err}`,
        );
      },
    }),
  );
};
