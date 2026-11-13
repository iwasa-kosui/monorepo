import type { RA } from '@iwasa-kosui/result';

import type { BlueskyFetchedTimelineItem } from '../domain/blueskyTimeline/blueskyTimelineItem.ts';
import type { BlueskyClientError } from './blueskyClient.ts';
import type { BlueskyListMembersPage } from './blueskyFeedReader.ts';

export type BlueskyProfile = Readonly<{
  did: string;
  handle: string;
  displayName: string | null;
  description: string | null;
  avatar: string | null;
  banner: string | null;
  followersCount: number;
  followsCount: number;
  postsCount: number;
  viewerFollowingUri: string | undefined;
  viewerFollowedBy: boolean;
}>;

export const BLUESKY_AUTHOR_FEED_FILTERS = [
  'posts_and_author_threads',
  'posts_with_replies',
  'posts_with_media',
  'posts_with_video',
] as const;

export type BlueskyAuthorFeedFilter = typeof BLUESKY_AUTHOR_FEED_FILTERS[number];

export const isBlueskyAuthorFeedFilter = (value: string): value is BlueskyAuthorFeedFilter =>
  (BLUESKY_AUTHOR_FEED_FILTERS as readonly string[]).includes(value);

export type BlueskyAuthorFeedPage = Readonly<{
  items: readonly BlueskyFetchedTimelineItem[];
  cursor: string | undefined;
  unavailable: 'blocked' | null;
}>;

export type BlueskyActorLikesPage = Readonly<{
  items: readonly BlueskyFetchedTimelineItem[];
  cursor: string | undefined;
}>;

export type BlueskyProfileReader = Readonly<{
  getProfile: (actor: string) => RA<BlueskyProfile, BlueskyClientError>;
  getAuthorFeed: (
    input: Readonly<{ actor: string; cursor: string | undefined; filter: BlueskyAuthorFeedFilter }>,
  ) => RA<BlueskyAuthorFeedPage, BlueskyClientError>;
  getActorLikes: (
    input: Readonly<{ actor: string; cursor: string | undefined }>,
  ) => RA<BlueskyActorLikesPage, BlueskyClientError>;
  getFollows: (
    input: Readonly<{ actor: string; cursor: string | undefined }>,
  ) => RA<BlueskyListMembersPage, BlueskyClientError>;
  getFollowers: (
    input: Readonly<{ actor: string; cursor: string | undefined }>,
  ) => RA<BlueskyListMembersPage, BlueskyClientError>;
}>;

const BLOCKED_ACTOR_CODES: readonly string[] = ['BlockedActor', 'BlockedByActor'];

export const isBlueskyActorBlocked = (error: BlueskyClientError): boolean =>
  error.kind === 'http' && error.status === 400 && error.code !== undefined && BLOCKED_ACTOR_CODES.includes(error.code);

export type BlueskyProfileNotFound = Readonly<{ type: 'BlueskyProfileNotFound' }>;

const UNAVAILABLE_ACCOUNT_CODES: readonly string[] = ['AccountTakedown', 'AccountDeactivated'];

export const isBlueskyProfileNotFound = (error: BlueskyClientError): boolean =>
  error.kind === 'http'
  && (error.code !== undefined && UNAVAILABLE_ACCOUNT_CODES.includes(error.code)
    || error.status === 400 && error.code === 'InvalidRequest');
