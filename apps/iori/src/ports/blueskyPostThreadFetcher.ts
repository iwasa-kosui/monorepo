import type { RA } from '@iwasa-kosui/result';

import type { BlueskyFetchedTimelineItem } from '../domain/blueskyTimeline/blueskyTimelineItem.ts';
import type { BlueskyClientError } from './blueskyClient.ts';

export type BlueskyThreadNode =
  | Readonly<{ kind: 'post'; item: BlueskyFetchedTimelineItem }>
  | Readonly<{ kind: 'notFound'; uri: string }>
  | Readonly<{ kind: 'blocked'; uri: string }>;

export type BlueskyThreadReply = Readonly<{ depth: number; node: BlueskyThreadNode }>;

export type BlueskyPostThread = Readonly<{
  ancestors: readonly BlueskyThreadNode[];
  post: BlueskyFetchedTimelineItem;
  replies: readonly BlueskyThreadReply[];
}>;

export type BlueskyPostThreadUnavailable = Readonly<{
  type: 'BlueskyPostThreadUnavailable';
  reason: 'notFound' | 'blocked';
}>;

export type BlueskyPostThreadFetcher = Readonly<{
  fetch: (
    input: Readonly<{ uri: string }>,
  ) => RA<BlueskyPostThread, BlueskyClientError | BlueskyPostThreadUnavailable>;
}>;
