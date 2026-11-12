import { type InboxContext } from '@fedify/fedify';
import { type Announce, isActor } from '@fedify/vocab';
import { type DocumentLoader } from '@fedify/vocab-runtime';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import type { ActorResolverByUri } from '../../../domain/actor/actor.ts';
import type { ArticleResolver } from '../../../domain/article/article.ts';
import { ArticleId } from '../../../domain/article/articleId.ts';
import type {
  FederatedTimelineItemCreatedStore,
  FederatedTimelineItemResolverByPostId,
} from '../../../domain/federatedTimeline/federatedTimelineItem.ts';
import type { FollowedByLocalActorResolverByActorUri } from '../../../domain/follow/follow.ts';
import type { RemotePostAttachment, RemotePostUpserter } from '../../../domain/post/post.ts';
import { PostId } from '../../../domain/post/postId.ts';
import type { AcceptedRelaysResolver, RelayResolverByActorUri } from '../../../domain/relay/relay.ts';
import type { AddReceivedRepostUseCase } from '../../../useCase/addReceivedRepost.ts';
import { isBlockedRemoteObject } from '../../../useCase/helper/isBlockedRemoteObject.ts';
import {
  buildRemotePostBody,
  isRemotePostObject,
  type RemotePostObject,
} from '../../../useCase/helper/remotePostObject.ts';
import { ActorIdentity } from '../actorIdentity.ts';
import { extractContentWarning } from '../extractContentWarning.ts';
import { extractNoteUrl } from '../extractNoteUrl.ts';
import { extractQuoteUri } from '../extractQuoteUri.ts';
import { extractRecipientActorUris } from '../extractRecipients.ts';
import { extractVisibility } from '../extractVisibility.ts';
import type { InboxActorResolver } from '../inboxActorResolver.ts';
import { INSTANCE_ACTOR_IDENTIFIER } from '../sharedKeyDispatcher.ts';
import { extractAttachments } from './extractAttachments.ts';
import { saveFederatedNote } from './saveFederatedNote.ts';

const NOTE_TYPE_ID = 'https://www.w3.org/ns/activitystreams#Note';
const ARTICLE_TYPE_ID = 'https://www.w3.org/ns/activitystreams#Article';

export type OnAnnounceDeps = Readonly<{
  origin: string;
  relayResolverByActorUri: RelayResolverByActorUri;
  followedByLocalActorResolverByActorUri: FollowedByLocalActorResolverByActorUri;
  acceptedRelaysResolver: AcceptedRelaysResolver;
  inboxActorResolver: InboxActorResolver;
  addReceivedRepostUseCase: AddReceivedRepostUseCase;
  articleResolver: ArticleResolver;
  remotePostUpserter: RemotePostUpserter;
  actorResolverByUri: ActorResolverByUri;
  federatedTimelineItemResolverByPostId: FederatedTimelineItemResolverByPostId;
  federatedTimelineItemCreatedStore: FederatedTimelineItemCreatedStore;
  isBlockedUri: (uri: string) => boolean;
}>;

const extractAttachmentsOrEmpty = async (
  note: RemotePostObject,
  documentLoader: DocumentLoader,
): Promise<RemotePostAttachment[]> => {
  try {
    return await extractAttachments(note, documentLoader);
  } catch (error) {
    getLogger().warn(`Failed to extract attachments for: ${note.id?.href} - ${String(error)}`);
    return [];
  }
};

const getSignedDocumentLoader = (ctx: InboxContext<unknown>) =>
  ctx.getDocumentLoader({ identifier: ctx.recipient ?? INSTANCE_ACTOR_IDENTIFIER });

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

  const documentLoader = await getSignedDocumentLoader(ctx);
  let note;
  try {
    note = await activity.getObject({ documentLoader });
  } catch (error) {
    getLogger().warn(`Failed to fetch forwarded Announce object: ${activity.objectId?.href} - ${String(error)}`);
    return;
  }
  if (!isRemotePostObject(note)) {
    getLogger().info(`Forwarded Announce object is not a Note, Article or Question: ${activity.objectId?.href}`);
    return;
  }

  await saveFederatedNote(deps, { note, relayId: relay.relayId, documentLoader });
};

