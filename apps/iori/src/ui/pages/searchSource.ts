export type SearchSource = 'iori' | 'bluesky-posts' | 'bluesky-actors';

export const SEARCH_SOURCE_TABS: readonly Readonly<{ source: SearchSource; label: string }>[] = [
  { source: 'iori', label: 'iori' },
  { source: 'bluesky-posts', label: 'Bluesky の投稿' },
  { source: 'bluesky-actors', label: 'Bluesky の人' },
];

export const parseSearchSource = (search: string): SearchSource => {
  const value = new URLSearchParams(search).get('source');
  return SEARCH_SOURCE_TABS.find((tab) => tab.source === value)?.source ?? 'iori';
};

export const withSearchSource = (search: string, source: SearchSource): string => {
  const params = new URLSearchParams(search);
  if (source === 'iori') params.delete('source');
  else params.set('source', source);
  const next = params.toString();
  return next === '' ? '' : `?${next}`;
};

export const blueskySearchErrorMessage = (status: number | undefined): string =>
  status === 409 ? 'Bluesky のタイムラインが無効です' : 'Bluesky を検索できませんでした';
