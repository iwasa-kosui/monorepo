import { isActor } from '@fedify/vocab';
import { type DocumentLoader } from '@fedify/vocab-runtime';
import { getLogger } from '@logtape/logtape';

import type { ActorResolverByUri } from '../../../domain/actor/actor.ts';
import type {
  FederatedTimelineItemCreatedStore,
  FederatedTimelineItemResolverByPostId,
} from '../../../domain/federatedTimeline/federatedTimelineItem.ts';
import { FederatedTimelineItem } from '../../../domain/federatedTimeline/federatedTimelineItem.ts';
import { FederatedTimelineItemId } from '../../../domain/federatedTimeline/federatedTimelineItemId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import type { RemotePostAttachment, RemotePostUpserter } from '../../../domain/post/post.ts';
import type { RelayId } from '../../../domain/relay/relayId.ts';
import { isBlockedRemoteObject } from '../../../useCase/helper/isBlockedRemoteObject.ts';
import { buildRemotePostBody, type RemotePostObject } from '../../../useCase/helper/remotePostObject.ts';
import { ActorIdentity } from '../actorIdentity.ts';
import { extractContentWarning } from '../extractContentWarning.ts';
import { extractNoteUrl } from '../extractNoteUrl.ts';
import { extractQuoteUri } from '../extractQuoteUri.ts';
import { extractRecipientActorUris } from '../extractRecipients.ts';
import { extractVisibility } from '../extractVisibility.ts';
import { extractAttachments } from './extractAttachments.ts';

export type SaveFederatedNoteDeps = Readonly<{
  origin: string;
  remotePostUpserter: RemotePostUpserter;
  actorResolverByUri: ActorResolverByUri;
  federatedTimelineItemResolverByPostId: FederatedTimelineItemResolverByPostId;
  federatedTimelineItemCreatedStore: FederatedTimelineItemCreatedStore;
  isBlockedUri?: (uri: string) => boolean;
}>;

export type SaveFederatedNoteInput = Readonly<{
  note: RemotePostObject;
  relayId: RelayId;
  documentLoader: DocumentLoader;
  actorId?: URL;
  inReplyToUri?: string | null;
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

export const saveFederatedNote = async (
  deps: SaveFederatedNoteDeps,
  { note, relayId, documentLoader, actorId, inReplyToUri }: SaveFederatedNoteInput,
): Promise<void> => {
  const now = Instant.now();

  if (!note.id) {
    getLogger().warn('Federated Note has no id');
    return;
  }

  if (deps.isBlockedUri && isBlockedRemoteObject(note, deps.isBlockedUri)) {
    getLogger().info(`Ignoring a federated Note from a blocked domain: ${note.id.href}`);
    return;
  }

  const author = await note.getAttribution({ documentLoader });
  if (!author || !isActor(author)) {
    getLogger().warn(`Could not resolve Note author for federated timeline: ${note.id.href}`);
    return;
  }

  if (!author.id || !author.inboxId) {
    getLogger().warn(`Note author has no id or inbox for federated timeline: ${note.id.href}`);
    return;
  }

  const mismatchedActorId = [author.id, actorId].find((id) => id !== undefined && id.origin !== note.id?.origin);
  if (mismatchedActorId) {
    getLogger().warn(
      `Note origin does not match actor origin: ${note.id.href} - ${mismatchedActorId.href}`,
    );
    return;
  }

  const { content: contentText, poll } = await buildRemotePostBody(note);
  const authorIdentity = await ActorIdentity.fromFedifyActor(author, { documentLoader });
  if (!authorIdentity.ok) {
    getLogger().warn(`Could not read Note author for federated timeline: ${note.id.href}`);
    return;
  }
  const attachments = await extractAttachmentsOrEmpty(note, documentLoader);

  const postResult = await deps.remotePostUpserter.resolve({
    uri: note.id.href,
    url: extractNoteUrl(note),
    content: contentText,
    poll,
    ...extractContentWarning(note),
    visibility: extractVisibility(note, author.followersId),
    recipientActorUris: extractRecipientActorUris([note], deps.origin),
    attachments,
    authorIdentity: authorIdentity.val,
    inReplyToUri: inReplyToUri ?? null,
    quoteUri: await extractQuoteUri(note),
  });

  if (!postResult.ok) {
    getLogger().warn(`Failed to upsert remote post for federated timeline: ${note.id.href}`);
    return;
  }

  const post = postResult.val;

  const authorActorResult = await deps.actorResolverByUri.resolve(authorIdentity.val.uri);
  if (!authorActorResult.val) {
    getLogger().warn(`Note author actor not found for federated timeline: ${note.id.href} - ${authorIdentity.val.uri}`);
    return;
  }
  if (post.actorId !== authorActorResult.val.id) {
    getLogger().warn(
      `Ignored a federated Note for a post owned by another actor: ${note.id.href} existing=${post.actorId} actor=${authorActorResult.val.id}`,
    );
    return;
  }

  const existingItemResult = await deps.federatedTimelineItemResolverByPostId.resolve({ postId: post.postId });

  if (existingItemResult.ok && existingItemResult.val) {
    getLogger().info(`Post already in federated timeline: ${post.postId}`);
    return;
  }

  const event = FederatedTimelineItem.createFederatedTimelineItem(
    {
      federatedTimelineItemId: FederatedTimelineItemId.generate(),
      postId: post.postId,
      relayId,
      receivedAt: now,
    },
    now,
  );

  try {
    await deps.federatedTimelineItemCreatedStore.store(event);
  } catch (error) {
    let resolved;
    try {
      resolved = await deps.federatedTimelineItemResolverByPostId.resolve({ postId: post.postId });
    } catch {
      throw error;
    }
    if (resolved.ok && resolved.val) {
      getLogger().info(`Post already in federated timeline: ${post.postId}`);
      return;
    }
    throw error;
  }
  getLogger().info(`Created federated timeline item for federated post: ${post.postId}`);
};
