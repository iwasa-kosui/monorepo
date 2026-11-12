import { Result } from '@iwasa-kosui/result';
import { describe, expect, it } from 'vitest';

import { Instant } from '../../domain/instant/instant.ts';
import {
  BLUESKY_MAX_GRAPHEMES,
  BLUESKY_MAX_IMAGE_BYTES,
  BLUESKY_MAX_TEXT_BYTES,
  BLUESKY_MAX_THUMB_BYTES,
  type BlueskyImageInput,
  buildBlueskyPostDraft,
  type BuildBlueskyPostInput,
  selectBlueskyImages,
  toBlueskyPostRecord,
} from './blueskyPostRecord.ts';

const POST_URL = 'https://iori.example/users/kosui/posts/0b0a5ac2-5c1f-4a8f-9b69-0d9a3c0a1111';
const CREATED_AT = Instant.orThrow(Date.UTC(2026, 10, 8, 3, 4, 5));
const segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' });
const graphemeCount = (text: string) => Array.from(segmenter.segment(text)).length;
const utf8 = (text: string) => new TextEncoder().encode(text);

const imageUrl = (alt: string | null) => `https://iori.example/uploads/${alt ?? 'image'}.png`;

const image = (size: number, alt: string | null = null): BlueskyImageInput => ({
  bytes: new Uint8Array(size),
  mimeType: 'image/png',
  alt,
  url: imageUrl(alt),
});

const input = (overrides: Partial<BuildBlueskyPostInput> = {}): BuildBlueskyPostInput => ({
  visibility: 'public',
  html: '<p>hello</p>',
  summary: null,
  sensitive: false,
  postUrl: POST_URL,
  images: [],
  replyTo: { kind: 'none' },
  createdAt: CREATED_AT,
  ...overrides,
});

const build = (overrides: Partial<BuildBlueskyPostInput> = {}) => {
  const draft = buildBlueskyPostDraft(input(overrides));
  if (!draft.ok) throw new Error(`skipped: ${draft.err}`);
  return draft.val;
};

const sliceBytes = (text: string, byteStart: number, byteEnd: number) =>
  new TextDecoder().decode(utf8(text).slice(byteStart, byteEnd));

describe('buildBlueskyPostDraft の本文と facet', () => {
  it('プレーンテキストと createdAt を作り、facet が無ければ record に facets を出さない', () => {
    const draft = build();
    expect(draft.text).toBe('hello');
    expect(draft.facets).toEqual([]);
    expect(draft.createdAt).toBe('2026-11-08T03:04:05.000Z');
    const record = toBlueskyPostRecord(draft, { images: [] });
    expect(record).toEqual({
      $type: 'app.bsky.feed.post',
      text: 'hello',
      createdAt: '2026-11-08T03:04:05.000Z',
    });
    expect('langs' in record).toBe(false);
  });

  it('facet の byteStart と byteEnd を、日本語と絵文字を含む UTF-8 のバイト位置にする', () => {
    const draft = build({
      html: '<p>こんにちは👨‍👩‍👧 <a href="https://example.com/x">リンク🎉</a> と <a href="https://example.com/y">y</a></p>',
    });
    expect(draft.facets).toHaveLength(2);
    const [first, second] = draft.facets;
    expect(sliceBytes(draft.text, first!.index.byteStart, first!.index.byteEnd)).toBe('リンク🎉');
    expect(first!.features).toEqual([{ $type: 'app.bsky.richtext.facet#link', uri: 'https://example.com/x' }]);
    expect(sliceBytes(draft.text, second!.index.byteStart, second!.index.byteEnd)).toBe('y');
    expect(first!.index.byteStart).toBe(utf8('こんにちは👨‍👩‍👧 ').byteLength);
    expect(first!.index.byteStart).not.toBe('こんにちは👨‍👩‍👧 '.length);
  });
});

