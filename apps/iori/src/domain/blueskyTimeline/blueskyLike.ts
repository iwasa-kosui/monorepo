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
export type BlueskyLikeSavedStore = Readonly<{
  save: (like: BlueskyLike) => RA<void, never>;
}>;
export type BlueskyLikeDeletedStore = Readonly<{
  deleteBySubjectUri: (subjectUri: string) => RA<void, never>;
}>;

const likeUriPattern = /^at:\/\/[^/]+\/app\.bsky\.feed\.like\/([^/]+)$/;

export const blueskyLikeRkey = (likeUri: string): string | undefined => likeUriPattern.exec(likeUri)?.[1];
