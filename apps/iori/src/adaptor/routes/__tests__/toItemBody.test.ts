import { describe, expect, it } from 'vitest';

import type { BlueskyTimelineItem } from '../../../domain/blueskyTimeline/blueskyTimelineItem.ts';
import type { Instant } from '../../../domain/instant/instant.ts';
import { toItemBody } from '../workerIoriBlueskyRouter.ts';

const item = (overrides: Partial<BlueskyTimelineItem> = {}): BlueskyTimelineItem => ({
  feedItemId: 'at://did:plc:a/app.bsky.feed.post/1',
  uri: 'at://did:plc:a/app.bsky.feed.post/1',
  cid: 'cid1',
  authorDid: 'did:plc:a',
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
  bridgyOriginalUrl: null,
  bridgedFromPostId: null,
  postedAt: 1000 as Instant,
  indexedAt: 2000 as Instant,
  fetchedAt: 3000 as Instant,
  liked: false,
  reposted: false,
  bookmarked: false,
  threadMuted: null,
  replyRootUri: null,
  ...overrides,
});

describe('toItemBody', () => {
  it('bridgyOriginalUrl と bridgedFromPostId をそのまま渡す', () => {
    const body = toItemBody(
      item({ bridgyOriginalUrl: 'https://mastodon.example/@alice/1', bridgedFromPostId: 'post-1' }),
      undefined,
    );

    expect(body).toMatchObject({ bridgyOriginalUrl: 'https://mastodon.example/@alice/1', bridgedFromPostId: 'post-1' });
  });

  it('どちらも無い項目は null のまま渡す', () => {
    expect(toItemBody(item(), undefined)).toMatchObject({ bridgyOriginalUrl: null, bridgedFromPostId: null });
  });
});
