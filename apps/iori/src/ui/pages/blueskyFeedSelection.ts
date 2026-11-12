import { blueskyFeedKindOf } from '../../domain/blueskyFeed/blueskyFeedUri.ts';
import type { BlueskySavedFeedView } from '../api/blueskyFeedClient.ts';

export type BlueskyFeedView = 'posts' | 'members';

export const feedUriOfSearch = (search: string): string | undefined => {
  const value = new URLSearchParams(search).get('uri');
  return value === null || value === '' ? undefined : value;
};

export const withFeedUri = (search: string, uri: string): string => {
  const params = new URLSearchParams(search);
  params.set('uri', uri);
  return `?${params.toString()}`;
};

export const feedViewOfSearch = (search: string): BlueskyFeedView =>
  new URLSearchParams(search).get('view') === 'members' ? 'members' : 'posts';

export const withFeedView = (search: string, view: BlueskyFeedView): string => {
  const params = new URLSearchParams(search);
  if (view === 'members') params.set('view', 'members');
  else params.delete('view');
  const query = params.toString();
  return query === '' ? '' : `?${query}`;
};

export const selectedFeedOf = (
  feeds: readonly BlueskySavedFeedView[],
  uri: string | undefined,
): BlueskySavedFeedView | undefined => feeds.find((feed) => feed.uri === uri) ?? feeds[0];

export const unsavedFeedUriOf = (
  feeds: readonly BlueskySavedFeedView[],
  uri: string | undefined,
): string | undefined =>
  uri !== undefined && blueskyFeedKindOf(uri) !== undefined && !feeds.some((feed) => feed.uri === uri)
    ? uri
    : undefined;

export const shownFeedsOf = (
  feeds: readonly BlueskySavedFeedView[],
  unsaved: BlueskySavedFeedView | undefined,
): readonly BlueskySavedFeedView[] =>
  unsaved === undefined || feeds.some((feed) => feed.uri === unsaved.uri) ? feeds : [unsaved, ...feeds];

export const fallbackFeedUriOf = (
  feeds: readonly BlueskySavedFeedView[],
  uri: string | undefined,
): string | undefined => {
  if (uri === undefined || feeds.length === 0) return undefined;
  if (feeds.some((feed) => feed.uri === uri) || blueskyFeedKindOf(uri) !== undefined) return undefined;
  return feeds[0].uri;
};
