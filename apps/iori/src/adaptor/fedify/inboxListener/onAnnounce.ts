import { type InboxContext } from '@fedify/fedify';
import { type Announce, isActor, Note } from '@fedify/vocab';
import { type DocumentLoader } from '@fedify/vocab-runtime';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import type {
  FederatedTimelineItemCreatedStore,
  FederatedTimelineItemResolverByPostId,
} from '../../../domain/federatedTimeline/federatedTimelineItem.ts';
import type { FollowedByLocalActorResolverByActorUri } from '../../../domain/follow/follow.ts';
import type { RemotePostAttachment, RemotePostUpserter } from '../../../domain/post/post.ts';
import { PostId } from '../../../domain/post/postId.ts';
import type { AcceptedRelaysResolver, RelayResolverByActorUri } from '../../../domain/relay/relay.ts';
import type { AddReceivedRepostUseCase } from '../../../useCase/addReceivedRepost.ts';
import { extractRecipientActorUris } from '../extractRecipients.ts';
import { extractVisibility } from '../extractVisibility.ts';
import type { InboxActorResolver } from '../inboxActorResolver.ts';
import { extractAttachments } from './extractAttachments.ts';
import { saveFederatedNote } from './saveFederatedNote.ts';

export type OnAnnounceDeps = Readonly<{
  origin: string;
  relayResolverByActorUri: RelayResolverByActorUri;
  followedByLocalActorResolverByActorUri: FollowedByLocalActorResolverByActorUri;
  acceptedRelaysResolver: AcceptedRelaysResolver;
  inboxActorResolver: InboxActorResolver;
  addReceivedRepostUseCase: AddReceivedRepostUseCase;
  remotePostUpserter: RemotePostUpserter;
  federatedTimelineItemResolverByPostId: FederatedTimelineItemResolverByPostId;
  federatedTimelineItemCreatedStore: FederatedTimelineItemCreatedStore;
}>;

const extractAttachmentsOrEmpty = async (
  note: Note,
  documentLoader: DocumentLoader,
): Promise<RemotePostAttachment[]> => {
  try {
    return await extractAttachments(note, documentLoader);
  } catch (error) {
    getLogger().warn(`Failed to extract attachments for: ${note.id?.href} - ${String(error)}`);
    return [];
  }
};

const saveForwardedAnnounce = async (
  deps: OnAnnounceDeps,
  ctx: InboxContext<unknown>,
  activity: Announce,
) => {
  const relaysResult = await deps.acceptedRelaysResolver.resolve();
  if (!relaysResult.ok || relaysResult.val.length !== 1) {
    return;
  }
  const [relay] = relaysResult.val;

  let note;
  try {
    note = await activity.getObject();
  } catch (error) {
    getLogger().warn(`Failed to fetch forwarded Announce object: ${activity.objectId?.href} - ${String(error)}`);
    return;
  }
  if (!(note instanceof Note)) {
    getLogger().info(`Forwarded Announce object is not a Note: ${activity.objectId?.href}`);
    return;
  }

  await saveFederatedNote(deps, { note, relayId: relay.relayId, documentLoader: ctx.documentLoader });
};

export const createOnAnnounce = (deps: OnAnnounceDeps) => async (ctx: InboxContext<unknown>, activity: Announce) => {
  const actorId = activity.actorId;
  if (!actorId) {
    getLogger().warn('Announce activity has no actorId');
    return;
  }

  // Check if this is from a relay server
  const relayResult = await deps.relayResolverByActorUri.resolve({ actorUri: actorId.href });
  if (relayResult.ok && relayResult.val && relayResult.val.status === 'accepted') {
    // This is from a relay server - process as federated timeline item
    await processRelayAnnounce(deps, ctx, activity, relayResult.val);
    return;
  }

  const objectId = activity.objectId;
  if (!objectId) {
    getLogger().warn('Announce activity has no objectId');
    return;
  }

  // Check if this is a local Note
  const parsed = ctx.parseUri(objectId);
  const localNote = parsed && parsed.type === 'object'
      && parsed.class?.typeId?.href === 'https://www.w3.org/ns/activitystreams#Note'
    ? parsed
    : undefined;

  if (!localNote) {
    const followedResult = await deps.followedByLocalActorResolverByActorUri.resolve({ actorUri: actorId.href });
    if (followedResult.ok && !followedResult.val) {
      getLogger().info(
        `Skipping Announce activity from an actor no local actor follows: ${actorId.href} (${activity.id?.href})`,
      );
      await saveForwardedAnnounce(deps, ctx, activity);
      return;
    }
  }

  const actorResult = await deps.inboxActorResolver.resolve(ctx, activity);
  if (!actorResult.ok) {
    getLogger().warn(`Failed to resolve actor: ${actorResult.err.message}`);
    return;
  }
  const { actorIdentity: reposterIdentity, documentLoaderOptions } = actorResult.val;
  if (!activity.id) {
    getLogger().warn('Announce activity has no id');
    return;
  }
  const announceActivityUri = activity.id.href;

  if (localNote) {
    // Local Note repost
    const postIdResult = PostId.parse(localNote.values.id);
    if (!postIdResult.ok) {
      getLogger().warn(`Failed to parse postId from Announce activity: ${localNote.values.id}`);
      return;
    }
    const repostedPostId = postIdResult.val;

    return RA.flow(
      deps.addReceivedRepostUseCase.run({
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
  const attachments = await extractAttachmentsOrEmpty(
    note,
    documentLoaderOptions.documentLoader ?? ctx.documentLoader,
  );

  return RA.flow(
    deps.addReceivedRepostUseCase.run({
      type: 'remote',
      announceActivityUri,
      reposterIdentity,
      remotePostIdentity: {
        uri: note.id.href,
        content: contentText,
        visibility: extractVisibility(note, author.followersId),
        recipientActorUris: extractRecipientActorUris([note], deps.origin),
        attachments,
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
  deps: OnAnnounceDeps,
  ctx: InboxContext<unknown>,
  activity: Announce,
  relay: Relay,
) => {
  getLogger().info(`Processing relay Announce from: ${relay.actorUri}`);

  const note = await activity.getObject();
  if (!(note instanceof Note)) {
    getLogger().info(`Relay Announce object is not a Note`);
    return;
  }

  await saveFederatedNote(deps, { note, relayId: relay.relayId, documentLoader: ctx.documentLoader });
};
