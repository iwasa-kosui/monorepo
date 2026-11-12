import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import type { BlueskyProfile } from '../api/blueskyProfileClient.ts';
import type { BlueskyPostActions } from '../components/blueskyPostActions.ts';
import { BlueskyTimelineItemView } from '../components/BlueskyTimelineItemView.tsx';
import { BlueskyProfilePage } from './blueskyProfile.tsx';

const profile: BlueskyProfile = {
  did: 'did:plc:alice',
  handle: 'alice.bsky.social',
  displayName: 'Alice',
  description: null,
  avatar: null,
  banner: null,
  followersCount: 3,
  followsCount: 2,
  postsCount: 1,
  following: false,
  followedBy: false,
  followUri: null,
  isSelf: false,
};

const item: IoriBlueskyTimelineItemBody = {
  feedItemId: 'at://did:plc:alice/app.bsky.feed.post/1',
  uri: 'at://did:plc:alice/app.bsky.feed.post/1',
  cid: 'cid',
  authorDid: 'did:plc:alice',
  authorHandle: 'alice.bsky.social',
  authorDisplayName: 'Alice',
  authorAvatar: null,
  text: '最初の投稿',
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

const actions: BlueskyPostActions = {
  onReply: () => {},
  onLike: () => {},
  onUndoLike: () => {},
  likePendingUris: new Set(),
  onRepost: () => {},
  onUndoRepost: () => {},
  repostPendingUris: new Set(),
};

type ElementLike = Readonly<{ tag: unknown; props: Record<string, unknown>; children?: unknown }>;

const isElementLike = (value: unknown): value is ElementLike =>
  typeof value === 'object' && value !== null && 'tag' in value && 'props' in value;

const findElements = (node: unknown, tag: unknown): ElementLike[] => {
  if (Array.isArray(node)) return node.flatMap((child) => findElements(child, tag));
  if (!isElementLike(node)) return [];
  const self = node.tag === tag ? [node] : [];
  return [...self, ...findElements(node.children, tag)];
};

const render = (props: Partial<Parameters<typeof BlueskyProfilePage>[0]> = {}): string =>
  String(jsx(BlueskyProfilePage, {
    profile,
    items: [item],
    feedNotice: null,
    isFeedLoading: false,
    isFollowing: false,
    isTogglingFollow: false,
    moderation: null,
    isTogglingMute: false,
    isTogglingBlock: false,
    isOpeningMessage: false,
    messageError: null,
    onFollow: async () => {},
    onUnfollow: async () => {},
    onMute: async () => {},
    onUnmute: async () => {},
    onBlock: async () => {},
    onUnblock: async () => {},
    onReport: () => {},
    onMessage: async () => {},
    ...props,
  }));

describe('BlueskyProfilePage の投稿の操作', () => {
  it('操作が渡されたときは、投稿ごとに返信・リポスト・いいねのボタンを出す', () => {
    const html = render({ actions });

    expect(html).toContain('title="返信 (p)"');
    expect(html).toContain('title="リポスト"');
    expect(html).toContain('title="いいね"');
    expect(html).not.toContain('title="引用"');
  });

  it('操作が渡されないときは、ボタンを出さない', () => {
    const html = render();

    expect(html).not.toContain('title="返信 (p)"');
    expect(html).not.toContain('title="リポスト"');
    expect(html).not.toContain('title="いいね"');
  });

  it('onQuote があるときは、投稿に「引用」のボタンを出す', () => {
    const html = render({ actions: { ...actions, onQuote: () => {} } });

    expect(html).toContain('title="引用"');
    expect(html).toContain('title="返信 (p)"');
  });

  it('onQuote をそのまま BlueskyTimelineItemView に渡す', () => {
    const onQuote = (_target: IoriBlueskyTimelineItemBody) => {};
    const views = findElements(
      BlueskyProfilePage({
        profile,
        items: [item],
        feedNotice: null,
        isFeedLoading: false,
        isFollowing: false,
        isTogglingFollow: false,
        moderation: null,
        isTogglingMute: false,
        isTogglingBlock: false,
        isOpeningMessage: false,
        messageError: null,
        onFollow: async () => {},
        onUnfollow: async () => {},
        onMute: async () => {},
        onUnmute: async () => {},
        onBlock: async () => {},
        onUnblock: async () => {},
        onReport: () => {},
        onMessage: async () => {},
        actions: { ...actions, onQuote },
      }),
      BlueskyTimelineItemView,
    );

    expect(views).toHaveLength(1);
    expect(views[0]!.props.onQuote).toBe(onQuote);
    expect(views[0]!.props.item).toBe(item);
  });
});
