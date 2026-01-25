import { type Announce, type InboxContext, isActor, Note } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import { FederatedTimelineItem } from '../../../domain/federatedTimeline/federatedTimelineItem.ts';
import { FederatedTimelineItemId } from '../../../domain/federatedTimeline/federatedTimelineItemId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { AddReceivedRepostUseCase } from '../../../useCase/addReceivedRepost.ts';
import { PgActorResolverByUri } from '../../pg/actor/actorResolverByUri.ts';
import { PgLogoUriUpdatedStore } from '../../pg/actor/logoUriUpdatedStore.ts';
import { PgRemoteActorCreatedStore } from '../../pg/actor/remoteActorCreatedStore.ts';
import { PgFederatedTimelineItemCreatedStore } from '../../pg/federatedTimeline/federatedTimelineItemCreatedStore.ts';
import { PgFederatedTimelineItemResolverByPostId } from '../../pg/federatedTimeline/federatedTimelineItemResolverByPostId.ts';
import { PgPostResolver } from '../../pg/post/postResolver.ts';
import { PgRemotePostUpserter } from '../../pg/post/remotePostUpserter.ts';
import { PgRelayResolverByActorUri } from '../../pg/relay/relayResolverByActorUri.ts';
import { PgRepostCreatedStore } from '../../pg/repost/repostCreatedStore.ts';
import { PgRepostResolverByActivityUri } from '../../pg/repost/repostResolverByActivityUri.ts';
import { PgTimelineItemCreatedStore } from '../../pg/timeline/timelineItemCreatedStore.ts';
import { InboxActorResolver } from '../inboxActorResolver.ts';

export const onAnnounce = async (ctx: InboxContext<unknown>, activity: Announce) => {
  const actorId = activity.actorId;
  if (!actorId) {
    getLogger().warn('Announce activity has no actorId');
    return;
  }

  // Check if this is from a relay server
  const relayResolver = PgRelayResolverByActorUri.getInstance();
  const relayResult = await relayResolver.resolve({ actorUri: actorId.href });
  if (relayResult.ok && relayResult.val && relayResult.val.status === 'accepted') {
    // This is from a relay server - process as federated timeline item
    await processRelayAnnounce(ctx, activity, relayResult.val);
    return;
  }

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

/**
 * Process an Announce activity from a relay server.
 * This creates a FederatedTimelineItem for the post.
 */
import type { Relay } from '../../../domain/relay/relay.ts';

const processRelayAnnounce = async (
  _ctx: InboxContext<unknown>,
  activity: Announce,
  relay: Relay,
) => {
  const now = Instant.now();

  getLogger().info(`Processing relay Announce from: ${relay.actorUri}`);

  const note = await activity.getObject();
  if (!(note instanceof Note)) {
    getLogger().info(`Relay Announce object is not a Note`);
    return;
  }

  if (!note.id) {
    getLogger().warn('Relay Announce Note has no id');
    return;
  }

  // Get the note's author
  const author = await note.getAttribution();
  if (!author || !isActor(author)) {
    getLogger().warn(`Could not resolve Note author for relay: ${note.id.href}`);
    return;
  }

  if (!author.id || !author.inboxId) {
    getLogger().warn(`Note author has no id or inbox for relay: ${note.id.href}`);
    return;
  }

  const contentText = String(note.content ?? '');
  const authorIcon = await author.getIcon();

  // Upsert the remote post using the existing upserter
  const remotePostUpserter = PgRemotePostUpserter.getInstance();

  // Use the remote post upserter to create/get the post
  const postResult = await remotePostUpserter.resolve({
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
    inReplyToUri: null,
  });

  if (!postResult.ok) {
    getLogger().warn(`Failed to upsert remote post for relay: ${note.id.href}`);
    return;
  }

  const post = postResult.val;

  // Check if this post already exists in federated timeline
  const federatedTimelineItemResolver = PgFederatedTimelineItemResolverByPostId.getInstance();
  const existingItemResult = await federatedTimelineItemResolver.resolve({ postId: post.postId });

  if (existingItemResult.ok && existingItemResult.val) {
    getLogger().info(`Post already in federated timeline: ${post.postId}`);
    return;
  }

  // Create federated timeline item
  const federatedTimelineItemCreatedStore = PgFederatedTimelineItemCreatedStore.getInstance();
  const event = FederatedTimelineItem.createFederatedTimelineItem(
    {
      federatedTimelineItemId: FederatedTimelineItemId.generate(),
      postId: post.postId,
      relayId: relay.relayId,
      receivedAt: now,
    },
    now,
  );

  await federatedTimelineItemCreatedStore.store(event);
  getLogger().info(`Created federated timeline item for relay post: ${post.postId}`);
};