describe('buildBlueskyPostDraft の切り詰め', () => {
  it('300 graphemes を超える本文を末尾の … と投稿 URL に置き換え、URL に facet を付ける', () => {
    const draft = build({ html: `<p>${'あ'.repeat(400)}</p>` });
    expect(graphemeCount(draft.text)).toBeLessThanOrEqual(BLUESKY_MAX_GRAPHEMES);
    expect(draft.text.endsWith(`…\n${POST_URL}`)).toBe(true);
    const last = draft.facets.at(-1)!;
    expect(sliceBytes(draft.text, last.index.byteStart, last.index.byteEnd)).toBe(POST_URL);
    expect(last.features[0].uri).toBe(POST_URL);
    expect(graphemeCount(draft.text)).toBe(BLUESKY_MAX_GRAPHEMES);
  });

  it('grapheme の数え方に従い、結合した絵文字を 1 つと数える', () => {
    const family = '👨‍👩‍👧';
    const draft = build({ html: `<p>${family.repeat(320)}</p>` });
    expect(graphemeCount(draft.text)).toBeLessThanOrEqual(BLUESKY_MAX_GRAPHEMES);
    expect(utf8(draft.text).byteLength).toBeLessThanOrEqual(BLUESKY_MAX_TEXT_BYTES);
    expect(draft.text.endsWith(`…\n${POST_URL}`)).toBe(true);
    expect(draft.text.startsWith(family)).toBe(true);
  });

  it('300 graphemes 以内でも 3000 bytes を超えたら切り詰める', () => {
    const family = '👨‍👩‍👧';
    expect(utf8(family.repeat(200)).byteLength).toBeGreaterThan(BLUESKY_MAX_TEXT_BYTES);
    const draft = build({ html: `<p>${family.repeat(200)}</p>` });
    expect(utf8(draft.text).byteLength).toBeLessThanOrEqual(BLUESKY_MAX_TEXT_BYTES);
    expect(draft.text.endsWith(`…\n${POST_URL}`)).toBe(true);
  });

  it('切り詰めで壊れたリンクの facet を落とし、手前のリンクは残す', () => {
    const html = `<p><a href="https://example.com/keep">keep</a> ${'x'.repeat(200)} <a href="https://example.com/cut">${
      'y'.repeat(150)
    }</a></p>`;
    const draft = build({ html });
    const uris = draft.facets.map((facet) => facet.features[0].uri);
    expect(uris).toEqual(['https://example.com/keep', POST_URL]);
    for (const facet of draft.facets) {
      expect(facet.index.byteEnd).toBeLessThanOrEqual(utf8(draft.text).byteLength);
    }
  });

  it('ちょうど 300 graphemes なら切り詰めない', () => {
    const draft = build({ html: `<p>${'a'.repeat(300)}</p>` });
    expect(draft.text).toBe('a'.repeat(300));
  });
});

describe('buildBlueskyPostDraft の画像', () => {
  it('1,000,000 bytes を超える画像を外し、外した画像の URL を本文末尾に付ける', () => {
    const draft = build({
      images: [image(10, 'small'), image(BLUESKY_MAX_IMAGE_BYTES + 1, 'big'), image(BLUESKY_MAX_IMAGE_BYTES, 'edge')],
    });
    expect(draft.images.map((item) => item.alt)).toEqual(['small', 'edge']);
    expect(draft.text).toBe(`hello\n${imageUrl('big')}`);
    const last = draft.facets.at(-1)!;
    expect(sliceBytes(draft.text, last.index.byteStart, last.index.byteEnd)).toBe(imageUrl('big'));
    expect(last.features[0].uri).toBe(imageUrl('big'));
  });

  it('外した画像が複数あれば、それぞれの URL を行ごとに付ける', () => {
    const draft = build({ images: [image(BLUESKY_MAX_IMAGE_BYTES + 1, 'a'), image(BLUESKY_MAX_IMAGE_BYTES + 1, 'b')] });
    expect(draft.text).toBe(`hello\n${imageUrl('a')}\n${imageUrl('b')}`);
    expect(draft.facets.map((facet) => facet.features[0].uri)).toEqual([imageUrl('a'), imageUrl('b')]);
  });

  it('外した画像が無ければ URL を付けない', () => {
    const draft = build({ images: [image(10)] });
    expect(draft.text).toBe('hello');
  });

  it('本文が空なら画像の URL だけにする', () => {
    const draft = build({ html: '', images: [image(BLUESKY_MAX_IMAGE_BYTES + 1, 'big')] });
    expect(draft.text).toBe(imageUrl('big'));
  });

  it('本文が収まらないときは画像の URL ではなく投稿 URL を 1 つだけ付ける', () => {
    const draft = build({ html: `<p>${'あ'.repeat(400)}</p>`, images: [image(BLUESKY_MAX_IMAGE_BYTES + 1, 'big')] });
    expect(draft.text.split(POST_URL)).toHaveLength(2);
    expect(draft.text).not.toContain(imageUrl('big'));
    expect(draft.facets.filter((facet) => facet.features[0].uri === POST_URL)).toHaveLength(1);
  });

  it('画像の URL を付けると上限を超える本文は、投稿 URL での切り詰めの形にする', () => {
    const draft = build({ html: `<p>${'a'.repeat(290)}</p>`, images: [image(BLUESKY_MAX_IMAGE_BYTES + 1)] });
    expect(graphemeCount(draft.text)).toBeLessThanOrEqual(BLUESKY_MAX_GRAPHEMES);
    expect(draft.text.endsWith(`…\n${POST_URL}`)).toBe(true);
  });

  it('5 枚目以降を外して URL を付け、alt を持った embed.images にする', () => {
    const images = [1, 2, 3, 4, 5].map((n) => image(10, `alt${n}`));
    const draft = build({ images });
    expect(draft.images.map((item) => item.alt)).toEqual(['alt1', 'alt2', 'alt3', 'alt4']);
    expect(draft.text).toBe(`hello\n${imageUrl('alt5')}`);
    const blobs = draft.images.map((_, index) => ({
      $type: 'blob' as const,
      ref: { $link: `cid${index}` },
      mimeType: 'image/png',
      size: 10,
    }));
    expect(toBlueskyPostRecord(draft, { images: blobs }).embed).toEqual({
      $type: 'app.bsky.embed.images',
      images: blobs.map((blob, index) => ({ alt: `alt${index + 1}`, image: blob })),
    });
  });

  it('alt が無い画像の alt を空文字にする', () => {
    const draft = build({ images: [image(10, null)] });
    const blob = { $type: 'blob' as const, ref: { $link: 'c' }, mimeType: 'image/png', size: 10 };
    expect(toBlueskyPostRecord(draft, { images: [blob] }).embed).toEqual({
      $type: 'app.bsky.embed.images',
      images: [{ alt: '', image: blob }],
    });
  });

  it('取得できなかった画像も外した扱いにして画像の URL を付ける', () => {
    const draft = build({ unavailableImageUrls: [imageUrl('missing')] });
    expect(draft.text).toBe(`hello\n${imageUrl('missing')}`);
  });

  it('selectBlueskyImages は残した画像と外した画像を返す', () => {
    const big = image(BLUESKY_MAX_IMAGE_BYTES + 1, 'big');
    expect(selectBlueskyImages([image(1), big]).dropped).toEqual([big]);
  });
});

