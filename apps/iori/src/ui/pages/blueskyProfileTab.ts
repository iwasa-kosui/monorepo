export type BlueskyProfileTab = 'posts' | 'feeds' | 'lists' | 'follows' | 'followers';

export type BlueskyFollowListKind = 'follows' | 'followers';

export const isBlueskyFollowListTab = (tab: BlueskyProfileTab): tab is BlueskyFollowListKind =>
  tab === 'follows' || tab === 'followers';

export const profileTabOfSearch = (search: string): BlueskyProfileTab => {
  const tab = new URLSearchParams(search).get('tab');
  return tab === 'follows' || tab === 'followers' ? tab : 'posts';
};

export const withProfileTab = (search: string, tab: BlueskyProfileTab): string => {
  const params = new URLSearchParams(search);
  if (isBlueskyFollowListTab(tab)) params.set('tab', tab);
  else params.delete('tab');
  const query = params.toString();
  return query === '' ? '' : `?${query}`;
};
