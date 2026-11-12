import type { RA } from '@iwasa-kosui/result';

import type { BlueskyFetchedTimelineItem } from '../domain/blueskyTimeline/blueskyTimelineItem.ts';
import type { BlueskyClientError } from './blueskyClient.ts';

export type BlueskySearchInput = Readonly<{ q: string; cursor?: string | undefined; limit: number }>;

export type BlueskySearchedActor = Readonly<{
  did: string;
  handle: string;
  displayName: string | null;
  avatar: string | null;
  description: string | null;
  followedByMe: boolean;
}>;

export type BlueskySearch = Readonly<{
  searchPosts: (
    input: BlueskySearchInput,
  ) => RA<Readonly<{ items: readonly BlueskyFetchedTimelineItem[]; cursor: string | undefined }>, BlueskyClientError>;
  searchActors: (
    input: BlueskySearchInput,
  ) => RA<Readonly<{ actors: readonly BlueskySearchedActor[]; cursor: string | undefined }>, BlueskyClientError>;
}>;
