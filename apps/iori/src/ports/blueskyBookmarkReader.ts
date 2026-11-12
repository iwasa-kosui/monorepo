import type { RA } from '@iwasa-kosui/result';

import type { BlueskyFetchedTimelineItem } from '../domain/blueskyTimeline/blueskyTimelineItem.ts';
import type { BlueskyClientError } from './blueskyClient.ts';

export type BlueskyBookmarksPage = Readonly<{
  items: readonly BlueskyFetchedTimelineItem[];
  cursor: string | undefined;
}>;

export type BlueskyBookmarkReader = Readonly<{
  getBookmarks: (input: Readonly<{ cursor: string | undefined }>) => RA<BlueskyBookmarksPage, BlueskyClientError>;
}>;

export const BLUESKY_BAD_TOKEN_SCOPE = 'Bad token scope';

const BOOKMARK_UNAVAILABLE_STATUSES: readonly number[] = [401, 403, 501];
const BOOKMARK_UNAVAILABLE_CODES: readonly string[] = ['MethodNotImplemented', 'Forbidden', 'Unauthorized'];
export const BLUESKY_BOOKMARK_LOGIN_CODES: readonly string[] = [
  'ExpiredToken',
  'InvalidToken',
  'AuthRequired',
  'AuthenticationRequired',
  'AuthMissing',
];

const isBadTokenScope = (error: BlueskyClientError): boolean =>
  error.code === 'InvalidToken' && error.message.includes(BLUESKY_BAD_TOKEN_SCOPE);

export const isBlueskyBookmarkUnavailable = (error: BlueskyClientError): boolean =>
  (error.kind === 'auth' || error.kind === 'http')
  && (isBadTokenScope(error)
    || (error.code === undefined || !BLUESKY_BOOKMARK_LOGIN_CODES.includes(error.code))
      && (error.status !== undefined && BOOKMARK_UNAVAILABLE_STATUSES.includes(error.status)
        || error.code !== undefined && BOOKMARK_UNAVAILABLE_CODES.includes(error.code)));
