import { describe, expect, it } from 'vitest';

import { blueskyRepostRkey } from './blueskyRepost.ts';

describe('blueskyRepostRkey', () => {
  it('app.bsky.feed.repost の at uri から rkey を取り出す', () => {
    expect(blueskyRepostRkey('at://did:plc:me/app.bsky.feed.repost/3kabc')).toBe('3kabc');
  });

  it('別の collection、rkey の欠落、余分な区切りは受け入れない', () => {
    expect(blueskyRepostRkey('at://did:plc:me/app.bsky.feed.like/3kabc')).toBeUndefined();
    expect(blueskyRepostRkey('at://did:plc:me/app.bsky.feed.repost/')).toBeUndefined();
    expect(blueskyRepostRkey('at://did:plc:me/app.bsky.feed.repost/3kabc/extra')).toBeUndefined();
    expect(blueskyRepostRkey('https://example.com/app.bsky.feed.repost/3kabc')).toBeUndefined();
    expect(blueskyRepostRkey('')).toBeUndefined();
  });
});
