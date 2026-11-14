import { Result } from '@iwasa-kosui/result';
import { describe, expect, it } from 'vitest';

import { Instant } from '../../domain/instant/instant.ts';
import {
  BLUESKY_MAX_GRAPHEMES,
  BLUESKY_MAX_IMAGE_BYTES,
  BLUESKY_MAX_TEXT_BYTES,
  BLUESKY_MAX_THUMB_BYTES,
  BLUESKY_SENSITIVE_SELF_LABEL,
  type BlueskyImageInput,
  type BlueskyPostDraft,
  buildBlueskyPostDraft,
  type BuildBlueskyPostInput,
  toBlueskyPostRecord,
} from './blueskyPostRecord.ts';

const POST_URL = 'https://iori.example/users/kosui/posts/0b0a5ac2-5c1f-4a8f-9b69-0d9a3c0a1111';
const CREATED_AT = Instant.orThrow(Date.UTC(2026, 10, 8, 3, 4, 5));
const segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' });
const graphemeCount = (text: string) => Array.from(segmenter.segment(text)).length;
const utf8 = (text: string) => new TextEncoder().encode(text);

const uriOf = (facet: BlueskyPostDraft['facets'][number]) => {
  const feature = facet.features[0];
  return feature.$type === 'app.bsky.richtext.facet#link' ? feature.uri : undefined;
};

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
    expect(uriOf(last)).toBe(POST_URL);
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
    const uris = draft.facets.map((facet) => uriOf(facet));
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
    expect(uriOf(last)).toBe(imageUrl('big'));
  });

  it('外した画像が複数あれば、それぞれの URL を行ごとに付ける', () => {
    const draft = build({ images: [image(BLUESKY_MAX_IMAGE_BYTES + 1, 'a'), image(BLUESKY_MAX_IMAGE_BYTES + 1, 'b')] });
    expect(draft.text).toBe(`hello\n${imageUrl('a')}\n${imageUrl('b')}`);
    expect(draft.facets.map((facet) => uriOf(facet))).toEqual([imageUrl('a'), imageUrl('b')]);
  });

  it('本文が空なら画像の URL だけにする', () => {
    const draft = build({ html: '', images: [image(BLUESKY_MAX_IMAGE_BYTES + 1, 'big')] });
    expect(draft.text).toBe(imageUrl('big'));
  });

  it('本文が収まらないときは画像の URL ではなく投稿 URL を 1 つだけ付ける', () => {
    const draft = build({ html: `<p>${'あ'.repeat(400)}</p>`, images: [image(BLUESKY_MAX_IMAGE_BYTES + 1, 'big')] });
    expect(draft.text.split(POST_URL)).toHaveLength(2);
    expect(draft.text).not.toContain(imageUrl('big'));
    expect(draft.facets.filter((facet) => uriOf(facet) === POST_URL)).toHaveLength(1);
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
    ['unlisted' as const],
    ['private' as const],
  ])('公開範囲が %s なら visibility をスキップにする', (visibility) => {
    expect(buildBlueskyPostDraft(input({ visibility }))).toEqual(Result.err('visibility'));
  });

  it('reply_to_unsent をスキップにする', () => {
    expect(buildBlueskyPostDraft(input({ replyTo: { kind: 'unsent' } }))).toEqual(Result.err('reply_to_unsent'));
  });

  it('summary が空文字や空白だけならスキップしない', () => {
    expect(buildBlueskyPostDraft(input({ summary: '' })).ok).toBe(true);
    expect(buildBlueskyPostDraft(input({ summary: '  ' })).ok).toBe(true);
  });

  it('CW 付きでも、公開でなければ visibility をスキップにする', () => {
    expect(buildBlueskyPostDraft(input({ visibility: 'private', summary: 'CW', sensitive: true }))).toEqual(
      Result.err('visibility'),
    );
    expect(buildBlueskyPostDraft(input({ visibility: 'unlisted', summary: 'CW' }))).toEqual(Result.err('visibility'));
  });

  it('公開範囲が公開でなければ、返信先が未送信でも visibility を先に判定する', () => {
    expect(buildBlueskyPostDraft(input({ visibility: 'unlisted', replyTo: { kind: 'unsent' } }))).toEqual(
      Result.err('visibility'),
    );
  });

  it('公開の CW 付きなら、CW の文と投稿 URL だけを送る', () => {
    const draft = build({ visibility: 'public', summary: ' 注意 ', html: '<p>本文</p>' });
    expect(draft.text).toBe(`注意\n${POST_URL}`);
  });

  it('CW 付きでも、返信先が未送信なら reply_to_unsent をスキップにする', () => {
    expect(buildBlueskyPostDraft(input({ summary: 'CW', sensitive: true, replyTo: { kind: 'unsent' } }))).toEqual(
      Result.err('reply_to_unsent'),
    );
  });
});

