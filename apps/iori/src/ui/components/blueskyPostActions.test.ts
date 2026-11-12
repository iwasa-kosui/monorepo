import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import { blueskyItemActionProps, type BlueskyPostActions } from './blueskyPostActions.ts';
import { BlueskySearchPostItem } from './BlueskySearchResults.tsx';

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

describe('blueskyItemActionProps', () => {
  it('操作が渡されなければ何も渡さない', () => {
    expect(blueskyItemActionProps(undefined, item)).toEqual({});
  });

  it('いいねとリポストの送信中は、その投稿の uri が含まれるときだけ pending にする', () => {
    const props = blueskyItemActionProps(
      actions({ likePendingUris: new Set([item.uri]), repostPendingUris: new Set(['at://other']) }),
      item,
    );

    expect(props).toMatchObject({ isLikePending: true, isRepostPending: false });
  });

  it('スレッドのミュートのハンドラは、操作に含まれるときだけ渡す', () => {
    const onMuteThread = () => {};
    const onUnmuteThread = () => {};

    expect(blueskyItemActionProps(actions(), item)).not.toHaveProperty('onMuteThread');
    expect(blueskyItemActionProps(actions(), item)).not.toHaveProperty('onUnmuteThread');
    expect(blueskyItemActionProps(actions({ onMuteThread, onUnmuteThread }), item)).toMatchObject({
      onMuteThread,
      onUnmuteThread,
    });
  });

  it('引用のハンドラは、操作に含まれるときだけ渡す', () => {
    const onQuote = () => {};

    expect(blueskyItemActionProps(actions(), item)).not.toHaveProperty('onQuote');
    expect(blueskyItemActionProps(actions({ onQuote }), item)).toMatchObject({ onQuote });
  });
});

describe('BlueskySearchPostItem', () => {
  it('操作が渡されたときは、返信・リポスト・いいねのボタンを出す', () => {
    const html = String(jsx(BlueskySearchPostItem, { item, actions: actions() }));

    expect(html).toContain('title="返信 (p)"');
    expect(html).toContain('title="リポスト"');
    expect(html).toContain('title="いいね"');
    expect(html).not.toContain('title="引用"');
  });

  it('操作が渡されないときは、ボタンを出さない', () => {
    const html = String(jsx(BlueskySearchPostItem, { item }));

    expect(html).not.toContain('title="返信 (p)"');
    expect(html).not.toContain('title="リポスト"');
    expect(html).not.toContain('title="いいね"');
  });
});
