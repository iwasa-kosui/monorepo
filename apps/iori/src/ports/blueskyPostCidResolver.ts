import type { RA } from '@iwasa-kosui/result';

import type { BlueskyClientError } from './blueskyClient.ts';

export type BlueskyPostSubject = Readonly<{ cid: string; likeUri: string | null; repostUri: string | null }>;

export type BlueskyPostCidResolver = Readonly<{
  resolve: (postUri: string) => RA<BlueskyPostSubject | undefined, BlueskyClientError>;
}>;
