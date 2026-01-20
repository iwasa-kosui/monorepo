import { type Announce, type InboxContext, isActor, Note } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import { PostId } from '../../../domain/post/postId.ts';
import { AddReceivedRepostUseCase } from '../../../useCase/addReceivedRepost.ts';
import { PgActorResolverByUri } from '../../pg/actor/actorResolverByUri.ts';
import { PgLogoUriUpdatedStore } from '../../pg/actor/logoUriUpdatedStore.ts';
import { PgRemoteActorCreatedStore } from '../../pg/actor/remoteActorCreatedStore.ts';
import { PgPostResolver } from '../../pg/post/postResolver.ts';
import { PgRemotePostUpserter } from '../../pg/post/remotePostUpserter.ts';
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

  const useCase = AddReceivedRepostUseCase.create({
    repostCreatedStore: PgRepostCreatedStore.getInstance(),
    repostResolverByActivityUri: PgRepostResolverByActivityUri.getInstance(),
    postResolver: PgPostResolver.getInstance(),
    remotePostUpserter: PgRemotePostUpserter.getInstance(),
    remoteActorCreatedStore: PgRemoteActorCreatedStore.getInstance(),
    logoUriUpdatedStore: PgLogoUriUpdatedStore.getInstance(),
    actorResolverByUri: PgActorResolverByUri.getInstance(),
    timelineItemCreatedStore: PgTimelineItemCreatedStore.getInstance(),
  });

  // Check if this is a local Note
  const parsed = ctx.parseUri(objectId);
  if (
    parsed && parsed.type === 'object' && parsed.class?.typeId?.href === 'https://www.w3.org/ns/activitystreams#Note'
  ) {
    // Local Note repost
    const postIdResult = PostId.parse(parsed.values.id);
    if (!postIdResult.ok) {
      getLogger().warn(`Failed to parse postId from Announce activity: ${parsed.values.id}`);
      return;
    }
    const repostedPostId = postIdResult.val;

    return RA.flow(
      useCase.run({
        type: 'local',
        announceActivityUri,
        repostedPostId,
        reposterIdentity,
      }),
      RA.match({
        ok: ({ actor: reposterActor }) => {
          getLogger().info(
            `Processed local Announce activity: ${announceActivityUri} by ${reposterActor.uri}`,
          );
        },
        err: (err) => {
          getLogger().warn(
            `Failed to process local Announce activity: ${announceActivityUri} - ${JSON.stringify(err)}`,
          );
        },
      }),
    );
  }

  // Remote Note repost - lookup the remote note
  getLogger().info(`Processing remote Announce activity: ${objectId.href}`);

  const note = await activity.getObject();
  if (!(note instanceof Note)) {
    getLogger().info(`Announce activity object is not a Note: ${objectId.href}`);
    return;
  }

  if (!note.id) {
    getLogger().warn('Announce activity Note has no id');
    return;
  }

  // Get the note's author
  const author = await note.getAttribution();
  if (!author || !isActor(author)) {
    getLogger().warn(`Could not resolve Note author for: ${note.id.href}`);
    return;
  }

  if (!author.id || !author.inboxId) {
    getLogger().warn(`Note author has no id or inbox: ${note.id.href}`);
    return;
  }

  const contentText = String(note.content ?? '');
  const authorIcon = await author.getIcon();

  return RA.flow(
    useCase.run({
      type: 'remote',
      announceActivityUri,
      reposterIdentity,
      remotePostIdentity: {
        uri: note.id.href,
        content: contentText,
        authorIdentity: {
          uri: author.id.href,
          inboxUrl: author.inboxId.href,
          url: author.url instanceof URL ? author.url.href : undefined,
          username: typeof author.preferredUsername === 'string'
            ? author.preferredUsername
            : author.preferredUsername?.toString(),
          logoUri: authorIcon?.url instanceof URL ? authorIcon.url.href : undefined,
        },
      },
    }),
    RA.match({
      ok: ({ actor: reposterActor }) => {
        getLogger().info(
          `Processed remote Announce activity: ${announceActivityUri} by ${reposterActor.uri}`,
        );
      },
      err: (err) => {
        getLogger().warn(
          `Failed to process remote Announce activity: ${announceActivityUri} - ${JSON.stringify(err)}`,
        );
      },
    }),
  );
};
