import { describe, expect, it } from 'vitest';

import { isRemoteFollowListTab, remoteUserTabOfSearch, withRemoteUserTab } from './remoteUserTab.ts';

describe('remoteUserTabOfSearch', () => {
  it('tab がフォローかフォロワーならそのタブにし、それ以外は投稿にする', () => {
    expect(remoteUserTabOfSearch('?tab=following')).toBe('following');
    expect(remoteUserTabOfSearch('?tab=followers')).toBe('followers');
    expect(remoteUserTabOfSearch('?tab=media')).toBe('posts');
    expect(remoteUserTabOfSearch('')).toBe('posts');
  });
});

describe('withRemoteUserTab', () => {
  it('投稿のタブでは tab を消し、他のクエリは残す', () => {
    expect(withRemoteUserTab('?tab=followers&x=1', 'posts')).toBe('?x=1');
    expect(withRemoteUserTab('?tab=followers', 'posts')).toBe('');
  });

  it('フォローとフォロワーのタブでは tab を付ける', () => {
    expect(withRemoteUserTab('', 'following')).toBe('?tab=following');
    expect(withRemoteUserTab('?tab=following', 'followers')).toBe('?tab=followers');
  });
});

describe('isRemoteFollowListTab', () => {
  it('フォローとフォロワーだけを一覧のタブとみなす', () => {
    expect(isRemoteFollowListTab('following')).toBe(true);
    expect(isRemoteFollowListTab('followers')).toBe(true);
    expect(isRemoteFollowListTab('posts')).toBe(false);
  });
});
