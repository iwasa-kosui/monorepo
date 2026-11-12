import { isActor, type Note } from '@fedify/vocab';
import type { DocumentLoader } from '@fedify/vocab-runtime';
import { getLogger } from '@logtape/logtape';

import { ActorIdentity } from '../../adaptor/fedify/actorIdentity.ts';
import { extractContentWarning } from '../../adaptor/fedify/extractContentWarning.ts';
import { extractMentionedActorUris } from '../../adaptor/fedify/extractMentionedActorUris.ts';
import { extractQuoteUri } from '../../adaptor/fedify/extractQuoteUri.ts';
import { extractRecipientActorUris } from '../../adaptor/fedify/extractRecipients.ts';
import { extractVisibility } from '../../adaptor/fedify/extractVisibility.ts';
import { Instant } from '../../domain/instant/instant.ts';
import type { RemotePostIdentity } from '../../domain/post/post.ts';

type Options = Readonly<{
  origin: string;
  documentLoader: DocumentLoader;
  isBlockedUri?: (uri: string) => boolean;
}>;

export const toRemotePostIdentity = async (
  note: Note,
  { origin, documentLoader, isBlockedUri }: Options,
): Promise<RemotePostIdentity | undefined> => {
  const uri = note.id?.href;
  if (!uri) {
    getLogger().debug('Note has no id');
    return undefined;
  }

  if (isBlockedUri?.(uri) || note.attributionIds.some((id) => isBlockedUri?.(id.href))) {
    getLogger().debug(`Ignored a Note from a blocked domain: ${uri}`);
    return undefined;
  }

  const author = await note.getAttribution({ documentLoader });
  if (!author || !isActor(author)) {
    getLogger().debug(`Could not resolve Note author: ${uri}`);
    return undefined;
  }

  if (author.id && isBlockedUri?.(author.id.href)) {
    getLogger().debug(`Ignored a Note whose author is on a blocked domain: ${uri}`);
    return undefined;
  }

  const actorIdentityResult = await ActorIdentity.fromFedifyActor(author, { documentLoader });
  if (!actorIdentityResult.ok) {
    getLogger().debug(`Could not parse actor identity: ${uri}`);
    return undefined;
  }

  const publishedMs = note.published?.epochMilliseconds;
  return {
    uri,
    content: String(note.content ?? ''),
    authorIdentity: actorIdentityResult.val,
    inReplyToUri: note.replyTargetId?.href ?? null,
    ...extractContentWarning(note),
    visibility: extractVisibility(note, author.followersId),
    recipientActorUris: extractRecipientActorUris([note], origin),
    mentionedActorUris: await extractMentionedActorUris(note),
    quoteUri: await extractQuoteUri(note),
    publishedAt: publishedMs !== undefined && Number.isSafeInteger(publishedMs) && publishedMs >= 0
      ? Instant.orThrow(publishedMs)
      : undefined,
  };
};
