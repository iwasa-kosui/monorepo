import { describe, expect, it } from 'vitest';

import type { BlueskyTimelineItem } from '../../blueskyTimeline/blueskyTimelineItem.ts';
import { Instant } from '../../instant/instant.ts';
import { blueskyPostWebUrl, BlueskyTopics, blueskyTrendFeedUri } from '../aiAgentBotMaterial.ts';

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

const link = (rkey: string, uri: string, authorDid: string, overrides: Partial<BlueskyTimelineItem> = {}) =>
  item(rkey, {
    authorDid,
    embed: { type: 'external', uri, title: '記事の題名', description: '', thumb: null },
    ...overrides,
  });

const tag = (rkey: string, value: string, authorDid: string) =>
  item(rkey, { authorDid, facets: [{ byteStart: 0, byteEnd: 1, feature: { type: 'tag', tag: value } }] });

describe('BlueskyTopics.collectTimelineTopics', () => {
  it('計測用のパラメータだけが違う同じリンクを 1 つの話題にまとめ、触れた人を数える', () => {
    const topics = BlueskyTopics.collectTimelineTopics(
      [
        link('a', 'https://example.com/news?utm_source=bsky', 'did:plc:alice'),
        link('b', 'https://example.com/news/', 'did:plc:bob'),
        link('c', 'https://example.com/news#top', 'did:plc:carol', { repostedByDid: 'did:plc:dave' }),
      ],
      NOW,
      10,
    );

    expect(topics).toHaveLength(1);
    expect(topics[0]).toMatchObject({
      kind: 'link',
      label: 'https://example.com/news',
      title: '記事の題名',
      people: 4,
    });
  });

  it('一人だけが何度も触れたものは話題にしない', () => {
    const topics = BlueskyTopics.collectTimelineTopics(
      [
        link('a', 'https://example.com/solo', 'did:plc:alice'),
        link('b', 'https://example.com/solo', 'did:plc:alice'),
      ],
      NOW,
      10,
    );

    expect(topics).toEqual([]);
  });

  it('ハッシュタグは全角半角と大文字小文字をそろえてまとめ、触れた人の多い順に並べる', () => {
    const topics = BlueskyTopics.collectTimelineTopics(
      [
        tag('a', 'TypeScript', 'did:plc:alice'),
        tag('b', 'ｔｙｐｅｓｃｒｉｐｔ', 'did:plc:bob'),
        tag('c', 'typescript', 'did:plc:carol'),
        tag('d', 'rust', 'did:plc:alice'),
        tag('e', 'rust', 'did:plc:bob'),
      ],
      NOW,
      10,
    );

    expect(topics.map((topic) => [topic.label, topic.people])).toEqual([['#typescript', 3], ['#rust', 2]]);
  });

  it('48 時間より前の投稿と、Bluesky の投稿へのリンク（引用）は数えない', () => {
    const topics = BlueskyTopics.collectTimelineTopics(
      [
        link('a', 'https://example.com/old', 'did:plc:alice', { postedAt: hoursAgo(49) }),
        link('b', 'https://example.com/old', 'did:plc:bob', { postedAt: hoursAgo(49) }),
        link('c', 'https://bsky.app/profile/x/post/1', 'did:plc:alice'),
        link('d', 'https://bsky.app/profile/x/post/1', 'did:plc:bob'),
      ],
      NOW,
      10,
    );

    expect(topics).toEqual([]);
  });
});

describe('BlueskyTopics.recentTimelinePosts', () => {
  it('返信を除き、リポストで重なった同じ投稿は 1 件にする', () => {
    const original = item('a');
    const posts = BlueskyTopics.recentTimelinePosts(
      [
        original,
        { ...original, feedItemId: 'a#repost', repostedByDid: 'did:plc:bob' },
        item('reply', { replyParentUri: 'at://did:plc:bob/app.bsky.feed.post/x' }),
      ],
      NOW,
      10,
    );

    expect(posts.map((post) => post.url)).toEqual(['https://bsky.app/profile/alice.bsky.social/post/a']);
  });
});

describe('blueskyTrendFeedUri', () => {
  it('getTrends の link をフィードの URI にし、形の違うものは捨てる', () => {
    expect(blueskyTrendFeedUri('/profile/did:plc:qrz3lhbyuxbeilrc6nekdqme/feed/1a9a958ef75e'))
      .toBe('at://did:plc:qrz3lhbyuxbeilrc6nekdqme/app.bsky.feed.generator/1a9a958ef75e');
    expect(blueskyTrendFeedUri('https://evil.example/feed/x')).toBeNull();
  });
});

describe('blueskyPostWebUrl', () => {
  it('投稿でない URI からは URL を作らない', () => {
    expect(blueskyPostWebUrl('at://did:plc:alice/app.bsky.feed.like/abc', 'alice.bsky.social')).toBeUndefined();
  });
});
