import { describe, expect, it } from 'vitest';

import { Instant } from '../instant/instant.ts';
import { PostId } from '../post/postId.ts';
import { blueskyRkeyOf } from './blueskyRkey.ts';

const TID_PATTERN = /^[234567abcdefghij][234567abcdefghijklmnopqrstuvwxyz]{12}$/;

describe('blueskyRkeyOf', () => {
  it('app.bsky.feed.post の record key として有効な TID の形式になる', () => {
    for (const createdAt of [0, 1, Date.UTC(2026, 10, 8, 11), Date.UTC(2200, 0, 1)]) {
      const rkey = blueskyRkeyOf({ postId: PostId.generate(), createdAt: Instant.orThrow(createdAt) });
      expect(rkey).toMatch(TID_PATTERN);
    }
  });

  it('同じ入力からは同じ rkey になる', () => {
    const postId = PostId.generate();
    const createdAt = Instant.orThrow(Date.UTC(2026, 10, 8, 11));
    expect(blueskyRkeyOf({ postId, createdAt })).toBe(blueskyRkeyOf({ postId, createdAt }));
  });

  it('createdAt が進むと辞書順で後になり、postId が違えば同じ時刻でも別の rkey になる', () => {
    const postId = PostId.generate();
    const earlier = blueskyRkeyOf({ postId, createdAt: Instant.orThrow(Date.UTC(2026, 10, 8, 11)) });
    const later = blueskyRkeyOf({ postId, createdAt: Instant.orThrow(Date.UTC(2026, 10, 8, 11, 0, 1)) });
    expect(earlier < later).toBe(true);

    const createdAt = Instant.orThrow(Date.UTC(2026, 10, 8, 11));
    const rkeys = new Set(Array.from({ length: 50 }, () => blueskyRkeyOf({ postId: PostId.generate(), createdAt })));
    expect(rkeys.size).toBeGreaterThan(40);
  });

  it('固定の入力に対する値が変わらない', () => {
    const postId = '00000000-0000-4000-8000-000000000001' as PostId;
    expect(blueskyRkeyOf({ postId, createdAt: Instant.orThrow(1_000) })).toBe('2222222ykm2h4');
  });
});
