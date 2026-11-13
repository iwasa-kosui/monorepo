import { describe, expect, it } from 'vitest';

import { isBlueskyFollowListTab, profileTabOfSearch, withProfileTab } from './blueskyProfileTab.ts';

describe('profileTabOfSearch', () => {
  it('tab が follows と followers のときだけ、そのタブにする', () => {
    expect(profileTabOfSearch('?tab=follows')).toBe('follows');
    expect(profileTabOfSearch('?tab=followers')).toBe('followers');
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

  it('それ以外のタブでは tab を付けず、付いていれば外す', () => {
    expect(withProfileTab('', 'posts')).toBe('');
    expect(withProfileTab('', 'feeds')).toBe('');
    expect(withProfileTab('?tab=follows', 'lists')).toBe('');
    expect(withProfileTab('?a=1&tab=followers', 'posts')).toBe('?a=1');
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
