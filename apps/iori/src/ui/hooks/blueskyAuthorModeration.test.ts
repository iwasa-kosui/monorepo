import { describe, expect, it } from 'vitest';

import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import { withoutBlueskyActor } from './blueskyAuthorModeration.ts';

const item = (
  feedItemId: string,
  authorDid: string,
  repostedByDid: string | null = null,
): IoriBlueskyTimelineItemBody => ({
  feedItemId,
  uri: `at://${authorDid}/app.bsky.feed.post/${feedItemId}`,
  cid: `cid-${feedItemId}`,
  authorDid,
  authorHandle: 'a.example.com',
  authorDisplayName: null,
  authorAvatar: null,
  text: '',
  facets: [],
  embed: null,
  replyParentUri: null,
  replyParentAuthorHandle: null,
  repostedByDid,
  repostedByHandle: repostedByDid === null ? null : 'r.example.com',
  postedAt: 0,
  indexedAt: 0,
  liked: false,
  reposted: false,
  isOwn: false,
});

describe('withoutBlueskyActor', () => {
  it('作者がその人の投稿と、その人のリポストを取り除く', () => {
    const items = [
      item('1', 'did:plc:target'),
      item('2', 'did:plc:other'),
      item('3', 'did:plc:other', 'did:plc:target'),
      item('4', 'did:plc:target', 'did:plc:other'),
    ];

    expect(withoutBlueskyActor(items, 'did:plc:target').map((i) => i.feedItemId)).toEqual(['2']);
  });

  it('該当する投稿が無いときは、同じ配列をそのまま返す', () => {
    const items = [item('1', 'did:plc:other')];

    expect(withoutBlueskyActor(items, 'did:plc:target')).toBe(items);
  });
});
