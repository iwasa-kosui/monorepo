import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import type { BlueskyPostActions } from '../components/blueskyPostActions.ts';
import { ThreadNodeView } from './blueskyPost.tsx';

const item: IoriBlueskyTimelineItemBody = {
  feedItemId: 'at://did:plc:alice/app.bsky.feed.post/1',
  uri: 'at://did:plc:alice/app.bsky.feed.post/1',
  cid: 'cid',
  authorDid: 'did:plc:alice',
  authorHandle: 'alice.bsky.social',
  authorDisplayName: 'Alice',
  authorAvatar: null,
  text: '詳細ページの投稿',
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

describe('ThreadNodeView の引用ボタン', () => {
  it('onQuote があるときは、投稿に「引用」のボタンを出す', () => {
    const html = String(jsx(ThreadNodeView, { node: { kind: 'post', item }, actions: actions({ onQuote: () => {} }) }));

    expect(html).toContain('title="引用"');
    expect(html).toContain('title="返信 (p)"');
  });

  it('onQuote がないときは、引用のボタンを出さない', () => {
    const html = String(jsx(ThreadNodeView, { node: { kind: 'post', item }, actions: actions() }));

    expect(html).not.toContain('title="引用"');
  });

  it('押すと、その投稿を渡して onQuote を呼ぶ', () => {
    const calls: IoriBlueskyTimelineItemBody[] = [];
    const element = ThreadNodeView({
      node: { kind: 'post', item },
      actions: actions({ onQuote: (target) => calls.push(target) }),
    }) as unknown as { props: { onQuote: (target: IoriBlueskyTimelineItemBody) => void } };

    element.props.onQuote(item);

    expect(calls.map((target) => target.uri)).toEqual([item.uri]);
  });

  it('削除済みやブロックの投稿には、引用のボタンを出さない', () => {
    const notFound = String(
      jsx(ThreadNodeView, {
        node: { kind: 'notFound', uri: 'at://did:plc:a/app.bsky.feed.post/gone' },
        actions: actions({ onQuote: () => {} }),
      }),
    );

    expect(notFound).not.toContain('title="引用"');
  });
});