describe('buildBlueskyPostDraft の linkPreview', () => {
  const preview = {
    url: 'https://example.com/article',
    title: 'タイトル',
    description: '説明',
    thumb: { bytes: new Uint8Array(100), mimeType: 'image/jpeg' },
  };

  it('画像が無ければ external にし、thumb の blob を付ける', () => {
    const draft = build({ linkPreview: preview });
    expect(draft.external).toMatchObject({ uri: preview.url, title: 'タイトル', description: '説明' });
    const blob = { $type: 'blob' as const, ref: { $link: 'thumb' }, mimeType: 'image/jpeg', size: 100 };
    expect(toBlueskyPostRecord(draft, { images: [], thumb: blob }).embed).toEqual({
      $type: 'app.bsky.embed.external',
      external: { uri: preview.url, title: 'タイトル', description: '説明', thumb: blob },
    });
  });

  it('画像が残るときは external にしない', () => {
    const draft = build({ linkPreview: preview, images: [image(10)] });
    expect(draft.external).toBeUndefined();
  });

  it('thumb が 1,000,000 bytes を超えるときは thumb なしにする', () => {
    const draft = build({
      linkPreview: { ...preview, thumb: { bytes: new Uint8Array(BLUESKY_MAX_THUMB_BYTES + 1), mimeType: 'image/png' } },
    });
    expect(draft.external).toBeDefined();
    expect(draft.external?.thumb).toBeUndefined();
  });

  it('タイトルと説明が無いときは URL と空文字で埋める', () => {
    const draft = build({ linkPreview: { url: preview.url, title: null, description: null } });
    expect(draft.external).toEqual({ uri: preview.url, title: preview.url, description: '' });
  });

  it('画像をすべて外したときは external にして画像の URL も付ける', () => {
    const draft = build({ linkPreview: preview, images: [image(BLUESKY_MAX_IMAGE_BYTES + 1, 'big')] });
    expect(draft.external).toBeDefined();
    expect(draft.text).toBe(`hello\n${imageUrl('big')}`);
  });
});

describe('buildBlueskyPostDraft の返信とスキップ', () => {
  it('返信の root と parent を record の reply に入れる', () => {
    const root = { uri: 'at://did:plc:x/app.bsky.feed.post/root', cid: 'cidroot' };
    const parent = { uri: 'at://did:plc:x/app.bsky.feed.post/parent', cid: 'cidparent' };
    const draft = build({ replyTo: { kind: 'sent', root, parent } });
    expect(toBlueskyPostRecord(draft, { images: [] }).reply).toEqual({ root, parent });
  });

  it.each([
    ['visibility', { visibility: 'unlisted' as const }],
    ['visibility', { visibility: 'private' as const }],
    ['content_warning', { summary: 'CW' }],
    ['sensitive', { sensitive: true }],
    ['reply_to_unsent', { replyTo: { kind: 'unsent' as const } }],
  ])('%s をスキップにする', (reason, overrides) => {
    expect(buildBlueskyPostDraft(input(overrides))).toEqual(Result.err(reason));
  });

  it('summary が空文字や空白だけならスキップしない', () => {
    expect(buildBlueskyPostDraft(input({ summary: '' })).ok).toBe(true);
    expect(buildBlueskyPostDraft(input({ summary: '  ' })).ok).toBe(true);
  });

  it('visibility を CW より先に判定する', () => {
    expect(buildBlueskyPostDraft(input({ visibility: 'private', summary: 'CW', sensitive: true }))).toEqual(
      Result.err('visibility'),
    );
  });

  it('CW を sensitive と reply_to_unsent より先に判定する', () => {
    expect(buildBlueskyPostDraft(input({ summary: 'CW', sensitive: true, replyTo: { kind: 'unsent' } }))).toEqual(
      Result.err('content_warning'),
    );
    expect(buildBlueskyPostDraft(input({ sensitive: true, replyTo: { kind: 'unsent' } }))).toEqual(
      Result.err('sensitive'),
    );
  });
});
