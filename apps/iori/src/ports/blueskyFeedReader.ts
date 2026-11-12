import type { RA } from '@iwasa-kosui/result';

import type { BlueskyFeedKind } from '../domain/blueskyFeed/blueskyFeedUri.ts';
import type { BlueskyFetchedTimelineItem } from '../domain/blueskyTimeline/blueskyTimelineItem.ts';
import type { BlueskyClientError } from './blueskyClient.ts';

export type BlueskySavedFeed = Readonly<{
  uri: string;
  kind: BlueskyFeedKind;
  pinned: boolean;
  displayName?: string;
  avatar?: string;
  description?: string;
  creatorHandle?: string;
}>;

export type BlueskySavedFeeds = Readonly<{ feeds: readonly BlueskySavedFeed[] }>;

export type BlueskyFeedPostsPage = Readonly<{
  items: readonly BlueskyFetchedTimelineItem[];
  cursor: string | undefined;
}>;

export type BlueskyFeedReader = Readonly<{
  listSavedFeeds: () => RA<BlueskySavedFeeds, BlueskyClientError>;
  getFeedPosts: (
    input: Readonly<{ uri: string; cursor: string | undefined }>,
  ) => RA<BlueskyFeedPostsPage, BlueskyClientError>;
}>;
