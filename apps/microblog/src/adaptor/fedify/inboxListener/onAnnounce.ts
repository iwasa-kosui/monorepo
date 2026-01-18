import type { Announce, InboxContext } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import { PostId } from '../../../domain/post/postId.ts';
import { Env } from '../../../env.ts';
import { AddReceivedRepostUseCase } from '../../../useCase/addReceivedRepost.ts';
import { PgActorResolverByUri } from '../../pg/actor/actorResolverByUri.ts';
import { PgLogoUriUpdatedStore } from '../../pg/actor/logoUriUpdatedStore.ts';
import { PgRemoteActorCreatedStore } from '../../pg/actor/remoteActorCreatedStore.ts';
import { PgPostResolver } from '../../pg/post/postResolver.ts';
import { PgRepostCreatedStore } from '../../pg/repost/repostCreatedStore.ts';
import { PgRepostResolverByActivityUri } from '../../pg/repost/repostResolverByActivityUri.ts';
import { PgTimelineItemCreatedStore } from '../../pg/timeline/timelineItemCreatedStore.ts';
import { InboxActorResolver } from '../inboxActorResolver.ts';

export const onAnnounce = async (ctx: InboxContext<unknown>, activity: Announce) => {
  const actorResult = await InboxActorResolver.getInstance().resolve(ctx, activity);
  if (!actorResult.ok) {
    getLogger().warn(`Failed to resolve actor: ${actorResult.err.message}`);
    return;
  }
  const { actorIdentity: reposterIdentity } = actorResult.val;
  if (!activity.id) {
    getLogger().warn('Announce activity has no id');
    return;
  }
  const announceActivityUri = activity.id.href;

  const objectId = activity.objectId;
  if (!objectId) {
    getLogger().warn('Announce activity has no objectId');
    return;
  }

  const parsed = ctx.parseUri(objectId);
  if (
    !parsed || parsed.type !== 'object' || parsed.class?.typeId?.href !== 'https://www.w3.org/ns/activitystreams#Note'
  ) {
    getLogger().info(`Announce activity objectId is not a local Note: ${objectId.href}`);
    return;
  }

  const postIdResult = PostId.parse(parsed.values.id);
  if (!postIdResult.ok) {
    getLogger().warn(`Failed to parse postId from Announce activity: ${parsed.values.id}`);
    return;
  }
  const repostedPostId = postIdResult.val;

  const env = Env.getInstance();
  const objectUri = `${env.ORIGIN}/users/${parsed.values.identifier}/posts/${repostedPostId}`;

  const useCase = AddReceivedRepostUseCase.create({
    repostCreatedStore: PgRepostCreatedStore.getInstance(),
    repostResolverByActivityUri: PgRepostResolverByActivityUri.getInstance(),
    postResolver: PgPostResolver.getInstance(),
    remoteActorCreatedStore: PgRemoteActorCreatedStore.getInstance(),
    logoUriUpdatedStore: PgLogoUriUpdatedStore.getInstance(),
    actorResolverByUri: PgActorResolverByUri.getInstance(),
    timelineItemCreatedStore: PgTimelineItemCreatedStore.getInstance(),
  });

  return RA.flow(
    useCase.run({
      announceActivityUri,
      repostedPostId,
      reposterIdentity,
      objectUri,
    }),
    RA.match({
      ok: ({ actor: reposterActor }) => {
        getLogger().info(
          `Processed Announce activity: ${announceActivityUri} by ${reposterActor.uri}`,
        );
      },
      err: (err) => {
        getLogger().warn(
          `Failed to process Announce activity: ${announceActivityUri} - ${JSON.stringify(err)}`,
        );
      },
    }),
  );
};
