import { describe, expect, it } from 'vitest';

import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import { blueskyItemActionProps, type BlueskyPostActions } from './blueskyPostActions.ts';

const item: IoriBlueskyTimelineItemBody = {
  feedItemId: 'at://did:plc:author/app.bsky.feed.post/3kabc',
  uri: 'at://did:plc:author/app.bsky.feed.post/3kabc',
  cid: 'cid',
  authorDid: 'did:plc:author',
  authorHandle: 'alice.bsky.social',
  authorDisplayName: 'Alice',
  authorAvatar: null,
  text: '本文です',
  facets: [],
  embed: null,
  replyParentUri: null,
  replyParentAuthorHandle: null,
  repostedByDid: null,
  repostedByHandle: null,
  bridgyOriginalUrl: null,
  bridgedFromPostId: null,
  postedAt: Date.UTC(2026, 10, 8, 1),
  indexedAt: Date.UTC(2026, 10, 8, 1),
  liked: false,
  reposted: false,
  bookmarked: false,
  threadMuted: false,
  replyRootUri: null,
  isOwn: false,
};

const actions = (overrides: Partial<BlueskyPostActions> = {}): BlueskyPostActions => ({
  onReply: () => {},
  onLike: () => {},
  onUndoLike: () => {},
  likePendingUris: new Set(),
  onRepost: () => {},
  onUndoRepost: () => {},
  repostPendingUris: new Set(),
  ...overrides,
});

describe('blueskyItemActionProps', () => {
  it('いいねとリポストの送信中は、その投稿の uri が含まれるときだけ pending にする', () => {
    const props = blueskyItemActionProps(
      actions({ likePendingUris: new Set([item.uri]), repostPendingUris: new Set(['at://other']) }),
      item,
    );

    expect(props).toMatchObject({ isLikePending: true, isRepostPending: false });
  });
});
