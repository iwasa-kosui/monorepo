import { describe, expect, it } from 'vitest';

import { deriveBlueskyLikeRkey } from './blueskyLike.ts';

const TID_PATTERN = /^[234567abcdefghij][234567abcdefghijklmnopqrstuvwxyz]{12}$/;

describe('deriveBlueskyLikeRkey', () => {
  it('TID の形式になる', async () => {
    for (
      const uri of ['at://did:plc:a/app.bsky.feed.post/1', 'at://did:plc:b/app.bsky.feed.post/3kabc', '', '日本語']
    ) {
      expect(await deriveBlueskyLikeRkey(uri)).toMatch(TID_PATTERN);
    }
  });

  it('同じ uri からは同じ rkey になり、別の uri からは別の rkey になる', async () => {
    const uri = 'at://did:plc:a/app.bsky.feed.post/1';

    expect(await deriveBlueskyLikeRkey(uri)).toBe(await deriveBlueskyLikeRkey(uri));
    expect(await deriveBlueskyLikeRkey(uri)).not.toBe(
      await deriveBlueskyLikeRkey('at://did:plc:a/app.bsky.feed.post/2'),
    );
  });

  it('SHA-256 の先頭 8 バイトの下位 60 ビットを base32-sortable で 13 文字にしたものになる', async () => {
    expect(await deriveBlueskyLikeRkey('at://did:plc:a/app.bsky.feed.post/1')).toBe('2l7wuzhinqbge');
  });
});
