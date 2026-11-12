import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import type { BlueskyPostActions } from './blueskyPostActions.ts';
import { BlueskySearchPostItem } from './BlueskySearchResults.tsx';

const item: IoriBlueskyTimelineItemBody = {
  feedItemId: 'at://did:plc:alice/app.bsky.feed.post/1',
  uri: 'at://did:plc:alice/app.bsky.feed.post/1',
  cid: 'cid',
  authorDid: 'did:plc:alice',
  authorHandle: 'alice.bsky.social',
  authorDisplayName: 'Alice',
  authorAvatar: null,
  text: '検索結果の投稿',
  facets: [],
  embed: null,
  replyParentUri: null,
  replyParentAuthorHandle: null,
  repostedByDid: null,
  repostedByHandle: null,
  postedAt: Date.UTC(2026, 10, 8, 1),
  indexedAt: Date.UTC(2026, 10, 8, 1),
  liked: false,
  reposted: false,
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

describe('BlueskySearchPostItem の引用ボタン', () => {
  it('onQuote があるときは、投稿に「引用」のボタンを出す', () => {
    const html = String(jsx(BlueskySearchPostItem, { item, actions: actions({ onQuote: () => {} }) }));

    expect(html).toContain('title="引用"');
    expect(html).toContain('title="返信 (p)"');
  });

  it('onQuote がないときは、引用のボタンを出さない', () => {
    const html = String(jsx(BlueskySearchPostItem, { item, actions: actions() }));

    expect(html).not.toContain('title="引用"');
  });

  it('onQuote をそのまま BlueskyTimelineItemView に渡す', () => {
    const onQuote = (_target: IoriBlueskyTimelineItemBody) => {};
    const element = BlueskySearchPostItem({ item, actions: actions({ onQuote }) }) as unknown as {
      props: { onQuote: (target: IoriBlueskyTimelineItemBody) => void; item: IoriBlueskyTimelineItemBody };
    };

    expect(element.props.onQuote).toBe(onQuote);
    expect(element.props.item).toBe(item);
  });
});
