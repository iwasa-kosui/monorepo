import { describe, expect, it } from 'vitest';

import { deriveBlueskyLikeRkey } from './blueskyLike.ts';
import { blueskyRepostRkey, deriveBlueskyRepostRkey } from './blueskyRepost.ts';

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

describe('deriveBlueskyRepostRkey', () => {
  it('いいねと同じ計算で、投稿の uri から決定的な rkey を作る', async () => {
    const uri = 'at://did:plc:a/app.bsky.feed.post/1';

    expect(await deriveBlueskyRepostRkey(uri)).toBe('2l7wuzhinqbge');
    expect(await deriveBlueskyRepostRkey(uri)).toBe(await deriveBlueskyLikeRkey(uri));
  });
});
