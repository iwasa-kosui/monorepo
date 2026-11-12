import { PUBLIC_COLLECTION } from '@fedify/vocab';

import type { Visibility } from '../../domain/post/visibility.ts';

export type PostAddressing = Readonly<{ tos: URL[]; ccs: URL[] }>;

export const toPostAddressing = (
  { visibility, followersUri, mentionUris }: Readonly<{
    visibility: Visibility;
    followersUri: URL;
    mentionUris: ReadonlyArray<URL>;
  }>,
): PostAddressing => {
  switch (visibility) {
    case 'public':
      return { tos: [PUBLIC_COLLECTION], ccs: [followersUri, ...mentionUris] };
    case 'unlisted':
      return { tos: [followersUri], ccs: [PUBLIC_COLLECTION, ...mentionUris] };
    case 'private':
      return { tos: [followersUri], ccs: [...mentionUris] };
    case 'direct':
      return { tos: [...mentionUris], ccs: [] };
  }
};
