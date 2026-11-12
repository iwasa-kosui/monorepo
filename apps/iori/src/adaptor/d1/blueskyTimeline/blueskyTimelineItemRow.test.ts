import { describe, expect, it } from 'vitest';

import type { BlueskyFetchedTimelineItem } from '../../../domain/blueskyTimeline/blueskyTimelineItem.ts';
import type { Instant } from '../../../domain/instant/instant.ts';
import { toBlueskyTimelineItem, toBlueskyTimelineItemRow } from './blueskyTimelineItemRow.ts';

const AT = new Date(Date.UTC(2026, 10, 8, 1));
const row = (embed: unknown, bridgyOriginalUrl: string | null = null) => ({
  feedItemId: 'at://did:plc:author/app.bsky.feed.post/3kabc',
  uri: 'at://did:plc:author/app.bsky.feed.post/3kabc',
  cid: 'cid',
  authorDid: 'did:plc:author',
  authorHandle: 'alice.bsky.social',
  authorDisplayName: null,
  authorAvatar: null,
  text: '本文',
  facets: '[]',
  embed: JSON.stringify(embed),
  replyParentUri: null,
  replyParentAuthorHandle: null,
  repostedByDid: null,
  repostedByHandle: null,
  bridgyOriginalUrl,
  postedAt: AT,
  indexedAt: AT,
  fetchedAt: AT,
});
const oldRecord = {
  type: 'record',
  uri: 'at://did:plc:q/app.bsky.feed.post/3kq',
  authorHandle: 'q.bsky.social',
  text: '引用本文',
};

describe('toBlueskyTimelineItem', () => {
  it('新しい項目を持たない旧形式の引用 embed を読める', () => {
    expect(toBlueskyTimelineItem(row(oldRecord), false, false).embed).toEqual(oldRecord);
  });

  it('新しい項目を持たない旧形式の引用を持つ recordWithMedia を読める', () => {
    const embed = {
      type: 'recordWithMedia',
      media: { type: 'external', uri: 'https://example.com/a', title: '記事', description: '', thumb: null },
      record: oldRecord,
    };

    expect(toBlueskyTimelineItem(row(embed), false, false).embed).toEqual(embed);
  });

  it('recordUnavailable と、新しい項目を持つ引用を読める', () => {
    const unavailable = { type: 'recordUnavailable', uri: oldRecord.uri, reason: 'detached' };
    const detailed = {
      ...oldRecord,
      authorDisplayName: '引用者',
      authorAvatar: 'https://cdn.example/q.jpg',
      media: { type: 'video', thumbnail: null, playlist: 'https://video.example/q.m3u8', aspectRatio: null, alt: null },
    };

    expect(toBlueskyTimelineItem(row(unavailable), false, false).embed).toEqual(unavailable);
    expect(toBlueskyTimelineItem(row(detailed), false, false).embed).toEqual(detailed);
    expect(
      toBlueskyTimelineItem(
        row({
          type: 'recordWithMedia',
          media: {
            type: 'video',
            thumbnail: null,
            playlist: 'https://video.example/q.m3u8',
            aspectRatio: null,
            alt: null,
          },
          record: unavailable,
        }),
        false,
        false,
      ).embed,
    ).toMatchObject({ type: 'recordWithMedia', record: unavailable });
  });
});

describe('Bridgy Fed の元の投稿の URL', () => {
  const fetched = (bridgyOriginalUrl: string | null): BlueskyFetchedTimelineItem => ({
    feedItemId: 'at://did:plc:author/app.bsky.feed.post/3kabc',
    uri: 'at://did:plc:author/app.bsky.feed.post/3kabc',
    cid: 'cid',
    authorDid: 'did:plc:author',
    authorHandle: 'alice.mastodon.example.ap.brid.gy',
    authorDisplayName: null,
    authorAvatar: null,
    text: '本文',
    facets: [],
    embed: null,
    replyParentUri: null,
    replyParentAuthorHandle: null,
    repostedByDid: null,
    repostedByHandle: null,
    bridgyOriginalUrl,
    bridgedFromPostId: null,
    postedAt: AT.getTime() as Instant,
    indexedAt: AT.getTime() as Instant,
    fetchedAt: AT.getTime() as Instant,
    liked: false,
    viewerLikeUri: null,
    reposted: false,
    viewerRepostUri: null,
    threadMuted: false,
    replyRootUri: null,
  });

  it('行に保存し、読み出した項目に戻す。突き合わせ先の postId は行に持たない', () => {
    const saved = toBlueskyTimelineItemRow(fetched('https://mastodon.example/@alice/123'));

    expect(saved.bridgyOriginalUrl).toBe('https://mastodon.example/@alice/123');
    expect(saved).not.toHaveProperty('bridgedFromPostId');
    expect(toBlueskyTimelineItem(row(oldRecord, 'https://mastodon.example/@alice/123'), false, false)).toMatchObject({
      bridgyOriginalUrl: 'https://mastodon.example/@alice/123',
      bridgedFromPostId: null,
    });
  });

  it('URL が無い行は null のまま読める', () => {
    expect(toBlueskyTimelineItemRow(fetched(null)).bridgyOriginalUrl).toBeNull();
    expect(toBlueskyTimelineItem(row(oldRecord), false, false).bridgyOriginalUrl).toBeNull();
  });
});
