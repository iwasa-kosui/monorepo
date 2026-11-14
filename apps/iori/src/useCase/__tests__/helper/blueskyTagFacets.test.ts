import { describe, expect, it } from 'vitest';

import { toFacet } from '../../../adaptor/bluesky/blueskyPostRecord.ts';
import { withTagFacets } from '../../helper/blueskyTagFacets.ts';

const tag = (byteStart: number, byteEnd: number, value: string) => ({
  index: { byteStart, byteEnd },
  features: [{ $type: 'app.bsky.richtext.facet#tag', tag: value }],
});

describe('withTagFacets', () => {
  it('英字のハッシュタグから、# を含まない tag 値の facet を作る', () => {
    expect(withTagFacets('hello #iori world', [])).toEqual([tag(6, 11, 'iori')]);
  });

  it('日本語のハッシュタグは、UTF-8 のバイト位置で facet を作る', () => {
    expect(withTagFacets('#日本語', [])).toEqual([tag(0, 10, '日本語')]);
    expect(withTagFacets('こんにちは #日本語', [])).toEqual([tag(16, 26, '日本語')]);
  });

  it('全角の ＃ もハッシュタグにする', () => {
    expect(withTagFacets('＃iori', [])).toEqual([tag(0, 7, 'iori')]);
  });

  it('末尾の句読点は tag 値と範囲から除く', () => {
    expect(withTagFacets('#iori。', [])).toEqual([tag(0, 5, 'iori')]);
    expect(withTagFacets('#iori!', [])).toEqual([tag(0, 5, 'iori')]);
  });

  it('数字だけのハッシュタグにはしない', () => {
    expect(withTagFacets('#123', [])).toEqual([]);
  });

  it('URL の中の # はハッシュタグにしない', () => {
    expect(withTagFacets('https://example.com/#a', [])).toEqual([]);
  });

  it('直前が空白でない # はハッシュタグにしない', () => {
    expect(withTagFacets('a#b', [])).toEqual([]);
  });

  it('64 文字までは対象にし、65 文字以上は除く', () => {
    expect(withTagFacets(`#${'a'.repeat(64)}`, [])).toEqual([tag(0, 65, 'a'.repeat(64))]);
    expect(withTagFacets(`#${'a'.repeat(65)}`, [])).toEqual([]);
  });

  it('サロゲートペアや ZWJ の絵文字を前に含む本文でも、UTF-8 のバイト位置を合わせる', () => {
    expect(withTagFacets('👍🏽 #iori', [])).toEqual([tag(9, 14, 'iori')]);
    expect(withTagFacets('👨‍👩‍👧‍👦 #iori', [])).toEqual([tag(26, 31, 'iori')]);
  });

  it('link facet と部分的に重なるハッシュタグは足さず、link facet はそのまま残す', () => {
    const link = toFacet('#iori', { start: 0, end: 3, uri: 'https://example.com/x' });

    expect(withTagFacets('#iori', [link])).toEqual([link]);
  });

  it('ちょうど同じ範囲の link facet は、tag facet に置き換える', () => {
    const text = 'こんにちは #iori';
    const link = toFacet(text, { start: 6, end: 11, uri: 'https://mastodon.example/tags/iori' });

    expect(withTagFacets(text, [link])).toEqual([tag(16, 21, 'iori')]);
  });

  it('範囲が同じでも、ハッシュタグのページではない link は残し、tag facet を足さない', () => {
    const link = toFacet('#iori', { start: 0, end: 5, uri: 'https://example.com/x' });

    expect(withTagFacets('#iori', [link])).toEqual([link]);
  });

  it('ハッシュタグのページの URL は大文字と小文字・パーセントエンコードの違いを無視して置き換える', () => {
    const encoded = toFacet('#日本語', {
      start: 0,
      end: 4,
      uri: 'https://mastodon.example/tags/%E6%97%A5%E6%9C%AC%E8%AA%9E',
    });
    const cased = toFacet('#IORI', { start: 0, end: 5, uri: 'https://mastodon.example/tags/iori' });

    expect(withTagFacets('#日本語', [encoded])).toEqual([tag(0, 10, '日本語')]);
    expect(withTagFacets('#IORI', [cased])).toEqual([tag(0, 5, 'IORI')]);
  });

  it('同じ範囲でも link 以外の facet とは重なりとして扱い、tag facet を足さない', () => {
    const mention = {
      index: { byteStart: 0, byteEnd: 5 },
      features: [{ $type: 'app.bsky.richtext.facet#mention', did: 'did:plc:alice' }],
    } as const;

    expect(withTagFacets('#iori', [mention])).toEqual([mention]);
  });

  it('excludeTruncated のとき、切り詰めで途中で切れたハッシュタグは足さない', () => {
    expect(withTagFacets('#iori #io…\nhttps://example.com/x', [], { excludeTruncated: true })).toEqual([
      tag(0, 5, 'iori'),
    ]);
  });

  it('既存の facet と合わせて byteStart の昇順に並べる', () => {
    const text = '#a https://example.com/x #b';
    const link = toFacet(text, { start: 3, end: 24, uri: 'https://example.com/x' });

    expect(withTagFacets(text, [link]).map(({ index }) => index.byteStart)).toEqual([0, 3, 25]);
  });
});