describe('buildBlueskyPostDraft の CW', () => {
  it('本文を summary と投稿 URL だけにし、投稿 URL に link facet を付ける', () => {
    const draft = build({ summary: ' 注意 ', html: '<p>本文 <a href="https://example.com/x">x</a></p>' });
    expect(draft.text).toBe(`注意\n${POST_URL}`);
    expect(draft.facets).toHaveLength(1);
    const [facet] = draft.facets;
    expect(sliceBytes(draft.text, facet!.index.byteStart, facet!.index.byteEnd)).toBe(POST_URL);
    expect(uriOf(facet!)).toBe(POST_URL);
  });

  it('画像と linkPreview を渡しても、images を空にして embed を作らない', () => {
    const draft = build({
      summary: '注意',
      images: [image(10, 'a')],
      unavailableImageUrls: ['https://iori.example/uploads/gone.png'],
      linkPreview: {
        url: 'https://example.com/x',
        title: 't',
        description: 'd',
        thumb: { bytes: utf8('x'), mimeType: 'image/png' },
      },
    });
    expect(draft.text).toBe(`注意\n${POST_URL}`);
    expect(draft.images).toEqual([]);
    expect(draft.external).toBeUndefined();
    expect('embed' in toBlueskyPostRecord(draft, { images: [] })).toBe(false);
  });

  it('長い summary を …\\n{postUrl} で終わるよう切り詰める', () => {
    const draft = build({ summary: 'あ'.repeat(500) });
    expect(draft.text.endsWith(`…\n${POST_URL}`)).toBe(true);
    expect(graphemeCount(draft.text)).toBeLessThanOrEqual(BLUESKY_MAX_GRAPHEMES);
    expect(utf8(draft.text).byteLength).toBeLessThanOrEqual(BLUESKY_MAX_TEXT_BYTES);
    const facet = draft.facets.at(-1)!;
    expect(sliceBytes(draft.text, facet.index.byteStart, facet.index.byteEnd)).toBe(POST_URL);
  });

  it('record に labels を付けない', () => {
    const record = toBlueskyPostRecord(build({ summary: '注意', sensitive: true }), { images: [] });
    expect('labels' in record).toBe(false);
  });

  it('返信の root と parent を CW の draft にも付ける', () => {
    const root = { uri: 'at://did:plc:x/app.bsky.feed.post/root', cid: 'cidroot' };
    const parent = { uri: 'at://did:plc:x/app.bsky.feed.post/parent', cid: 'cidparent' };
    expect(build({ summary: '注意', replyTo: { kind: 'sent', root, parent } }).reply).toEqual({ root, parent });
  });
});

describe('buildBlueskyPostDraft の sensitive', () => {
  it('画像を保ち、record に self-label を付ける', () => {
    const draft = build({ sensitive: true, images: [image(10, 'a')] });
    expect(draft.images).toHaveLength(1);
    expect(toBlueskyPostRecord(draft, { images: [] }).labels).toEqual({
      $type: 'com.atproto.label.defs#selfLabels',
      values: [{ val: BLUESKY_SENSITIVE_SELF_LABEL }],
    });
  });

  it('画像の無い sensitive の投稿には labels を付けない', () => {
    const record = toBlueskyPostRecord(build({ sensitive: true, images: [] }), { images: [] });
    expect('labels' in record).toBe(false);
  });
});

