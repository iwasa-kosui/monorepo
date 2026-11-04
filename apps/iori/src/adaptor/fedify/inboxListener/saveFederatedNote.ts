import { isActor, type Note } from '@fedify/vocab';
import { type DocumentLoader } from '@fedify/vocab-runtime';
import { getLogger } from '@logtape/logtape';

import type {
  FederatedTimelineItemCreatedStore,
  FederatedTimelineItemResolverByPostId,
} from '../../../domain/federatedTimeline/federatedTimelineItem.ts';
import { FederatedTimelineItem } from '../../../domain/federatedTimeline/federatedTimelineItem.ts';
import { FederatedTimelineItemId } from '../../../domain/federatedTimeline/federatedTimelineItemId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import type { RemotePostAttachment, RemotePostUpserter } from '../../../domain/post/post.ts';
import type { RelayId } from '../../../domain/relay/relayId.ts';
import { extractRecipientActorUris } from '../extractRecipients.ts';
import { extractVisibility } from '../extractVisibility.ts';
import { extractAttachments } from './extractAttachments.ts';

export type SaveFederatedNoteDeps = Readonly<{
  origin: string;
  remotePostUpserter: RemotePostUpserter;
  federatedTimelineItemResolverByPostId: FederatedTimelineItemResolverByPostId;
  federatedTimelineItemCreatedStore: FederatedTimelineItemCreatedStore;
}>;

export type SaveFederatedNoteInput = Readonly<{
  note: Note;
  relayId: RelayId;
  documentLoader: DocumentLoader;
  actorId?: URL;
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

export const saveFederatedNote = async (
  deps: SaveFederatedNoteDeps,
  { note, relayId, documentLoader, actorId }: SaveFederatedNoteInput,
): Promise<void> => {
  const now = Instant.now();

  if (!note.id) {
    getLogger().warn('Federated Note has no id');
    return;
  }

  const author = await note.getAttribution();
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

  const contentText = String(note.content ?? '');
  const authorIcon = await author.getIcon();
  const attachments = await extractAttachmentsOrEmpty(note, documentLoader);

  const postResult = await deps.remotePostUpserter.resolve({
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
    inReplyToUri: null,
  });

  if (!postResult.ok) {
    getLogger().warn(`Failed to upsert remote post for federated timeline: ${note.id.href}`);
    return;
  }

  const post = postResult.val;

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
