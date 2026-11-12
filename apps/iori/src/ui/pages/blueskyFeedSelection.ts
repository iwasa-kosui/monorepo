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
