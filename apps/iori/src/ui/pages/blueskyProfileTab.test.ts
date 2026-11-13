import { describe, expect, it } from 'vitest';

import {
  authorFeedFilterOfTab,
  isBlueskyFollowListTab,
  profileTabOfSearch,
  withProfileTab,
} from './blueskyProfileTab.ts';

describe('profileTabOfSearch', () => {
  it('tab が follows・followers・replies・media・videos のときだけ、そのタブにする', () => {
    expect(profileTabOfSearch('?tab=follows')).toBe('follows');
    expect(profileTabOfSearch('?tab=followers')).toBe('followers');
    expect(profileTabOfSearch('?tab=replies')).toBe('replies');
    expect(profileTabOfSearch('?tab=media')).toBe('media');
    expect(profileTabOfSearch('?tab=videos')).toBe('videos');
  });

  it('tab が無いか、ほかの値のときは投稿にする', () => {
    expect(profileTabOfSearch('')).toBe('posts');
    expect(profileTabOfSearch('?tab=feeds')).toBe('posts');
    expect(profileTabOfSearch('?tab=lists')).toBe('posts');
    expect(profileTabOfSearch('?tab=unknown')).toBe('posts');
  });
});

describe('withProfileTab', () => {
  it('follows と followers のときは tab を付け、ほかのクエリは残す', () => {
    expect(withProfileTab('', 'follows')).toBe('?tab=follows');
    expect(withProfileTab('?tab=follows', 'followers')).toBe('?tab=followers');
    expect(withProfileTab('?a=1', 'followers')).toBe('?a=1&tab=followers');
  });

  it('replies・media・videos のときも tab を付け、ほかのクエリは残す', () => {
    expect(withProfileTab('', 'replies')).toBe('?tab=replies');
    expect(withProfileTab('?tab=follows', 'media')).toBe('?tab=media');
    expect(withProfileTab('?a=1', 'videos')).toBe('?a=1&tab=videos');
  });

  it('それ以外のタブでは tab を付けず、付いていれば外す', () => {
    expect(withProfileTab('', 'posts')).toBe('');
    expect(withProfileTab('', 'feeds')).toBe('');
    expect(withProfileTab('?tab=follows', 'lists')).toBe('');
    expect(withProfileTab('?a=1&tab=followers', 'posts')).toBe('?a=1');
    expect(withProfileTab('?tab=replies', 'feeds')).toBe('');
  });
});

describe('isBlueskyFollowListTab', () => {
  it('follows と followers だけを一覧のタブとみなす', () => {
    expect(isBlueskyFollowListTab('follows')).toBe(true);
    expect(isBlueskyFollowListTab('followers')).toBe(true);
    expect(isBlueskyFollowListTab('posts')).toBe(false);
    expect(isBlueskyFollowListTab('feeds')).toBe(false);
  });
});

describe('authorFeedFilterOfTab', () => {
  it('投稿系のタブを getAuthorFeed の filter に対応させる', () => {
    expect(authorFeedFilterOfTab('posts')).toBe('posts_and_author_threads');
    expect(authorFeedFilterOfTab('replies')).toBe('posts_with_replies');
    expect(authorFeedFilterOfTab('media')).toBe('posts_with_media');
    expect(authorFeedFilterOfTab('videos')).toBe('posts_with_video');
  });

  it('投稿系以外のタブは undefined にする', () => {
    expect(authorFeedFilterOfTab('feeds')).toBeUndefined();
    expect(authorFeedFilterOfTab('lists')).toBeUndefined();
    expect(authorFeedFilterOfTab('follows')).toBeUndefined();
    expect(authorFeedFilterOfTab('followers')).toBeUndefined();
  });
});
