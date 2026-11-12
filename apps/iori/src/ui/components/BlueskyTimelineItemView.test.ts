import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import { BlueskyTimelineItemView } from './BlueskyTimelineItemView.tsx';

const base: IoriBlueskyTimelineItemBody = {
  feedItemId: 'at://did:plc:author/app.bsky.feed.post/3kabc',
  uri: 'at://did:plc:author/app.bsky.feed.post/3kabc',
  cid: 'cid',
  authorDid: 'did:plc:author',
  authorHandle: 'alice.bsky.social',
  authorDisplayName: 'Alice',
  authorAvatar: 'https://cdn.example/avatar.jpg',
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
};
const render = (
  item: Partial<IoriBlueskyTimelineItemBody>,
  props: Partial<Parameters<typeof BlueskyTimelineItemView>[0]> = {},
): string => String(jsx(BlueskyTimelineItemView, { item: { ...base, ...item }, ...props }));

describe('BlueskyTimelineItemView', () => {
  it('投稿者の表示名と @handle、本文、iori 内の投稿の詳細へのリンクを出す', () => {
    const html = render({});

    expect(html).toContain('Alice');
    expect(html).toContain('@alice.bsky.social');
    expect(html).toContain('本文です');
    expect(html).toContain('href="/bluesky/profile/did:plc:author/post/3kabc"');
    expect(html).toContain('src="https://cdn.example/avatar.jpg"');
  });

  it('時刻のリンクは同じタブで開く', () => {
    const html = render({});

    expect(html).not.toContain('bsky.app');
    expect(html).not.toMatch(/<a href="\/bluesky\/[^>]*target=/);
  });

  it('本文を HTML として挿入せず、facet のリンクは rel と target つきの a 要素にする', () => {
    const text = '<img src=x onerror=alert(1)> https://example.com';
    const start = new TextEncoder().encode('<img src=x onerror=alert(1)> ').length;
    const html = render({
      text,
      facets: [{ byteStart: start, byteEnd: start + 19, feature: { type: 'link', uri: 'https://example.com' } }],
    });

    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer"');
  });

  it('http/https 以外の link はリンクにしない', () => {
    const html = render({
      text: 'click',
      facets: [{ byteStart: 0, byteEnd: 5, feature: { type: 'link', uri: 'javascript:alert(1)' } }],
    });

    expect(html).not.toContain('javascript:');
    expect(html).toContain('click');
  });

  it('リポストと返信の表示を出す', () => {
    const html = render({
      repostedByHandle: 'bob.bsky.social',
      replyParentUri: 'at://did:plc:p/app.bsky.feed.post/1',
      replyParentAuthorHandle: 'carol.bsky.social',
    });

    expect(html).toContain('@bob.bsky.social がリポスト');
    expect(html).toContain('@carol.bsky.social への返信');
  });

  it('画像は thumb を表示し fullsize にリンクし、alt を付ける', () => {
    const html = render({
      embed: {
        type: 'images',
        images: [{ thumb: 'https://cdn.example/t.jpg', fullsize: 'https://cdn.example/f.jpg', alt: '猫の写真' }],
      },
    });

    expect(html).toContain('href="https://cdn.example/f.jpg"');
    expect(html).toContain('src="https://cdn.example/t.jpg"');
    expect(html).toContain('alt="猫の写真"');
  });

  it('http/https 以外の画像・リンクカードの URL は出さない', () => {
    const images = render({
      embed: { type: 'images', images: [{ thumb: 'javascript:alert(1)', fullsize: 'javascript:alert(2)', alt: '' }] },
    });
    const card = render({
      embed: { type: 'external', uri: 'javascript:alert(3)', title: 't', description: 'd', thumb: null },
    });

    expect(images).not.toContain('javascript:');
    expect(card).not.toContain('javascript:');
  });

  it('リンクカードと引用を出す', () => {
    const html = render({
      embed: {
        type: 'recordWithMedia',
        media: { type: 'external', uri: 'https://example.com/a', title: '記事', description: '説明', thumb: null },
        record: {
          type: 'record',
          uri: 'at://did:plc:q/app.bsky.feed.post/3kq',
          authorHandle: 'q.bsky.social',
          text: '引用本文',
        },
      },
    });

    expect(html).toContain('href="https://example.com/a"');
    expect(html).toContain('記事');
    expect(html).toContain('@q.bsky.social');
    expect(html).toContain('引用本文');
    expect(html).toMatch(/<a href="\/bluesky\/profile\/did:plc:q\/post\/3kq" class=/);
    expect(html).not.toContain('bsky.app');
  });

  it('返信先の表示を、親の投稿の詳細へのリンクにする', () => {
    const html = render({
      replyParentUri: 'at://did:plc:p/app.bsky.feed.post/3kp',
      replyParentAuthorHandle: 'carol.bsky.social',
    });

    expect(html).toMatch(
      /<a href="\/bluesky\/profile\/did:plc:p\/post\/3kp" class="[^"]*">@carol.bsky.social への返信<\/a>/,
    );
  });

  it('返信先の uri が at-uri として読めなければ、リンクにしない', () => {
    const html = render({ replyParentUri: 'nope', replyParentAuthorHandle: null });

    expect(html).toContain('>返信</div>');
    expect(html).not.toMatch(/<a [^>]*>返信<\/a>/);
  });

  it('動画のカードを、同じタブで開く iori 内の詳細へのリンクにする', () => {
    const html = render({
      embed: { type: 'video', thumbnail: null, playlist: 'https://video.example/playlist.m3u8' },
    });

    expect(html).toMatch(/<a href="\/bluesky\/profile\/did:plc:author\/post\/3kabc" class="relative block/);
  });

  describe('いいねのボタン', () => {
    const handlers = { onLike: () => {}, onUndoLike: () => {} };

    it('ハンドラが渡されないときはボタンを出さない', () => {
      expect(render({})).not.toContain('<button');
    });

    it('いいねしていなければ、塗りなしで「いいね」の title の button にする', () => {
      const html = render({ liked: false }, handlers);

      expect(html).toContain('type="button"');
      expect(html).toContain('title="いいね"');
      expect(html).toContain('fill="none"');
      expect(html).not.toContain('disabled');
    });

    it('いいね済みなら、塗りつぶしの色で「いいねを取り消す」の title にする', () => {
      const html = render({ liked: true }, handlers);

      expect(html).toContain('title="いいねを取り消す"');
      expect(html).toContain('fill="currentColor"');
      expect(html).toContain('text-terracotta dark:text-terracotta-light');
    });

    it('送信中は disabled にし、押した後の状態に合わせた title を出す', () => {
      expect(render({ liked: true }, { ...handlers, isLikePending: true })).toContain('title="いいね中..."');
      expect(render({ liked: false }, { ...handlers, isLikePending: true })).toContain(
        'title="いいね取り消し中..."',
      );
      expect(render({ liked: false }, { ...handlers, isLikePending: true })).toContain('disabled');
    });

    it('件数は表示しない', () => {
      expect(render({ liked: true }, handlers)).not.toMatch(/<span class="text-sm">\d+<\/span>/);
    });
  });

  it('Fediverse の投稿と同じく、操作のボタンを右寄せでリポスト、いいねの順に並べる', () => {
    const html = render({}, { onLike: () => {}, onRepost: () => {} });

    expect(html).toContain('class="flex items-center justify-end gap-4 pt-1"');
    expect(html.indexOf('title="リポスト"')).toBeLessThan(html.indexOf('title="いいね"'));
  });

  describe('リポストのボタン', () => {
    const handlers = { onRepost: () => {}, onUndoRepost: () => {} };

    it('onRepost が渡されないときはボタンを出さない', () => {
      expect(render({})).not.toContain('<button');
      expect(render({}, { onLike: () => {} })).not.toContain('title="リポスト"');
    });

    it('リポストしていなければ、塗りなしで「リポスト」の title の button にする', () => {
      const html = render({ reposted: false }, handlers);

      expect(html).toContain('type="button"');
      expect(html).toContain('title="リポスト"');
      expect(html).toContain('fill="none"');
      expect(html).not.toContain('disabled');
    });

    it('リポスト済みなら、塗りつぶしの色で「リポストを取り消す」の title にする', () => {
      const html = render({ reposted: true }, handlers);

      expect(html).toContain('title="リポストを取り消す"');
      expect(html).toContain('fill="currentColor"');
      expect(html).toContain('text-sage dark:text-sage');
    });

    it('送信中は disabled にし、押した後の状態に合わせた title を出す', () => {
      expect(render({ reposted: true }, { ...handlers, isRepostPending: true })).toContain('title="リポスト中..."');
      expect(render({ reposted: false }, { ...handlers, isRepostPending: true })).toContain(
        'title="リポスト取り消し中..."',
      );
      expect(render({ reposted: false }, { ...handlers, isRepostPending: true })).toContain('disabled');
    });

    it('いいねのボタンと並べて出し、リポストの行の表示は変えない', () => {
      const html = render({ repostedByHandle: 'bob.example', reposted: false }, {
        ...handlers,
        onLike: () => {},
        onUndoLike: () => {},
      });

      expect(html).toContain('title="リポスト"');
      expect(html).toContain('title="いいね"');
      expect(html).toContain('@bob.example がリポスト');
    });
  });
});
