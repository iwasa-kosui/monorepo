import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import type { BlueskyProfile } from '../api/blueskyProfileClient.ts';
import { BlueskyProfilePage } from './blueskyProfile.tsx';

const profile = (overrides: Partial<BlueskyProfile> = {}): BlueskyProfile => ({
  did: 'did:plc:alice',
  handle: 'alice.bsky.social',
  displayName: 'Alice',
  description: 'hello\nworld',
  avatar: 'https://cdn.example/avatar.jpg',
  banner: 'https://cdn.example/banner.jpg',
  followersCount: 3,
  followsCount: 2,
  postsCount: 1,
  following: false,
  followedBy: false,
  isSelf: false,
  followUri: null,
  ...overrides,
});

const render = (
  overrides: Partial<BlueskyProfile> = {},
  props: Partial<Parameters<typeof BlueskyProfilePage>[0]> = {},
): string =>
  String(jsx(BlueskyProfilePage, {
    profile: profile(overrides),
    items: [],
    feedNotice: null,
    isFeedLoading: false,
    isFollowing: false,
    isTogglingFollow: false,
    moderation: null,
    isTogglingMute: false,
    isTogglingBlock: false,
    isOpeningMessage: false,
    messageError: null,
    onFollow: async () => {},
    onUnfollow: async () => {},
    onMute: async () => {},
    onUnmute: async () => {},
    onBlock: async () => {},
    onUnblock: async () => {},
    onReport: () => {},
    onMessage: async () => {},
    ...props,
  }));

describe('BlueskyProfilePage', () => {
  it('自己紹介を HTML として挿入しない', () => {
    const html = render({ description: '<img src=x onerror=alert(1)>' });

    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img src=x');
  });
});
