import type { RA } from '@iwasa-kosui/result';

import type { BlueskyFetchedTimelineItem } from '../domain/blueskyTimeline/blueskyTimelineItem.ts';
import type { BlueskyClientError } from './blueskyClient.ts';

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

export type BlueskyAuthorFeedPage = Readonly<{
  items: readonly BlueskyFetchedTimelineItem[];
  cursor: string | undefined;
}>;

export type BlueskyProfileReader = Readonly<{
  getProfile: (actor: string) => RA<BlueskyProfile, BlueskyClientError>;
  getAuthorFeed: (
    input: Readonly<{ actor: string; cursor: string | undefined }>,
  ) => RA<BlueskyAuthorFeedPage, BlueskyClientError>;
}>;

export type BlueskyProfileNotFound = Readonly<{ type: 'BlueskyProfileNotFound' }>;

const UNAVAILABLE_ACCOUNT_CODES: readonly string[] = ['AccountTakedown', 'AccountDeactivated'];

export const isBlueskyProfileNotFound = (error: BlueskyClientError): boolean =>
  error.kind === 'http'
  && (error.code !== undefined && UNAVAILABLE_ACCOUNT_CODES.includes(error.code)
    || error.status === 400 && error.code === 'InvalidRequest');
