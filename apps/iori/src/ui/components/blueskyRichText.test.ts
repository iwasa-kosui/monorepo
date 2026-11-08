import { describe, expect, it } from 'vitest';

import type { BlueskyTimelineFacet } from '../../domain/blueskyTimeline/blueskyTimelineItem.ts';
import { blueskyPostUrl, blueskyPostUrlOfUri, segmentBlueskyText } from './blueskyRichText.ts';

const bytes = (text: string) => new TextEncoder().encode(text).length;
const link = (byteStart: number, byteEnd: number, uri: string): BlueskyTimelineFacet => ({
  byteStart,
  byteEnd,
  feature: { type: 'link', uri },
});

describe('segmentBlueskyText', () => {
  it('facets が無ければ本文全体を 1 区間にする', () => {
    expect(segmentBlueskyText('hello', [])).toEqual([{ text: 'hello', href: undefined }]);
    expect(segmentBlueskyText('', [])).toEqual([]);
  });

  it('link・mention・tag を UTF-8 バイトオフセットで区切り、リンク先を付ける', () => {
    const text = 'see https://example.com @alice #iori end';
    const start = (needle: string) => bytes(text.slice(0, text.indexOf(needle)));
    const facets: BlueskyTimelineFacet[] = [
      link(start('https://'), start('https://') + bytes('https://example.com'), 'https://example.com'),
      {
        byteStart: start('@alice'),
        byteEnd: start('@alice') + bytes('@alice'),
        feature: { type: 'mention', did: 'did:plc:alice' },
      },
      { byteStart: start('#iori'), byteEnd: start('#iori') + bytes('#iori'), feature: { type: 'tag', tag: 'iori' } },
    ];

    expect(segmentBlueskyText(text, facets)).toEqual([
      { text: 'see ', href: undefined },
      { text: 'https://example.com', href: 'https://example.com' },
      { text: ' ', href: undefined },
      { text: '@alice', href: 'https://bsky.app/profile/did%3Aplc%3Aalice' },
      { text: ' ', href: undefined },
      { text: '#iori', href: 'https://bsky.app/hashtag/iori' },
      { text: ' end', href: undefined },
    ]);
  });

  it('日本語と絵文字の後ろの facet も、バイト単位で正しい文字列に対応づける', () => {
    const text = '日本語😀 https://example.com/ほげ 終わり';
    const url = 'https://example.com/ほげ';
    const byteStart = bytes('日本語😀 ');

    expect(segmentBlueskyText(text, [link(byteStart, byteStart + bytes(url), url)])).toEqual([
      { text: '日本語😀 ', href: undefined },
      { text: url, href: url },
      { text: ' 終わり', href: undefined },
    ]);
  });

  it('タグのリンク先は URL エンコードする', () => {
    const facets: BlueskyTimelineFacet[] = [{
      byteStart: 0,
      byteEnd: bytes('#日本'),
      feature: { type: 'tag', tag: '日本' },
    }];

    expect(segmentBlueskyText('#日本', facets)).toEqual([
      { text: '#日本', href: `https://bsky.app/hashtag/${encodeURIComponent('日本')}` },
    ]);
  });

  it.each([
    ['javascript:alert(1)'],
    ['data:text/html,<script>alert(1)</script>'],
    ['ftp://example.com/file'],
    ['not a url'],
  ])('http/https 以外の link %s はリンクにせず、本文のまま残す', (uri) => {
    expect(segmentBlueskyText('click here', [link(0, 5, uri)])).toEqual([{ text: 'click here', href: undefined }]);
  });

  it('facets が順不同でも並べ替えて処理する', () => {
    const facets = [link(6, 11, 'https://b.example'), link(0, 5, 'https://a.example')];

    expect(segmentBlueskyText('alpha bravo', facets).map((segment) => segment.href)).toEqual([
      'https://a.example',
      undefined,
      'https://b.example',
    ]);
  });

  it('範囲外・逆順・重なり・文字の途中を指す facet は無視する', () => {
    const text = '日本語';
    expect(segmentBlueskyText(text, [link(0, 100, 'https://a.example')])).toEqual([{ text, href: undefined }]);
    expect(segmentBlueskyText(text, [link(3, 3, 'https://a.example')])).toEqual([{ text, href: undefined }]);
    expect(segmentBlueskyText(text, [link(1, 4, 'https://a.example')])).toEqual([{ text, href: undefined }]);
    expect(segmentBlueskyText(text, [link(0, 2, 'https://a.example')])).toEqual([{ text, href: undefined }]);
    expect(
      segmentBlueskyText('abcdef', [link(0, 4, 'https://a.example'), link(2, 6, 'https://b.example')]),
    ).toEqual([
      { text: 'abcd', href: 'https://a.example' },
      { text: 'ef', href: undefined },
    ]);
  });

  it('HTML として解釈されうる文字列も、そのまま文字列として返す', () => {
    expect(segmentBlueskyText('<img src=x onerror=alert(1)>', [])).toEqual([
      { text: '<img src=x onerror=alert(1)>', href: undefined },
    ]);
  });
});

describe('blueskyPostUrl', () => {
  it('投稿者の DID と uri の末尾の rkey から bsky.app の URL を作る', () => {
    expect(blueskyPostUrl('did:plc:abc', 'at://did:plc:abc/app.bsky.feed.post/3kxyz')).toBe(
      'https://bsky.app/profile/did%3Aplc%3Aabc/post/3kxyz',
    );
  });

  it('at:// の形でない uri は URL にしない', () => {
    expect(blueskyPostUrl('did:plc:abc', 'https://example.com/x')).toBeUndefined();
    expect(blueskyPostUrlOfUri('nope')).toBeUndefined();
  });

  it('uri の DID から URL を作る（引用用）', () => {
    expect(blueskyPostUrlOfUri('at://did:plc:q/app.bsky.feed.post/3kq')).toBe(
      'https://bsky.app/profile/did%3Aplc%3Aq/post/3kq',
    );
  });
});
