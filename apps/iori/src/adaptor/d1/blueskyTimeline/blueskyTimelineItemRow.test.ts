import { describe, expect, it } from 'vitest';

import { toBlueskyTimelineItem } from './blueskyTimelineItemRow.ts';

const AT = new Date(Date.UTC(2026, 10, 8, 1));
const row = (embed: unknown) => ({
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
      cid: 'c',
      authorDid: 'did:plc:q',
      authorDisplayName: '引用者',
      authorAvatar: 'https://cdn.example/q.jpg',
      createdAt: '2026-11-07T00:00:00.000Z',
      media: { type: 'video', thumbnail: null, playlist: 'https://video.example/q.m3u8' },
    };

    expect(toBlueskyTimelineItem(row(unavailable), false, false).embed).toEqual(unavailable);
    expect(toBlueskyTimelineItem(row(detailed), false, false).embed).toEqual(detailed);
    expect(
      toBlueskyTimelineItem(
        row({
          type: 'recordWithMedia',
          media: { type: 'video', thumbnail: null, playlist: 'https://video.example/q.m3u8' },
          record: unavailable,
        }),
        false,
        false,
      ).embed,
    ).toMatchObject({ type: 'recordWithMedia', record: unavailable });
  });
});
