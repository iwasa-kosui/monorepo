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

export const blueskySearchErrorMessage = (status: number | undefined, code?: string): string => {
  switch (status) {
    case 400:
      return '検索語は300文字までです';
    case 403:
      return 'この検索はオーナーだけが使えます';
    case 409:
      return 'Bluesky のタイムラインが無効です';
    case 429:
      return 'Bluesky の検索の上限に達しました。しばらく待ってからもう一度お試しください';
    case 502:
      return code === 'auth' ? 'Bluesky にログインできませんでした' : 'Bluesky を検索できませんでした';
    default:
      return 'Bluesky を検索できませんでした';
  }
};

export const shouldRerunIoriSearch = (submittedQuery: string, lastIoriQuery: string | undefined): boolean =>
  submittedQuery !== '' && submittedQuery !== lastIoriQuery;
