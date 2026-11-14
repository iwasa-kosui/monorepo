import { describe, expect, it } from 'vitest';

import { profileTabOfSearch, withProfileTab } from './blueskyProfileTab.ts';

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

  it('それ以外のタブでは tab を付けず、付いていれば外す', () => {
    expect(withProfileTab('', 'posts')).toBe('');
    expect(withProfileTab('', 'feeds')).toBe('');
    expect(withProfileTab('?tab=follows', 'lists')).toBe('');
    expect(withProfileTab('?a=1&tab=followers', 'posts')).toBe('?a=1');
    expect(withProfileTab('?tab=replies', 'feeds')).toBe('');
  });
});
