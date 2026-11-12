export type LikedPostsSource = 'fediverse' | 'bluesky';

export const LIKED_POSTS_SOURCE_TABS: readonly Readonly<{ source: LikedPostsSource; label: string }>[] = [
  { source: 'fediverse', label: 'Fediverse' },
  { source: 'bluesky', label: 'Bluesky' },
];

export const parseLikedPostsSource = (search: string): LikedPostsSource => {
  const value = new URLSearchParams(search).get('source');
  return LIKED_POSTS_SOURCE_TABS.find((tab) => tab.source === value)?.source ?? 'fediverse';
};

export const withLikedPostsSource = (search: string, source: LikedPostsSource): string => {
  const params = new URLSearchParams(search);
  if (source === 'fediverse') params.delete('source');
  else params.set('source', source);
  const next = params.toString();
  return next === '' ? '' : `?${next}`;
};
