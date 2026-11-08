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
};
const render = (item: Partial<IoriBlueskyTimelineItemBody>): string =>
  String(jsx(BlueskyTimelineItemView, { item: { ...base, ...item } }));

describe('BlueskyTimelineItemView', () => {
  it('投稿者の表示名と @handle、本文、bsky.app の投稿へのリンクを出す', () => {
    const html = render({});

    expect(html).toContain('Alice');
    expect(html).toContain('@alice.bsky.social');
    expect(html).toContain('本文です');
    expect(html).toContain('href="https://bsky.app/profile/did:plc:author/post/3kabc"');
    expect(html).toContain('src="https://cdn.example/avatar.jpg"');
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
    expect(html).toContain('href="https://bsky.app/profile/did:plc:q/post/3kq"');
  });
});
