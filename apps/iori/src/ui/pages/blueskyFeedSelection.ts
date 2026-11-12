import type { BlueskySavedFeedView } from '../api/blueskyFeedClient.ts';

export const feedUriOfSearch = (search: string): string | undefined => {
  const value = new URLSearchParams(search).get('uri');
  return value === null || value === '' ? undefined : value;
};

export const withFeedUri = (search: string, uri: string): string => {
  const params = new URLSearchParams(search);
  params.set('uri', uri);
  return `?${params.toString()}`;
};

export const selectedFeedOf = (
  feeds: readonly BlueskySavedFeedView[],
  uri: string | undefined,
): BlueskySavedFeedView | undefined => feeds.find((feed) => feed.uri === uri) ?? feeds[0];

export const fallbackFeedUriOf = (
  feeds: readonly BlueskySavedFeedView[],
  uri: string | undefined,
): string | undefined => {
  if (uri === undefined || feeds.length === 0) return undefined;
  return feeds.some((feed) => feed.uri === uri) ? undefined : feeds[0].uri;
};
