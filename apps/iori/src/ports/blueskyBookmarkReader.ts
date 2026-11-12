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

const BOOKMARK_UNAVAILABLE_STATUSES: readonly number[] = [401, 403, 501];
const BOOKMARK_UNAVAILABLE_CODES: readonly string[] = ['MethodNotImplemented', 'Forbidden', 'Unauthorized'];
const BOOKMARK_LOGIN_CODES: readonly string[] = [
  'ExpiredToken',
  'InvalidToken',
  'AuthRequired',
  'AuthenticationRequired',
  'AuthMissing',
];

export const isBlueskyBookmarkUnavailable = (error: BlueskyClientError): boolean =>
  (error.kind === 'auth' || error.kind === 'http')
  && (error.code === undefined || !BOOKMARK_LOGIN_CODES.includes(error.code))
  && (error.status !== undefined && BOOKMARK_UNAVAILABLE_STATUSES.includes(error.status)
    || error.code !== undefined && BOOKMARK_UNAVAILABLE_CODES.includes(error.code));
