import type { RA } from '@iwasa-kosui/result';

import type { BlueskyFeedKind } from '../domain/blueskyFeed/blueskyFeedUri.ts';
import type { BlueskyFetchedTimelineItem } from '../domain/blueskyTimeline/blueskyTimelineItem.ts';
import type { BlueskyClientError } from './blueskyClient.ts';
import type { BlueskySearchedActor } from './blueskySearch.ts';

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

export type BlueskyFeedsPage = Readonly<{
  feeds: readonly BlueskySavedFeed[];
  cursor: string | undefined;
}>;

export type BlueskyListMembersPage = Readonly<{
  actors: readonly BlueskySearchedActor[];
  cursor: string | undefined;
}>;

export type BlueskyFeedReader = Readonly<{
  listSavedFeeds: () => RA<BlueskySavedFeeds, BlueskyClientError>;
  getFeedPosts: (
    input: Readonly<{ uri: string; cursor: string | undefined }>,
  ) => RA<BlueskyFeedPostsPage, BlueskyClientError>;
  getFeedInfo: (uri: string) => RA<BlueskySavedFeed, BlueskyClientError>;
  getListMembers: (
    input: Readonly<{ uri: string; cursor: string | undefined }>,
  ) => RA<BlueskyListMembersPage, BlueskyClientError>;
  getActorFeeds: (
    input: Readonly<{ actor: string; cursor: string | undefined }>,
  ) => RA<BlueskyFeedsPage, BlueskyClientError>;
  getActorLists: (
    input: Readonly<{ actor: string; cursor: string | undefined }>,
  ) => RA<BlueskyFeedsPage, BlueskyClientError>;
  resolveHandle: (handle: string) => RA<string, BlueskyClientError>;
}>;

export type BlueskyFeedNotFound = Readonly<{ type: 'BlueskyFeedNotFound' }>;

const NOT_FOUND_CODES: readonly string[] = ['InvalidRequest', 'UnknownList', 'UnknownFeed', 'NotFound'];

export const isBlueskyFeedNotFound = (error: BlueskyClientError): boolean =>
  error.kind === 'http'
  && (error.status === 404 || error.status === 400 && error.code !== undefined && NOT_FOUND_CODES.includes(error.code));
