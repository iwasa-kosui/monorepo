import { describe, expect, it } from 'vitest';

import { toFacet } from '../../../adaptor/bluesky/blueskyPostRecord.ts';
import { findMentionHandles, MAX_RESOLVED_MENTIONS, withMentionFacets } from '../../helper/blueskyMentionFacets.ts';

const DIDS = new Map([['alice.bsky.social', 'did:plc:alice'], ['bob.example.com', 'did:plc:bob']]);
const mention = (byteStart: number, byteEnd: number, did: string) => ({
  index: { byteStart, byteEnd },
  features: [{ $type: 'app.bsky.richtext.facet#mention', did }],
});

describe('findMentionHandles', () => {
  it('ハンドルを小文字にして、重複なしで返す', () => {
    expect(findMentionHandles('@Alice.bsky.social と (@bob.example.com) と @alice.bsky.social', [])).toEqual([
      'alice.bsky.social',
      'bob.example.com',
    ]);
  });

  it('メールアドレスや URL の中の @ は対象にしない', () => {
    expect(findMentionHandles('a@alice.bsky.social https://example.com/@bob.example.com', [])).toEqual([]);
  });

  it('本文の先頭から数えて、異なるハンドルを最大10件までにする', () => {
    const handles = Array.from({ length: 12 }, (_, index) => `user${index + 1}.bsky.social`);
    const text = [...handles, handles[0]].map((handle) => `@${handle}`).join(' ');

    expect(MAX_RESOLVED_MENTIONS).toBe(10);
    expect(findMentionHandles(text, [])).toEqual(handles.slice(0, 10));
  });

  it('excludeTruncated のとき、切り詰めで途中で切れたハンドルは対象にしない', () => {
    expect(
      findMentionHandles('@alice.bsky.social と @bob.example.co…\nhttps://example.com/x', [], {
        excludeTruncated: true,
      }),
    ).toEqual(['alice.bsky.social']);
  });

  it('excludeTruncated のとき、ドットやハイフンの後で切れたハンドルも対象にしない', () => {
    expect(findMentionHandles('@bob.example.co.…', [], { excludeTruncated: true })).toEqual([]);
    expect(findMentionHandles('@a.bob-…', [], { excludeTruncated: true })).toEqual([]);
  });

  it('excludeTruncated でなければ、末尾に … があってもハンドルを対象にする', () => {
    expect(findMentionHandles('@alice.bsky.social…', [])).toEqual(['alice.bsky.social']);
  });

  it('link facet と重なるハンドルは対象にせず、上限はその後に数える', () => {
    const handles = Array.from({ length: 11 }, (_, index) => `user${index + 1}.bsky.social`);
    const text = ['@alice.bsky.social', ...handles.map((handle) => `@${handle}`)].join(' ');
    const link = toFacet(text, { start: 0, end: 18, uri: 'https://mastodon.example/@alice.bsky.social' });

    expect(findMentionHandles(text, [link])).toEqual(handles.slice(0, 10));
  });
});

describe('withMentionFacets', () => {
  it('日本語を含む本文でも、UTF-8 のバイト位置で mention facet を作る', () => {
    expect(withMentionFacets('こんにちは @alice.bsky.social さん', [], DIDS)).toEqual([
      mention(16, 34, 'did:plc:alice'),
    ]);
  });

  it('サロゲートペアの絵文字の後でも、バイト位置を合わせる', () => {
    expect(withMentionFacets('😀 @alice.bsky.social', [], DIDS)).toEqual([mention(5, 23, 'did:plc:alice')]);
  });

  it('解決できないハンドルには mention facet を付けない', () => {
    expect(withMentionFacets('@alice.bsky.social @nobody.bsky.social', [], DIDS)).toEqual([
      mention(0, 18, 'did:plc:alice'),
    ]);
  });

  it('link facet と重なる mention は足さず、link facet はそのまま残す', () => {
    const text = '@alice.bsky.social と @bob.example.com';
    const link = toFacet(text, { start: 0, end: 18, uri: 'https://mastodon.example/@alice.bsky.social' });

    expect(withMentionFacets(text, [link], DIDS)).toEqual([link, mention(23, 39, 'did:plc:bob')]);
  });

  it('切り詰めで途中で切れたハンドルには、解決できる DID があっても mention facet を付けない', () => {
    const dids = new Map([...DIDS, ['bob.example.co', 'did:plc:bobco']]);

    expect(withMentionFacets('@alice.bsky.social と @bob.example.co…', [], dids, { excludeTruncated: true })).toEqual([
      mention(0, 18, 'did:plc:alice'),
    ]);
  });

  it('excludeTruncated のとき、ドットやハイフンの後で切れたハンドルにも mention facet を付けない', () => {
    const dids = new Map([['bob.example.co', 'did:plc:bobco'], ['a.bob', 'did:plc:abob']]);

    expect(withMentionFacets('@bob.example.co.…', [], dids, { excludeTruncated: true })).toEqual([]);
    expect(withMentionFacets('@a.bob-…', [], dids, { excludeTruncated: true })).toEqual([]);
  });

  it('excludeTruncated でなければ、末尾に … があっても mention facet を付ける', () => {
    expect(withMentionFacets('@alice.bsky.social…', [], DIDS)).toEqual([mention(0, 18, 'did:plc:alice')]);
  });

  it('byteStart の順に並べる', () => {
    const text = '@bob.example.com https://example.com/x @alice.bsky.social';
    const link = toFacet(text, { start: 17, end: 38, uri: 'https://example.com/x' });

    expect(withMentionFacets(text, [link], DIDS).map(({ index }) => index.byteStart)).toEqual([0, 17, 39]);
  });

  it('解決できたハンドルが無ければ、渡した facet をそのまま返す', () => {
    const link = toFacet('x', { start: 0, end: 1, uri: 'https://example.com' });

    expect(withMentionFacets('x @nobody.bsky.social', [link], new Map())).toEqual([link]);
  });
});
