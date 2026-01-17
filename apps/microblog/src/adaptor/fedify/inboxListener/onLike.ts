import type { InboxContext, Like } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import { PostId } from '../../../domain/post/postId.ts';
import { AddReceivedLikeUseCase } from '../../../useCase/addReceivedLike.ts';
import { PgActorResolverByUri } from '../../pg/actor/actorResolverByUri.ts';
import { PgLogoUriUpdatedStore } from '../../pg/actor/logoUriUpdatedStore.ts';
import { PgRemoteActorCreatedStore } from '../../pg/actor/remoteActorCreatedStore.ts';
import { PgNotificationCreatedStore } from '../../pg/notification/notificationCreatedStore.ts';
import { PgPostResolver } from '../../pg/post/postResolver.ts';
import { PgReceivedLikeCreatedStore } from '../../pg/receivedLike/receivedLikeCreatedStore.ts';
import { PgReceivedLikeResolverByActivityUri } from '../../pg/receivedLike/receivedLikeResolverByActivityUri.ts';
import { ActorIdentity } from '../actorIdentity.ts';

export const onLike = async (ctx: InboxContext<unknown>, activity: Like) => {
  const actor = await activity.getActor();
  if (!actor) {
    getLogger().warn('Like activity has no actor');
    return;
  }
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

  const useCase = AddReceivedLikeUseCase.create({
    receivedLikeCreatedStore: PgReceivedLikeCreatedStore.getInstance(),
    receivedLikeResolverByActivityUri: PgReceivedLikeResolverByActivityUri.getInstance(),
    notificationCreatedStore: PgNotificationCreatedStore.getInstance(),
    postResolver: PgPostResolver.getInstance(),
    remoteActorCreatedStore: PgRemoteActorCreatedStore.getInstance(),
    logoUriUpdatedStore: PgLogoUriUpdatedStore.getInstance(),
    actorResolverByUri: PgActorResolverByUri.getInstance(),
  });

  return RA.flow(
    RA.ok(actor),
    RA.andBind('likerIdentity', ActorIdentity.fromFedifyActor),
    RA.andThen(({ likerIdentity }) =>
      useCase.run({
        likeActivityUri,
        likedPostId,
        likerIdentity,
      })
    ),
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
