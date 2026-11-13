import type { BlueskyAuthorFeedFilter } from '../../ports/blueskyProfileReader.ts';

export type BlueskyProfileTab =
  | 'posts'
  | 'replies'
  | 'media'
  | 'videos'
  | 'feeds'
  | 'lists'
  | 'follows'
  | 'followers';

export type BlueskyFollowListKind = 'follows' | 'followers';

export const isBlueskyFollowListTab = (tab: BlueskyProfileTab): tab is BlueskyFollowListKind =>
  tab === 'follows' || tab === 'followers';

const AUTHOR_FEED_FILTER_OF_TAB: Readonly<Partial<Record<BlueskyProfileTab, BlueskyAuthorFeedFilter>>> = {
  posts: 'posts_and_author_threads',
  replies: 'posts_with_replies',
  media: 'posts_with_media',
  videos: 'posts_with_video',
};

export const authorFeedFilterOfTab = (tab: BlueskyProfileTab): BlueskyAuthorFeedFilter | undefined =>
  AUTHOR_FEED_FILTER_OF_TAB[tab];

const isUrlTab = (tab: BlueskyProfileTab): boolean => tab !== 'posts' && tab !== 'feeds' && tab !== 'lists';

export const profileTabOfSearch = (search: string): BlueskyProfileTab => {
  const tab = new URLSearchParams(search).get('tab');
  return tab === 'follows' || tab === 'followers' || tab === 'replies' || tab === 'media' || tab === 'videos'
    ? tab
    : 'posts';
};

export const withProfileTab = (search: string, tab: BlueskyProfileTab): string => {
  const params = new URLSearchParams(search);
  if (isUrlTab(tab)) params.set('tab', tab);
  else params.delete('tab');
  const query = params.toString();
  return query === '' ? '' : `?${query}`;
};
