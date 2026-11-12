export type BookmarksSource = 'fediverse' | 'bluesky';

export const BOOKMARKS_SOURCE_TABS: readonly Readonly<{ source: BookmarksSource; label: string }>[] = [
  { source: 'fediverse', label: 'Fediverse' },
  { source: 'bluesky', label: 'Bluesky' },
];

export const parseBookmarksSource = (search: string): BookmarksSource => {
  const value = new URLSearchParams(search).get('source');
  return BOOKMARKS_SOURCE_TABS.find((tab) => tab.source === value)?.source ?? 'fediverse';
};

export const withBookmarksSource = (search: string, source: BookmarksSource): string => {
  const params = new URLSearchParams(search);
  if (source === 'fediverse') params.delete('source');
  else params.set('source', source);
  const next = params.toString();
  return next === '' ? '' : `?${next}`;
};

export const resolveBookmarksSource = (
  source: BookmarksSource,
  blueskyEnabled: boolean | undefined,
): BookmarksSource | 'pending' => {
  if (source !== 'bluesky') return source;
  if (blueskyEnabled === undefined) return 'pending';
  return blueskyEnabled ? 'bluesky' : 'fediverse';
};
