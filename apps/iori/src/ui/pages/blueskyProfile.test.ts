import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import { blueskyFeedNoticeMessage, type BlueskyProfile } from '../api/blueskyProfileClient.ts';
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
  isSelf: false,
  followUri: null,
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
  bookmarked: false,
  isOwn: false,
};

const render = (
  overrides: Partial<BlueskyProfile> = {},
  props: Partial<Parameters<typeof BlueskyProfilePage>[0]> = {},
): string =>
  String(jsx(BlueskyProfilePage, {
    profile: profile(overrides),
    items: [],
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

  it('ミュート・ブロック・通報の状態が読めないときは、そのボタンを出さず、フォローのボタンは出す', () => {
    const html = render({}, { moderation: null });

    expect(html).not.toContain('title="ミュート"');
    expect(html).not.toContain('title="ブロック"');
    expect(html).not.toContain('title="通報"');
    expect(html).toContain('title="フォロー"');
  });

  it('状態が読めていれば、フォローのボタンの後に「ミュート」「ブロック」「通報」を並べる', () => {
    const html = render({}, { moderation: { muted: false, blockUri: null } });

    expect(html).toContain('title="ミュート"');
    expect(html).toContain('title="ブロック"');
    expect(html).toContain('title="通報"');
    expect(html).not.toContain('title="ミュート解除"');
    expect(html).not.toContain('title="ブロック解除"');
    expect(html.indexOf('title="フォロー"')).toBeLessThan(html.indexOf('title="ミュート"'));
    expect(html.indexOf('title="ミュート"')).toBeLessThan(html.indexOf('title="ブロック"'));
    expect(html.indexOf('title="ブロック"')).toBeLessThan(html.indexOf('title="通報"'));
  });

  it('ミュート中なら「ミュート解除」、ブロック中なら「ブロック解除」を出す', () => {
    const muted = render({}, { moderation: { muted: true, blockUri: null } });
    const blocking = render({}, { moderation: { muted: false, blockUri: 'at://did:plc:me/app.bsky.graph.block/3k' } });

    expect(muted).toContain('title="ミュート解除"');
    expect(muted).not.toContain('title="ミュート"');
    expect(muted).toContain('title="ブロック"');
    expect(blocking).toContain('title="ブロック解除"');
    expect(blocking).not.toContain('title="ブロック"');
    expect(blocking).toContain('title="ミュート"');
  });

  it('ミュートとブロックの操作中は、それぞれのボタンだけを無効にする', () => {
    const buttonOf = (html: string, title: string): string =>
      new RegExp(`<button[^>]*title="${title}"[^>]*>`).exec(html)?.[0] ?? '';
    const state = { muted: false, blockUri: null };

    const muting = render({}, { moderation: state, isTogglingMute: true });
    const blocking = render({}, { moderation: state, isTogglingBlock: true });

    expect(buttonOf(muting, 'ミュート')).toMatch(/\sdisabled(?=[\s>=])/);
    expect(buttonOf(muting, 'ブロック')).not.toMatch(/\sdisabled(?=[\s>=])/);
    expect(buttonOf(blocking, 'ブロック')).toMatch(/\sdisabled(?=[\s>=])/);
    expect(buttonOf(blocking, 'ミュート')).not.toMatch(/\sdisabled(?=[\s>=])/);
  });

  it('自分以外のプロフィールには「メッセージ」のボタンを出し、自分のプロフィールには出さない', () => {
    expect(render({ isSelf: false })).toContain('title="メッセージ"');
    expect(render({ isSelf: true })).not.toContain('title="メッセージ"');
  });

  it('メッセージを開く操作中はボタンを無効にし、失敗の文言を出す', () => {
    const disabledAttribute = /\sdisabled(?=[\s>=])/;

    expect(render({}, { isOpeningMessage: true })).toMatch(disabledAttribute);
    expect(render({}, { messageError: '相手が DM を受け付けていません' })).toContain('相手が DM を受け付けていません');
    expect(render({}, { messageError: null })).not.toContain('role="alert"');
  });

  it('「Bluesky で開く」の外部リンクを bsky.app のプロフィールに向ける', () => {
    const html = render();

    expect(html).toContain('href="https://bsky.app/profile/did:plc:alice"');
    expect(html).toContain('title="Bluesky で開く"');
    expect(html).toContain('target="_blank"');
  });

  it('投稿の場所に、読み込み中の表示と、ブロックや失敗の文言を出し、そのときは投稿を出さない', () => {
    expect(render({}, { isFeedLoading: true })).toContain('Loading...');
    expect(render({}, { isFeedLoading: true })).not.toContain('No posts yet.');

    const blocked = render({}, {
      items: [item],
      feedNotice: blueskyFeedNoticeMessage({ unavailable: 'blocked', failed: false }),
    });
    expect(blocked).toContain('ブロックしているか、ブロックされているため、投稿を表示できません');
    expect(blocked).not.toContain('最初の投稿');
    expect(blocked).not.toContain('No posts yet.');

    expect(render({}, { feedNotice: blueskyFeedNoticeMessage({ unavailable: null, failed: true }) }))
      .toContain('投稿を読み込めませんでした');
  });

  it('投稿が読めなくても、プロフィールとフォローのボタンを出す', () => {
    const html = render({}, { feedNotice: '投稿を読み込めませんでした', isFollowing: true });

    expect(html).toContain('Alice');
    expect(html).toContain('title="フォロー解除"');
  });

  it('投稿が無ければ空の表示、あれば投稿を出し、いいね・リポスト・返信のボタンは出さない', () => {
    expect(render()).toContain('No posts yet.');

    const html = render({}, { items: [item] });

    expect(html).toContain('最初の投稿');
    expect(html).not.toContain('title="いいね"');
    expect(html).not.toContain('title="リポスト"');
  });
});