export const createOnAnnounce = (deps: OnAnnounceDeps) => async (ctx: InboxContext<unknown>, activity: Announce) => {
  const actorId = activity.actorId;
  if (!actorId) {
    getLogger().warn('Announce activity has no actorId');
    return;
  }

  const blockedUri = [actorId, activity.objectId].find((uri) => uri && deps.isBlockedUri(uri.href));
  if (blockedUri) {
    getLogger().info(`Ignoring an Announce from or of a blocked domain: ${blockedUri.href} (${activity.id?.href})`);
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

  // Check if this is a local Note or Article
  const parsed = ctx.parseUri(objectId);
  const localObject = parsed && parsed.type === 'object'
      && (parsed.class?.typeId?.href === NOTE_TYPE_ID || parsed.class?.typeId?.href === ARTICLE_TYPE_ID)
    ? parsed
    : undefined;

  if (!localObject) {
    const followedResult = await deps.followedByLocalActorResolverByActorUri.resolve({ actorUri: actorId.href });
    if (!followedResult.ok) {
      getLogger().warn(
        `Failed to determine whether a local actor follows ${actorId.href}; failing the Announce to retry: ${activity.id?.href} - ${
          String(followedResult.err)
        }`,
      );
      throw new Error(`Failed to determine whether a local actor follows ${actorId.href}`);
    }
    if (!followedResult.val) {
      getLogger().info(
        `Not creating a repost for an Announce from an actor no local actor follows; trying to save it to the federated timeline as a relay-forwarded boost: ${actorId.href} (${activity.id?.href})`,
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

  if (localObject) {
    let repostedPostId: PostId;
    if (localObject.class?.typeId?.href === ARTICLE_TYPE_ID) {
      const articleIdResult = ArticleId.parse(localObject.values.id);
      if (!articleIdResult.ok) {
        getLogger().warn(`Failed to parse articleId from Announce activity: ${localObject.values.id}`);
        return;
      }
      const articleResult = await deps.articleResolver.resolve(articleIdResult.val);
      const article = articleResult.ok ? articleResult.val : undefined;
      const rootPostId = article?.status === 'published' ? article.rootPostId : undefined;
      if (!rootPostId) {
        getLogger().info(
          `Announce activity targets an unpublished article or one without a root post: ${objectId.href}`,
        );
        return;
      }
      repostedPostId = rootPostId;
    } else {
      // Local Note repost
      const postIdResult = PostId.parse(localObject.values.id);
      if (!postIdResult.ok) {
        getLogger().warn(`Failed to parse postId from Announce activity: ${localObject.values.id}`);
        return;
      }
      repostedPostId = postIdResult.val;
    }

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

  const documentLoader = documentLoaderOptions.documentLoader ?? await getSignedDocumentLoader(ctx);
  const note = await activity.getObject({ documentLoader });
  if (!isRemotePostObject(note)) {
    getLogger().info(`Announce activity object is not a Note, Article or Question: ${objectId.href}`);
    return;
  }

  if (!note.id) {
    getLogger().warn('Announce activity Note has no id');
    return;
  }

  if (isBlockedRemoteObject(note, deps.isBlockedUri)) {
    getLogger().info(`Ignoring an Announce of a Note from a blocked domain: ${note.id.href}`);
    return;
  }

  // Get the note's author
  const author = await note.getAttribution({ documentLoader });
  if (!author || !isActor(author)) {
    getLogger().warn(`Could not resolve Note author for: ${note.id.href}`);
    return;
  }

  if (!author.id || !author.inboxId) {
    getLogger().warn(`Note author has no id or inbox: ${note.id.href}`);
    return;
  }

  if (author.id.origin !== note.id.origin) {
    getLogger().warn(`Note origin does not match actor origin: ${note.id.href} - ${author.id.href}`);
    return;
  }

  const { content: contentText, poll } = await buildRemotePostBody(note);
  const authorIdentity = await ActorIdentity.fromFedifyActor(author, { documentLoader });
  if (!authorIdentity.ok) {
    getLogger().warn(`Could not read Note author: ${note.id.href}`);
    return;
  }
  const attachments = await extractAttachmentsOrEmpty(
    note,
    documentLoader,
  );

  return RA.flow(
    deps.addReceivedRepostUseCase.run({
      type: 'remote',
      announceActivityUri,
      reposterIdentity,
      remotePostIdentity: {
        uri: note.id.href,
        url: extractNoteUrl(note),
        content: contentText,
        poll,
        ...extractContentWarning(note),
        visibility: extractVisibility(note, author.followersId),
        recipientActorUris: extractRecipientActorUris([note], deps.origin),
        quoteUri: await extractQuoteUri(note),
        attachments,
        authorIdentity: authorIdentity.val,
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

  const documentLoader = await getSignedDocumentLoader(ctx);
  const note = await activity.getObject({ documentLoader });
  if (!isRemotePostObject(note)) {
    getLogger().info(`Relay Announce object is not a Note, Article or Question`);
    return;
  }

  await saveFederatedNote(deps, { note, relayId: relay.relayId, documentLoader });
};
