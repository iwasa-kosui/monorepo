import { describe, expect, it } from 'vitest';

import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import { blueskyModerationNotice, withBlueskyThreadMuted, withoutBlueskyActor } from './blueskyAuthorModeration.ts';

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
  bridgyOriginalUrl: null,
  bridgedFromPostId: null,
  postedAt: 0,
  indexedAt: 0,
  liked: false,
  reposted: false,
  threadMuted: false,
  replyRootUri: null,
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

describe('withBlueskyThreadMuted', () => {
  const ROOT = 'at://did:plc:root/app.bsky.feed.post/root';

  it('根の投稿と、根を replyRootUri に持つ返信の threadMuted を書き換える', () => {
    const root = { ...item('1', 'did:plc:root'), uri: ROOT };
    const reply = { ...item('2', 'did:plc:other'), replyRootUri: ROOT };
    const unrelated = { ...item('3', 'did:plc:other'), replyRootUri: 'at://did:plc:x/app.bsky.feed.post/x' };

    const result = withBlueskyThreadMuted([root, reply, unrelated], ROOT, true);

    expect(result.map((i) => [i.feedItemId, i.threadMuted])).toEqual([['1', true], ['2', true], ['3', false]]);
  });

  it('false を渡すとミュートを解除した状態にする', () => {
    const reply = { ...item('2', 'did:plc:other'), replyRootUri: ROOT, threadMuted: true };

    expect(withBlueskyThreadMuted([reply], ROOT, false).map((i) => i.threadMuted)).toEqual([false]);
  });

  it('threadMuted が null の投稿も、true と false に書き換える', () => {
    const unknown = { ...item('1', 'did:plc:other'), replyRootUri: ROOT, threadMuted: null };

    expect(withBlueskyThreadMuted([unknown], ROOT, true).map((i) => i.threadMuted)).toEqual([true]);
    expect(withBlueskyThreadMuted([unknown], ROOT, false).map((i) => i.threadMuted)).toEqual([false]);
  });

  it('該当する投稿が無いときは、同じ配列をそのまま返す', () => {
    const items = [item('1', 'did:plc:other')];

    expect(withBlueskyThreadMuted(items, ROOT, true)).toBe(items);
  });

  it('すでに同じ状態なら、同じ配列をそのまま返す', () => {
    const items = [{ ...item('1', 'did:plc:other'), replyRootUri: ROOT, threadMuted: true }];

    expect(withBlueskyThreadMuted(items, ROOT, true)).toBe(items);
  });
});

describe('blueskyModerationNotice', () => {
  it('ミュートの成功を伝える', () => {
    expect(blueskyModerationNotice({ action: 'mute', handle: 'a', removed: true })).toBe('@a をミュートしました');
  });

  it('ブロックの成功を伝える', () => {
    expect(blueskyModerationNotice({ action: 'block', handle: 'a', removed: true })).toBe('@a をブロックしました');
  });

  it('一覧から除いたときは、補足があっても足さない', () => {
    expect(blueskyModerationNotice({ action: 'mute', handle: 'a', removed: true, keptItemsNote: '補足' })).toBe(
      '@a をミュートしました',
    );
  });

  it('一覧から除かなかったときは、補足を続ける', () => {
    expect(
      blueskyModerationNotice({
        action: 'mute',
        handle: 'a',
        removed: false,
        keptItemsNote: 'この画面の投稿は再読み込みまで表示されます',
      }),
    ).toBe('@a をミュートしました。この画面の投稿は再読み込みまで表示されます');
  });

  it('一覧から除かなくても、補足が無ければ足さない', () => {
    expect(blueskyModerationNotice({ action: 'block', handle: 'a', removed: false })).toBe('@a をブロックしました');
  });
});
