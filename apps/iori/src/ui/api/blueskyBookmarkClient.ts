import type {
  IoriBlueskyBookmarkResponse,
  IoriBlueskyBookmarksResponse,
} from '../../adaptor/routes/workerIoriBlueskyBookmarkRouter.ts';
import {
  BLUESKY_LOGIN_FAILED_ERROR,
  blueskyFailureMessage,
  failureMessage,
  isMastodonApiError,
  requestUrl,
  toApiError,
} from './mastodonClient.ts';

export type BlueskyBookmarksPage = IoriBlueskyBookmarksResponse;

const BOOKMARKS_PATH = '/api/iori/v1/bluesky/bookmarks';

export const BLUESKY_BOOKMARKS_UNAVAILABLE_ERROR = 'Bluesky bookmarks unavailable';

const BOOKMARKS_UNAVAILABLE_MESSAGE =
  'Bluesky のブックマークを使えませんでした。アプリパスワードでは使えない可能性があります';
const BOOKMARKS_DISABLED_MESSAGE = 'Bluesky 連携が無効です';
const BOOKMARKS_LOAD_FAILED_MESSAGE = 'Bluesky のブックマークを読み込めませんでした';

const send = async (method: 'POST' | 'DELETE', url: string, body?: unknown): Promise<IoriBlueskyBookmarkResponse> => {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!res.ok) throw await toApiError(res);
  return await res.json() as IoriBlueskyBookmarkResponse;
};

export const fetchBlueskyBookmarks = async (cursor?: string): Promise<BlueskyBookmarksPage> => {
  const res = await fetch(requestUrl(BOOKMARKS_PATH, { cursor }), {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  });
  if (!res.ok) throw await toApiError(res);
  return await res.json() as BlueskyBookmarksPage;
};

export const bookmarkBlueskyPost = (feedItemId: string): Promise<IoriBlueskyBookmarkResponse> =>
  send('POST', BOOKMARKS_PATH, { feedItemId });

export const unbookmarkBlueskyPost = (feedItemId: string): Promise<IoriBlueskyBookmarkResponse> =>
  send('DELETE', requestUrl(BOOKMARKS_PATH, { feedItemId }));

export const bookmarkBlueskyPostByUri = (uri: string): Promise<IoriBlueskyBookmarkResponse> =>
  send('POST', BOOKMARKS_PATH, { uri });

export const unbookmarkBlueskyPostByUri = (uri: string): Promise<IoriBlueskyBookmarkResponse> =>
  send('DELETE', requestUrl(BOOKMARKS_PATH, { uri }));

const bookmarkKnownMessage = (error: unknown): string | undefined => {
  if (!isMastodonApiError(error)) return undefined;
  if (error.message === BLUESKY_BOOKMARKS_UNAVAILABLE_ERROR) return BOOKMARKS_UNAVAILABLE_MESSAGE;
  if (error.status === 409) return BOOKMARKS_DISABLED_MESSAGE;
  return error.message === BLUESKY_LOGIN_FAILED_ERROR ? blueskyFailureMessage('', error) : undefined;
};

export const blueskyBookmarkFailureMessage = (action: string, error: unknown): string =>
  bookmarkKnownMessage(error) ?? failureMessage(action, error);

export const blueskyBookmarksLoadErrorMessage = (error: unknown): string =>
  bookmarkKnownMessage(error) ?? BOOKMARKS_LOAD_FAILED_MESSAGE;
