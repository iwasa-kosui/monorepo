import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import type { BlueskyProfile } from '../api/blueskyProfileClient.ts';
import { BlueskyProfilePage } from './blueskyProfile.tsx';

const profile = (overrides: Partial<BlueskyProfile> = {}): BlueskyProfile => ({
  did: 'did:plc:alice',
  handle: 'alice.bsky.social',
  displayName: 'Alice',
  description: 'hello\nworld',
  avatar: 'https://cdn.example/avatar.jpg',
  banner: 'https://cdn.example/banner.jpg',
  followersCount: 3,
  followsCount: 2,
  postsCount: 1,
  following: false,
  followedBy: false,
  ...overrides,
});

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
};

const render = (
  overrides: Partial<BlueskyProfile> = {},
  props: Partial<Parameters<typeof BlueskyProfilePage>[0]> = {},
): string =>
  String(jsx(BlueskyProfilePage, {
    profile: profile(overrides),
    items: [],
    isFollowing: false,
    isTogglingFollow: false,
    onFollow: async () => {},
    onUnfollow: async () => {},
    ...props,
  }));

describe('BlueskyProfilePage', () => {
  it('バナー、アイコン、表示名、@handle、自己紹介、数を出す', () => {
    const html = render();

    expect(html).toContain('src="https://cdn.example/banner.jpg"');
    expect(html).toContain('src="https://cdn.example/avatar.jpg"');
    expect(html).toContain('Alice');
    expect(html).toContain('@alice.bsky.social');
    expect(html).toContain('whitespace-pre-wrap');
    expect(html).toContain('hello\nworld');
    expect(html).toContain('フォロー 2');
    expect(html).toContain('フォロワー 3');
    expect(html).toContain('投稿 1');
  });

  it('表示名が無ければ handle を出し、バナーとアイコンが無ければ出さない', () => {
    const html = render({ displayName: null, banner: null, avatar: null, description: null });

    expect(html).toContain(
      '<h1 class="text-2xl font-bold text-charcoal dark:text-white truncate">alice.bsky.social</h1>',
    );
    expect(html).not.toContain('ヘッダー画像');
    expect(html).not.toContain('User Logo');
    expect(html).not.toContain('bluesky-profile-description');
  });

  it('自己紹介を HTML として挿入しない', () => {
    const html = render({ description: '<img src=x onerror=alert(1)>' });

    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img src=x');
  });

  it('相手が自分をフォローしているときだけ「フォローされています」を出す', () => {
    expect(render({ followedBy: true })).toContain('フォローされています');
    expect(render({ followedBy: false })).not.toContain('フォローされています');
  });

  it('未フォローなら「フォロー」、フォロー中なら「フォロー解除」のボタンを出す', () => {
    expect(render({}, { isFollowing: false })).toContain('title="フォロー"');
    expect(render({}, { isFollowing: false })).not.toContain('title="フォロー解除"');
    expect(render({}, { isFollowing: true })).toContain('title="フォロー解除"');
  });

  it('操作中はフォローのボタンを無効にする', () => {
    const disabledAttribute = /\sdisabled(?=[\s>=])/;

    expect(render({}, { isTogglingFollow: true })).toMatch(disabledAttribute);
    expect(render({}, { isTogglingFollow: false })).not.toMatch(disabledAttribute);
  });

  it('「Bluesky で開く」の外部リンクを bsky.app のプロフィールに向ける', () => {
    const html = render();

    expect(html).toContain('href="https://bsky.app/profile/did:plc:alice"');
    expect(html).toContain('title="Bluesky で開く"');
    expect(html).toContain('target="_blank"');
  });

  it('投稿が無ければ空の表示、あれば投稿を出し、いいね・リポスト・返信のボタンは出さない', () => {
    expect(render()).toContain('No posts yet.');

    const html = render({}, { items: [item] });

    expect(html).toContain('最初の投稿');
    expect(html).not.toContain('title="いいね"');
    expect(html).not.toContain('title="リポスト"');
  });
});
