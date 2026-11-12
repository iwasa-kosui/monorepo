import { isActor, type Note } from '@fedify/vocab';
import type { DocumentLoader } from '@fedify/vocab-runtime';
import { getLogger } from '@logtape/logtape';

import { ActorIdentity } from '../../adaptor/fedify/actorIdentity.ts';
import { extractContentWarning } from '../../adaptor/fedify/extractContentWarning.ts';
import { extractRecipientActorUris } from '../../adaptor/fedify/extractRecipients.ts';
import { extractVisibility } from '../../adaptor/fedify/extractVisibility.ts';
import { Instant } from '../../domain/instant/instant.ts';
import type { RemotePostIdentity } from '../../domain/post/post.ts';

type Options = Readonly<{
  origin: string;
  documentLoader: DocumentLoader;
}>;

export const toRemotePostIdentity = async (
  note: Note,
  { origin, documentLoader }: Options,
): Promise<RemotePostIdentity | undefined> => {
  const uri = note.id?.href;
  if (!uri) {
    getLogger().debug('Note has no id');
    return undefined;
  }

  const author = await note.getAttribution({ documentLoader });
  if (!author || !isActor(author)) {
    getLogger().debug(`Could not resolve Note author: ${uri}`);
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
    publishedAt: publishedMs !== undefined && Number.isSafeInteger(publishedMs) && publishedMs >= 0
      ? Instant.orThrow(publishedMs)
      : undefined,
  };
};
