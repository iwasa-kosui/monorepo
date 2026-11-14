import { describe, expect, it } from 'vitest';

import type { BlueskyTimelineItem } from '../../blueskyTimeline/blueskyTimelineItem.ts';
import { Instant } from '../../instant/instant.ts';
import { type BlueskyPostStats, blueskyPostWebUrl, BlueskyTrend } from '../aiAgentBotMaterial.ts';

const HOUR_MS = 60 * 60 * 1000;
const NOW = Instant.orThrow(Date.UTC(2026, 10, 14, 12));
const hoursAgo = (n: number) => Instant.addDuration(NOW, -n * HOUR_MS);

const item = (rkey: string, overrides: Partial<BlueskyTimelineItem> = {}): BlueskyTimelineItem => ({
  feedItemId: rkey,
  uri: `at://did:plc:alice/app.bsky.feed.post/${rkey}`,
  cid: 'cid',
  authorDid: 'did:plc:alice',
  authorHandle: 'alice.bsky.social',
  authorDisplayName: 'Alice',
  authorAvatar: null,
  text: `post ${rkey}`,
  facets: [],
  embed: null,
  replyParentUri: null,
  replyParentAuthorHandle: null,
  repostedByDid: null,
  repostedByHandle: null,
  bridgyOriginalUrl: null,
  bridgedFromPostId: null,
  postedAt: hoursAgo(1),
  indexedAt: hoursAgo(1),
  fetchedAt: hoursAgo(1),
  liked: false,
  reposted: false,
  bookmarked: false,
  threadMuted: null,
  replyRootUri: null,
  ...overrides,
});

const stats = (uri: string, likeCount: number, repostCount = 0): BlueskyPostStats => ({
  uri,
  likeCount,
  repostCount,
  replyCount: 0,
  quoteCount: 0,
});

describe('BlueskyTrend.collectCandidates', () => {
  it('同じ投稿を 1 件にまとめ、タイムラインでリポストした人を重複なく数える', () => {
    const original = item('a');
    const candidates = BlueskyTrend.collectCandidates([
      original,
      { ...original, feedItemId: 'a#1', repostedByDid: 'did:plc:bob' },
      { ...original, feedItemId: 'a#2', repostedByDid: 'did:plc:carol' },
      { ...original, feedItemId: 'a#3', repostedByDid: 'did:plc:bob' },
    ], NOW);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.timelineReposts).toBe(2);
  });

  it('返信と、48 時間より前の投稿は候補にしない', () => {
    const candidates = BlueskyTrend.collectCandidates([
      item('reply', { replyParentUri: 'at://did:plc:bob/app.bsky.feed.post/x' }),
      item('old', { postedAt: hoursAgo(49) }),
      item('fresh'),
    ], NOW);

    expect(candidates.map((candidate) => candidate.uri)).toEqual(['at://did:plc:alice/app.bsky.feed.post/fresh']);
  });
});

describe('BlueskyTrend.rank', () => {
  it('反応が同じなら新しい投稿を上にし、反応を読めなかった投稿と反応の無い投稿は除く', () => {
    const candidates = BlueskyTrend.collectCandidates([
      item('older', { postedAt: hoursAgo(20) }),
      item('newer', { postedAt: hoursAgo(1) }),
      item('quiet'),
      item('unknown'),
    ], NOW);
    const uri = (rkey: string) => `at://did:plc:alice/app.bsky.feed.post/${rkey}`;
    const ranked = BlueskyTrend.rank({
      candidates,
      stats: new Map([
        [uri('older'), stats(uri('older'), 50)],
        [uri('newer'), stats(uri('newer'), 50)],
        [uri('quiet'), stats(uri('quiet'), 0)],
      ]),
      now: NOW,
      limit: 10,
    });

    expect(ranked.map((post) => post.url)).toEqual([
      'https://bsky.app/profile/alice.bsky.social/post/newer',
      'https://bsky.app/profile/alice.bsky.social/post/older',
    ]);
  });

  it('リポストの多い投稿を、いいねだけの投稿より上にする', () => {
    const uri = (rkey: string) => `at://did:plc:alice/app.bsky.feed.post/${rkey}`;
    const ranked = BlueskyTrend.rank({
      candidates: BlueskyTrend.collectCandidates([item('likes'), item('reposts')], NOW),
      stats: new Map([
        [uri('likes'), stats(uri('likes'), 30)],
        [uri('reposts'), stats(uri('reposts'), 10, 15)],
      ]),
      now: NOW,
      limit: 1,
    });

    expect(ranked.map((post) => post.uri)).toEqual([uri('reposts')]);
  });
});

describe('blueskyPostWebUrl', () => {
  it('投稿でない URI からは URL を作らない', () => {
    expect(blueskyPostWebUrl('at://did:plc:alice/app.bsky.feed.like/abc', 'alice.bsky.social')).toBeUndefined();
  });
});
