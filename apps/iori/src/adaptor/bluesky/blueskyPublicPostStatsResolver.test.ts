import { RA } from '@iwasa-kosui/result';
import { describe, expect, it } from 'vitest';

import { createBlueskyPublicPostStatsResolver, GET_POSTS_MAX_URIS } from './blueskyPublicPostStatsResolver.ts';

const uri = (n: number) => `at://did:plc:alice/app.bsky.feed.post/${n}`;

describe('createBlueskyPublicPostStatsResolver', () => {
  it('getPosts の上限ごとに分けて読み、読めなかった分は除いて残りを返す', async () => {
    const requested: string[][] = [];
    const resolver = createBlueskyPublicPostStatsResolver({
      safeFetcher: {
        fetchText: async (url) => {
          const uris = new URL(url).searchParams.getAll('uris');
          requested.push(uris);
          if (requested.length === 2) {
            return RA.err({ type: 'SafeFetchError', reason: 'timeout', message: 'timeout' });
          }
          const posts = uris.map((value) => ({ uri: value, likeCount: 3, repostCount: -1 }));
          return RA.ok({ status: 200, body: JSON.stringify({ posts }), etag: null, lastModified: null, finalUrl: url });
        },
      },
    });
    const uris = Array.from({ length: GET_POSTS_MAX_URIS + 1 }, (_, n) => uri(n));

    const stats = await resolver.resolve(uris);

    expect(requested.map((batch) => batch.length)).toEqual([GET_POSTS_MAX_URIS, 1]);
    expect(stats.val.size).toBe(GET_POSTS_MAX_URIS);
    // 壊れた数は 0 として扱う
    expect(stats.val.get(uri(0))).toEqual({ uri: uri(0), likeCount: 3, repostCount: 0, replyCount: 0, quoteCount: 0 });
  });
});
