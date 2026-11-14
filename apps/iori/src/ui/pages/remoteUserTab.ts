import type { RemoteFollowListKind } from '../api/mastodonClient.ts';

export type RemoteUserTab = 'posts' | RemoteFollowListKind;

export const isRemoteFollowListTab = (tab: RemoteUserTab): tab is RemoteFollowListKind =>
  tab === 'following' || tab === 'followers';

export const remoteUserTabOfSearch = (search: string): RemoteUserTab => {
  const tab = new URLSearchParams(search).get('tab');
  return tab === 'following' || tab === 'followers' ? tab : 'posts';
};

export const withRemoteUserTab = (search: string, tab: RemoteUserTab): string => {
  const params = new URLSearchParams(search);
  if (tab === 'posts') params.delete('tab');
  else params.set('tab', tab);
  const query = params.toString();
  return query === '' ? '' : `?${query}`;
};
