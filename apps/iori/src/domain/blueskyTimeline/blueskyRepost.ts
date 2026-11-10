import type { RA } from '@iwasa-kosui/result';

import type { Instant } from '../instant/instant.ts';
import { deriveBlueskyLikeRkey } from './blueskyLike.ts';

export type BlueskyRepostTarget = Readonly<{
  uri: string;
  cid: string;
  repostUri: string | null;
}>;

export type BlueskyRepostTargetNotFound = Readonly<{ type: 'BlueskyRepostTargetNotFound' }>;

export type BlueskyRepost = Readonly<{
  subjectUri: string;
  repostUri: string;
  createdAt: Instant;
}>;

export type BlueskyRepostTargetResolver = Readonly<{
  resolve: (feedItemId: string) => RA<BlueskyRepostTarget | undefined, never>;
}>;
export type BlueskyRepostSavedStore = Readonly<{
  save: (repost: BlueskyRepost) => RA<void, never>;
}>;
export type BlueskyRepostDeletedStore = Readonly<{
  deleteBySubjectUri: (subjectUri: string) => RA<void, never>;
}>;
export type BlueskyViewerRepostsSyncedStore = Readonly<{
  sync: (reposts: readonly BlueskyRepost[]) => RA<void, never>;
  deleteStale: (subjectUris: readonly string[], createdBefore: Instant) => RA<void, never>;
}>;

export const BLUESKY_REPOST_SYNC_GRACE_MS = 5 * 60 * 1000;

const repostUriPattern = /^at:\/\/[^/]+\/app\.bsky\.feed\.repost\/([^/]+)$/;

export const blueskyRepostRkey = (repostUri: string): string | undefined => repostUriPattern.exec(repostUri)?.[1];

export const deriveBlueskyRepostRkey = deriveBlueskyLikeRkey;
