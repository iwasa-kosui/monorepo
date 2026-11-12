import type { RA } from '@iwasa-kosui/result';

import type { Instant } from '../instant/instant.ts';

export type BlueskyBookmarkTarget = Readonly<{
  uri: string;
  cid: string;
}>;

export type BlueskyBookmarkTargetNotFound = Readonly<{ type: 'BlueskyBookmarkTargetNotFound' }>;

export type BlueskyBookmark = Readonly<{
  subjectUri: string;
  createdAt: Instant;
}>;

export type BlueskyBookmarkTargetResolver = Readonly<{
  resolve: (feedItemId: string) => RA<BlueskyBookmarkTarget | undefined, never>;
}>;
export type BlueskyBookmarkSavedStore = Readonly<{
  save: (bookmark: BlueskyBookmark) => RA<void, never>;
}>;
export type BlueskyBookmarkDeletedStore = Readonly<{
  deleteBySubjectUri: (subjectUri: string) => RA<void, never>;
}>;
export type BlueskyViewerBookmarksSyncedStore = Readonly<{
  sync: (bookmarks: readonly BlueskyBookmark[]) => RA<void, never>;
  deleteStale: (subjectUris: readonly string[], createdBefore: Instant) => RA<void, never>;
}>;

export const BLUESKY_BOOKMARK_SYNC_GRACE_MS = 5 * 60 * 1000;
