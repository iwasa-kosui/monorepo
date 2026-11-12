import { Mention, PUBLIC_COLLECTION } from '@fedify/vocab';

import type { RemotePostObject } from '../../useCase/helper/remotePostObject.ts';

const embeddedOnlyDocumentLoader = (): Promise<never> => Promise.reject(new Error('remote tags are not fetched'));

export const extractMentionedActorUris = async (note: RemotePostObject): Promise<string[]> => {
  const uris = new Set<string>();
  try {
    for await (const tag of note.getTags({ documentLoader: embeddedOnlyDocumentLoader, suppressError: true })) {
      if (!(tag instanceof Mention) || tag.href === null || tag.href.href === PUBLIC_COLLECTION.href) continue;
      if (tag.href.protocol === 'http:' || tag.href.protocol === 'https:') uris.add(tag.href.href);
    }
  } catch {
    return [...uris];
  }
  return [...uris];
};
