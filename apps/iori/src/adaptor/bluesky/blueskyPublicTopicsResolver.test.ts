import { RA } from '@iwasa-kosui/result';
import { describe, expect, it } from 'vitest';

import type { SafeFetcher } from '../http/safeFetch.ts';
import {
  createBlueskyPublicTrendPostsResolver,
  createBlueskyPublicTrendsResolver,
} from './blueskyPublicTopicsResolver.ts';

const respond = (body: unknown, requested: string[] = []): Pick<SafeFetcher, 'fetchText'> => ({
  fetchText: async (url) => {
    requested.push(url);
    return RA.ok({ status: 200, body: JSON.stringify(body), etag: null, lastModified: null, finalUrl: url });
  },
});

describe('createBlueskyPublicTrendsResolver', () => {
  it('話題のフィードの URI を作り、壊れた項目は読み飛ばす', async () => {
    const resolver = createBlueskyPublicTrendsResolver({
      safeFetcher: respond({
        trends: [
          {
            topic: '1a9a958ef75e',
            displayName: 'Historical dramas',
            description: 'People pick eras.',
            link: '/profile/did:plc:qrz3lhbyuxbeilrc6nekdqme/feed/1a9a958ef75e',
            postCount: 629,
            status: 'hot',
            category: 'entertainment',
          },
          { topic: 'broken' },
          { topic: 'nolink', displayName: 'No link', postCount: -1 },
        ],
      }),
    });

    const trends = await resolver.resolve(10);

    expect(trends.val).toEqual([
      {
        topic: '1a9a958ef75e',
        displayName: 'Historical dramas',
        description: 'People pick eras.',
        postCount: 629,
        status: 'hot',
        category: 'entertainment',
        feedUri: 'at://did:plc:qrz3lhbyuxbeilrc6nekdqme/app.bsky.feed.generator/1a9a958ef75e',
      },
      {
        topic: 'nolink',
        displayName: 'No link',
        description: null,
        postCount: null,
        status: null,
        category: null,
        feedUri: null,
      },
    ]);
  });

  it('AppView が読めなければ、話題が無いものとして扱う', async () => {
    const resolver = createBlueskyPublicTrendsResolver({
      safeFetcher: { fetchText: async () => RA.err({ type: 'SafeFetchError', reason: 'timeout', message: 'timeout' }) },
    });

    expect((await resolver.resolve(10)).val).toEqual([]);
  });
});

describe('createBlueskyPublicTrendPostsResolver', () => {
  it('フィードの投稿を bsky.app の URL つきで返す', async () => {
    const requested: string[] = [];
    const resolver = createBlueskyPublicTrendPostsResolver({
      safeFetcher: respond({
        feed: [
          {
            post: {
              uri: 'at://did:plc:alice/app.bsky.feed.post/3abc',
              author: { handle: 'alice.bsky.social', displayName: 'Alice' },
              record: { text: '話題の投稿', createdAt: '2026-11-14T00:00:00.000Z' },
              likeCount: 12,
              repostCount: 3,
            },
          },
          { post: { uri: 'at://did:plc:bob/app.bsky.feed.like/x', author: { handle: 'bob' }, record: {} } },
        ],
      }, requested),
    });

    const posts = await resolver.resolve({ feedUri: 'at://did:plc:x/app.bsky.feed.generator/y', limit: 5 });

    expect(new URL(requested[0]!).searchParams.get('feed')).toBe('at://did:plc:x/app.bsky.feed.generator/y');
    expect(posts.val).toEqual([{
      url: 'https://bsky.app/profile/alice.bsky.social/post/3abc',
      authorHandle: 'alice.bsky.social',
      authorDisplayName: 'Alice',
      text: '話題の投稿',
      postedAt: '2026-11-14T00:00:00.000Z',
      likeCount: 12,
      repostCount: 3,
    }]);
  });
});
