import type { InboxContext, Like } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import { PostId } from '../../../domain/post/postId.ts';
import { Env } from '../../../env.ts';
import { AddReceivedLikeUseCase } from '../../../useCase/addReceivedLike.ts';
import { PgActorResolverByUri } from '../../pg/actor/actorResolverByUri.ts';
import { PgLogoUriUpdatedStore } from '../../pg/actor/logoUriUpdatedStore.ts';
import { PgRemoteActorCreatedStore } from '../../pg/actor/remoteActorCreatedStore.ts';
import { PgLikeV2CreatedStore } from '../../pg/likeV2/likeV2CreatedStore.ts';
import { PgLikeV2ResolverByActivityUri } from '../../pg/likeV2/likeV2ResolverByActivityUri.ts';
import { PgLikeNotificationCreatedStore } from '../../pg/notification/notificationCreatedStore.ts';
import { PgPostResolver } from '../../pg/post/postResolver.ts';
import { PgPushSubscriptionsResolverByUserId } from '../../pg/pushSubscription/pushSubscriptionsResolverByUserId.ts';
import { WebPushSender } from '../../webPush/webPushSender.ts';
import { InboxActorResolver } from '../inboxActorResolver.ts';

export const onLike = async (ctx: InboxContext<unknown>, activity: Like) => {
  const actorResult = await InboxActorResolver.getInstance().resolve(ctx, activity);
  if (!actorResult.ok) {
    getLogger().warn(`Failed to resolve actor: ${actorResult.err.message}`);
    return;
  }
  const { actorIdentity: likerIdentity } = actorResult.val;
  if (!activity.id) {
    getLogger().warn('Like activity has no id');
    return;
  }
  const likeActivityUri = activity.id.href;

  const objectId = activity.objectId;
  if (!objectId) {
    getLogger().warn('Like activity has no objectId');
    return;
  }

  const parsed = ctx.parseUri(objectId);
  if (
    !parsed || parsed.type !== 'object' || parsed.class?.typeId?.href !== 'https://www.w3.org/ns/activitystreams#Note'
  ) {
    getLogger().info(`Like activity objectId is not a local Note: ${objectId.href}`);
    return;
  }

  const postIdResult = PostId.parse(parsed.values.id);
  if (!postIdResult.ok) {
    getLogger().warn(`Failed to parse postId from Like activity: ${parsed.values.id}`);
    return;
  }
  const likedPostId = postIdResult.val;

  const env = Env.getInstance();
  const objectUri = `${env.ORIGIN}/users/${parsed.values.identifier}/posts/${likedPostId}`;

  const useCase = AddReceivedLikeUseCase.create({
    likeV2CreatedStore: PgLikeV2CreatedStore.getInstance(),
    likeV2ResolverByActivityUri: PgLikeV2ResolverByActivityUri.getInstance(),
    likeNotificationCreatedStore: PgLikeNotificationCreatedStore.getInstance(),
    postResolver: PgPostResolver.getInstance(),
    remoteActorCreatedStore: PgRemoteActorCreatedStore.getInstance(),
    logoUriUpdatedStore: PgLogoUriUpdatedStore.getInstance(),
    actorResolverByUri: PgActorResolverByUri.getInstance(),
    pushSubscriptionsResolver: PgPushSubscriptionsResolverByUserId.getInstance(),
    webPushSender: WebPushSender.getInstance(),
  });

  return RA.flow(
    useCase.run({
      likeActivityUri,
      likedPostId,
      likerIdentity,
      objectUri,
    }),
    RA.match({
      ok: ({ actor: likerActor }) => {
        getLogger().info(
          `Processed Like activity: ${likeActivityUri} by ${likerActor.uri}`,
        );
      },
      err: (err) => {
        getLogger().warn(
          `Failed to process Like activity: ${likeActivityUri} - ${JSON.stringify(err)}`,
        );
      },
    }),
  );
};