describe('buildBlueskyPostDraft の引用', () => {
  const quoteUri = 'https://iori.example/users/kosui/posts/11111111-1111-4111-8111-111111111111';
  const ref = { uri: 'at://did:plc:x/app.bsky.feed.post/quoted', cid: 'cidquoted' };
  const quote = { kind: 'sent' as const, ...ref, quoteUri };
  const html = `<p>hello</p><p>RE: <a href="${quoteUri}">${quoteUri}</a></p>`;
  const preview = { url: 'https://example.com/article', title: 'タイトル', description: '説明' };

  it('引用だけなら embed.record にし、本文から RE: の段落を取り除く', () => {
    const draft = build({ html, quote });
    expect(draft.text).toBe('hello');
    expect(draft.facets).toEqual([]);
    expect(toBlueskyPostRecord(draft, { images: [] }).embed).toEqual({ $type: 'app.bsky.embed.record', record: ref });
  });

  it('画像があれば recordWithMedia の media に images を入れる', () => {
    const blob = { $type: 'blob' as const, ref: { $link: 'img' }, mimeType: 'image/png', size: 10 };
    const draft = build({ html, quote, images: [image(10, 'a')] });
    expect(toBlueskyPostRecord(draft, { images: [blob] }).embed).toEqual({
      $type: 'app.bsky.embed.recordWithMedia',
      record: { record: ref },
      media: { $type: 'app.bsky.embed.images', images: [{ alt: 'a', image: blob }] },
    });
  });

  it('画像が無く linkPreview があれば recordWithMedia の media に external を入れる', () => {
    const draft = build({ html, quote, linkPreview: preview });
    expect(toBlueskyPostRecord(draft, { images: [] }).embed).toEqual({
      $type: 'app.bsky.embed.recordWithMedia',
      record: { record: ref },
      media: {
        $type: 'app.bsky.embed.external',
        external: { uri: preview.url, title: 'タイトル', description: '説明' },
      },
    });
  });

  it('ユーザーが本文に書いた引用先へのリンクは消さない', () => {
    const own = `<p>see <a href="${quoteUri}">this</a></p>`;
    expect(build({ html: own, quote }).text).toBe('see this');
  });

  it('300 graphemes の判定は RE: の段落を取り除いた本文で行う', () => {
    const body = 'あ'.repeat(BLUESKY_MAX_GRAPHEMES);
    const draft = build({ html: `<p>${body}</p><p>RE: <a href="${quoteUri}">${quoteUri}</a></p>`, quote });
    expect(draft.text).toBe(body);
  });

  it('引用が none、unsent、waiting のときは RE: の段落を残し、embed を作らない', () => {
    for (const context of [{ kind: 'none' }, { kind: 'unsent' }, { kind: 'waiting' }] as const) {
      const draft = build({ html, quote: context });
      expect(draft.text).toBe(`hello\n\nRE: ${quoteUri}`);
      expect(draft.quote).toBeUndefined();
      expect('embed' in toBlueskyPostRecord(draft, { images: [] })).toBe(false);
    }
  });

  it('CW 付きの投稿は引用を付けず、embed を作らない', () => {
    const draft = build({ summary: '注意', html, quote });
    expect(draft.quote).toBeUndefined();
    expect('embed' in toBlueskyPostRecord(draft, { images: [] })).toBe(false);
  });

  it('返信と引用が両方あれば、reply と embed の両方を付ける', () => {
    const root = { uri: 'at://did:plc:x/app.bsky.feed.post/root', cid: 'cidroot' };
    const record = toBlueskyPostRecord(build({ html, quote, replyTo: { kind: 'sent', root, parent: root } }), {
      images: [],
    });
    expect(record.reply).toEqual({ root, parent: root });
    expect(record.embed).toEqual({ $type: 'app.bsky.embed.record', record: ref });
  });
});
