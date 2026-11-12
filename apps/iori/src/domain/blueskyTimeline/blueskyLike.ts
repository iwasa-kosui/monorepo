import type { RA } from '@iwasa-kosui/result';

import type { Instant } from '../instant/instant.ts';

export type BlueskyLikeTarget = Readonly<{
  uri: string;
  cid: string;
  likeUri: string | null;
}>;

export type BlueskyLikeTargetNotFound = Readonly<{ type: 'BlueskyLikeTargetNotFound' }>;

export type BlueskyLike = Readonly<{
  subjectUri: string;
  likeUri: string;
  createdAt: Instant;
}>;

export type BlueskyLikeTargetResolver = Readonly<{
  resolve: (feedItemId: string) => RA<BlueskyLikeTarget | undefined, never>;
}>;
export type BlueskyLikeUriResolver = Readonly<{
  resolve: (subjectUri: string) => RA<string | null, never>;
}>;
export type BlueskyLikeSavedStore = Readonly<{
  save: (like: BlueskyLike) => RA<void, never>;
}>;
export type BlueskyLikeDeletedStore = Readonly<{
  deleteBySubjectUri: (subjectUri: string) => RA<void, never>;
}>;
export type BlueskyViewerLikesSyncedStore = Readonly<{
  sync: (likes: readonly BlueskyLike[]) => RA<void, never>;
}>;

const likeUriPattern = /^at:\/\/[^/]+\/app\.bsky\.feed\.like\/([^/]+)$/;

export const blueskyLikeRkey = (likeUri: string): string | undefined => likeUriPattern.exec(likeUri)?.[1];

const BASE32_SORTABLE = '234567abcdefghijklmnopqrstuvwxyz';
const TID_LENGTH = 13;
const RKEY_VALUE_MASK = (1n << 60n) - 1n;

export const deriveBlueskyLikeRkey = async (subjectUri: string): Promise<string> => {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(subjectUri)));
  let value = new DataView(digest.buffer).getBigUint64(0) & RKEY_VALUE_MASK;
  let rkey = '';
  for (let index = 0; index < TID_LENGTH; index += 1) {
    rkey = BASE32_SORTABLE[Number(value & 31n)] + rkey;
    value >>= 5n;
  }
  return rkey;
};
