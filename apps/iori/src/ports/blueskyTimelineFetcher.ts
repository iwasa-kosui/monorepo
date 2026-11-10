import type { RA } from '@iwasa-kosui/result';

import type { BlueskyFetchedTimelineItem } from '../domain/blueskyTimeline/blueskyTimelineItem.ts';
import type { BlueskyClientError } from './blueskyClient.ts';

export type BlueskyTimelinePage = Readonly<{
  items: readonly BlueskyFetchedTimelineItem[];
  dropped: number;
  cursor: string | undefined;
}>;

export type BlueskyTimelineFetcher = Readonly<{
  fetch: (
    input: Readonly<{ limit: number; cursor: string | undefined }>,
  ) => RA<BlueskyTimelinePage, BlueskyClientError>;
}>;
