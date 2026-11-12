import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { BlueskyPostRecord } from '../../../domain/blueskyCrosspost/blueskyPostRecord.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import type { BlueskyClient, BlueskyClientError, BlueskyQueryClient } from '../../../ports/blueskyClient.ts';
import { publishBlueskyPost } from '../../helper/publishBlueskyPost.ts';

const NOW = Instant.orThrow(Date.UTC(2026, 10, 12, 3));
const ROOT = { uri: 'at://did:plc:a/app.bsky.feed.post/1', cid: 'bafyroot' };
const PARENT = { uri: 'at://did:plc:b/app.bsky.feed.post/2', cid: 'bafyparent' };
const DIDS: Record<string, string> = { 'alice.bsky.social': 'did:plc:alice', 'bob.example.com': 'did:plc:bob' };
const failure: BlueskyClientError = {
  type: 'BlueskyClientError',
  kind: 'http',
  message: 'createRecord failed: status 500',
  status: 500,
};

const setup = () => {
  const createRecord = vi.fn<BlueskyClient['createRecord']>(async (_record, rkey) =>
    RA.ok({ uri: `at://did:plc:me/app.bsky.feed.post/${rkey}`, cid: 'bafynew', rkey })
  );
  const uploadBlob = vi.fn<BlueskyClient['uploadBlob']>(async ({ mimeType }) =>
    RA.ok({ $type: 'blob', ref: { $link: 'bafyblob' }, mimeType, size: 3 })
  );
  const query = vi.fn<BlueskyQueryClient['query']>(async (_nsid, params) => {
    const did = DIDS[params.handle ?? ''];
    return did === undefined
      ? RA.err({ type: 'BlueskyClientError', kind: 'http', message: 'resolveHandle failed', status: 400 })
      : RA.ok({ did });
  });
  const publish = (input: Parameters<typeof publishBlueskyPost>[1]) =>
    publishBlueskyPost({ client: { createRecord, uploadBlob }, query, now: () => NOW }, input);
  const record = (): BlueskyPostRecord => createRecord.mock.calls[0]![0];
  return { publish, createRecord, uploadBlob, query, record };
};

describe('publishBlueskyPost', () => {
  it('返信なしの投稿には reply を付けず、createdAt と TID の rkey で作り、uri・cid・rkey を返す', async () => {
    const t = setup();

    const result = await t.publish({ text: 'こんにちは' });

    expect(t.record()).toEqual({
      $type: 'app.bsky.feed.post',
      text: 'こんにちは',
      createdAt: '2026-11-12T03:00:00.000Z',
    });
    const rkey = t.createRecord.mock.calls[0]![1];
    expect(rkey).toMatch(/^[234567abcdefghij][2-7a-z]{12}$/);
    expect(result).toEqual({
      ok: true,
      val: { uri: `at://did:plc:me/app.bsky.feed.post/${rkey}`, cid: 'bafynew', rkey },
    });
  });

  it('返信には root と parent をそのまま付ける', async () => {
    const t = setup();

    await t.publish({ text: 'hi', reply: { root: ROOT, parent: PARENT } });

    expect(t.record().reply).toEqual({ root: ROOT, parent: PARENT });
  });

  it('langs が指定されて空でなければ record に付け、指定なしや空なら付けない', async () => {
    const withLangs = setup();
    const without = setup();
    const empty = setup();

    await withLangs.publish({ text: 'hi', langs: ['ja', 'en'] });
    await without.publish({ text: 'hi' });
    await empty.publish({ text: 'hi', langs: [] });

    expect(withLangs.record().langs).toEqual(['ja', 'en']);
    expect(without.record()).not.toHaveProperty('langs');
    expect(empty.record()).not.toHaveProperty('langs');
  });

  it('前後の空白を除いた本文を送る', async () => {
    const t = setup();

    await t.publish({ text: '  hi \n' });

    expect(t.record().text).toBe('hi');
  });

  it('http と https の URL を link facet にし、バイト位置は日本語を含む本文で UTF-8 の位置にする', async () => {
    const t = setup();
    const text = '日本語です https://example.com/a?b=1 と http://example.org/x です';

    await t.publish({ text });

    const first = 'https://example.com/a?b=1';
    const second = 'http://example.org/x';
    const encoder = new TextEncoder();
    const firstStart = encoder.encode('日本語です ').byteLength;
    const secondStart = encoder.encode(`日本語です ${first} と `).byteLength;
    expect(t.record().facets).toEqual([
      {
        index: { byteStart: firstStart, byteEnd: firstStart + first.length },
        features: [{ $type: 'app.bsky.richtext.facet#link', uri: first }],
      },
      {
        index: { byteStart: secondStart, byteEnd: secondStart + second.length },
        features: [{ $type: 'app.bsky.richtext.facet#link', uri: second }],
      },
    ]);
  });

  it('URL の末尾の句読点と、日本語の文字は URL に含めない', async () => {
    const t = setup();

    await t.publish({ text: '見て https://example.com/a. それと(https://example.com/b)です' });

    expect(t.record().facets?.map((facet) => facet.features[0])).toEqual([
      { $type: 'app.bsky.richtext.facet#link', uri: 'https://example.com/a' },
      { $type: 'app.bsky.richtext.facet#link', uri: 'https://example.com/b' },
    ]);
  });

  it('@handle を resolveHandle で引いた DID の mention facet にし、位置は @ を含むバイト範囲にする', async () => {
    const t = setup();
    const text = 'やあ @alice.bsky.social と @bob.example.com';

    await t.publish({ text });

    const encoder = new TextEncoder();
    const aliceStart = encoder.encode('やあ ').byteLength;
    const bobStart = encoder.encode('やあ @alice.bsky.social と ').byteLength;
    expect(t.record().facets).toEqual([
      {
        index: { byteStart: aliceStart, byteEnd: aliceStart + '@alice.bsky.social'.length },
        features: [{ $type: 'app.bsky.richtext.facet#mention', did: 'did:plc:alice' }],
      },
      {
        index: { byteStart: bobStart, byteEnd: bobStart + '@bob.example.com'.length },
        features: [{ $type: 'app.bsky.richtext.facet#mention', did: 'did:plc:bob' }],
      },
    ]);
    expect(t.query).toHaveBeenCalledWith('com.atproto.identity.resolveHandle', { handle: 'alice.bsky.social' });
    expect(t.query).toHaveBeenCalledWith('com.atproto.identity.resolveHandle', { handle: 'bob.example.com' });
  });

  it('同じ handle は 1 回だけ引き、すべての出現を facet にする', async () => {
    const t = setup();

    await t.publish({ text: '@alice.bsky.social @alice.bsky.social' });

    expect(t.query).toHaveBeenCalledOnce();
    expect(t.record().facets).toHaveLength(2);
  });

  it('解決できない handle は facet にせず本文に残し、投稿は成功させる', async () => {
    const t = setup();

    const result = await t.publish({ text: '@nobody.example.com と @alice.bsky.social' });

    expect(result.ok).toBe(true);
    expect(t.record().text).toBe('@nobody.example.com と @alice.bsky.social');
    expect(t.record().facets?.map((facet) => facet.features[0])).toEqual([
      { $type: 'app.bsky.richtext.facet#mention', did: 'did:plc:alice' },
    ]);
  });

  it('メールアドレスと URL の中の @ は mention にしない', async () => {
    const t = setup();

    await t.publish({ text: 'a@alice.bsky.social https://example.com/@alice.bsky.social' });

    expect(t.query).not.toHaveBeenCalled();
    expect(t.record().facets?.map((facet) => facet.features[0].$type)).toEqual(['app.bsky.richtext.facet#link']);
  });

  it('@ の直前が文字のときは mention にせず、空白か ( のときは mention にする', async () => {
    const t = setup();

    await t.publish({ text: 'こんにちは@alice.bsky.social' });

    expect(t.query).not.toHaveBeenCalled();
    expect(t.record()).not.toHaveProperty('facets');

    const spaced = setup();
    await spaced.publish({ text: 'こんにちは @alice.bsky.social' });
    const paren = setup();
    await paren.publish({ text: '(@alice.bsky.social)' });

    expect(spaced.record().facets?.map((facet) => facet.features[0])).toEqual([
      { $type: 'app.bsky.richtext.facet#mention', did: 'did:plc:alice' },
    ]);
    expect(paren.record().facets?.map((facet) => facet.features[0])).toEqual([
      { $type: 'app.bsky.richtext.facet#mention', did: 'did:plc:alice' },
    ]);
  });

  it('サロゲートペアや ZWJ の絵文字を前に含む本文でも、link と mention のバイト位置が UTF-8 で正しい', async () => {
    const t = setup();
    const prefix = '👍🏽 👨‍👩‍👧‍👦 ';
    const url = 'https://example.com/a';
    const mention = '@alice.bsky.social';
    const text = `${prefix}${url} ${mention}`;

    await t.publish({ text });

    const encoder = new TextEncoder();
    const urlStart = encoder.encode(prefix).byteLength;
    const mentionStart = encoder.encode(`${prefix}${url} `).byteLength;
    expect(t.record().facets).toEqual([
      {
        index: { byteStart: urlStart, byteEnd: urlStart + encoder.encode(url).byteLength },
        features: [{ $type: 'app.bsky.richtext.facet#link', uri: url }],
      },
      {
        index: { byteStart: mentionStart, byteEnd: mentionStart + encoder.encode(mention).byteLength },
        features: [{ $type: 'app.bsky.richtext.facet#mention', did: 'did:plc:alice' }],
      },
    ]);
  });

  it('URL と mention が混在しても byteStart の昇順に並べる', async () => {
    const t = setup();

    await t.publish({ text: '@alice.bsky.social https://example.com @bob.example.com' });

    const starts = t.record().facets?.map((facet) => facet.index.byteStart);
    expect(starts).toEqual([...(starts ?? [])].sort((a, b) => a - b));
    expect(starts).toHaveLength(3);
  });

  it('画像を uploadBlob で上げ、alt 付きの images embed にする', async () => {
    const t = setup();

    await t.publish({
      text: 'photo',
      images: [
        { bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/png', alt: '猫' },
        { bytes: new Uint8Array([4]), mimeType: 'image/jpeg', alt: '' },
      ],
    });

    expect(t.uploadBlob).toHaveBeenCalledTimes(2);
    expect(t.record().embed).toEqual({
      $type: 'app.bsky.embed.images',
      images: [
        { alt: '猫', image: { $type: 'blob', ref: { $link: 'bafyblob' }, mimeType: 'image/png', size: 3 } },
        { alt: '', image: { $type: 'blob', ref: { $link: 'bafyblob' }, mimeType: 'image/jpeg', size: 3 } },
      ],
    });
  });

  it('引用だけなら、uri と cid の app.bsky.embed.record にする', async () => {
    const t = setup();

    await t.publish({ text: 'quote', quote: ROOT });

    expect(t.record().embed).toEqual({ $type: 'app.bsky.embed.record', record: ROOT });
    expect(t.uploadBlob).not.toHaveBeenCalled();
  });

  it('引用と画像があれば、recordWithMedia に引用と images を入れる', async () => {
    const t = setup();

    await t.publish({
      text: 'quote',
      quote: ROOT,
      images: [{ bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/png', alt: '猫' }],
    });

    expect(t.record().embed).toEqual({
      $type: 'app.bsky.embed.recordWithMedia',
      record: { record: ROOT },
      media: {
        $type: 'app.bsky.embed.images',
        images: [{ alt: '猫', image: { $type: 'blob', ref: { $link: 'bafyblob' }, mimeType: 'image/png', size: 3 } }],
      },
    });
  });

  it('引用も画像も無ければ embed を付けない', async () => {
    const t = setup();

    await t.publish({ text: 'plain' });

    expect(t.record()).not.toHaveProperty('embed');
  });

  it('本文が空でも画像があれば投稿できる', async () => {
    const t = setup();

    const result = await t.publish({
      text: '',
      images: [{ bytes: new Uint8Array([1]), mimeType: 'image/png', alt: '' }],
    });

    expect(result.ok).toBe(true);
  });

  it('画像の upload が失敗したら、投稿せずエラーを返す', async () => {
    const t = setup();
    t.uploadBlob.mockReturnValueOnce(RA.err(failure));

    const result = await t.publish({
      text: 'photo',
      images: [{ bytes: new Uint8Array([1]), mimeType: 'image/png', alt: '' }],
    });

    expect(result).toEqual({ ok: false, err: failure });
    expect(t.createRecord).not.toHaveBeenCalled();
  });

  it('createRecord の失敗をそのまま返す', async () => {
    const t = setup();
    t.createRecord.mockReturnValueOnce(RA.err(failure));

    expect(await t.publish({ text: 'hi' })).toEqual({ ok: false, err: failure });
  });

  describe('入力の検証', () => {
    const invalid = (reason: string) => ({ ok: false, err: { type: 'BlueskyPostInvalid', reason } });
    const image = (size: number) => ({ bytes: new Uint8Array(size), mimeType: 'image/png', alt: '' });

    it('空文字と空白だけの本文を拒否する', async () => {
      const t = setup();

      expect(await t.publish({ text: '' })).toEqual(invalid('empty'));
      expect(await t.publish({ text: ' \n\t ' })).toEqual(invalid('empty'));
      expect(t.createRecord).not.toHaveBeenCalled();
    });

    it('300 grapheme は通し、301 grapheme は切り詰めず拒否する', async () => {
      const t = setup();

      expect((await t.publish({ text: 'あ'.repeat(300) })).ok).toBe(true);
      expect(await t.publish({ text: 'あ'.repeat(301) })).toEqual(invalid('too_many_graphemes'));
      expect(t.createRecord).toHaveBeenCalledOnce();
    });

    it('grapheme は結合文字を 1 つと数える', async () => {
      const t = setup();

      expect((await t.publish({ text: '👨‍👩‍👧‍👦'.repeat(300) })).ok).toBe(false);
      expect((await t.publish({ text: '👨‍👩‍👧‍👦'.repeat(100) })).ok).toBe(true);
    });

    it('3000 byte を超える本文を拒否する', async () => {
      const t = setup();

      expect(await t.publish({ text: '👨‍👩‍👧‍👦'.repeat(121) })).toEqual(invalid('too_many_bytes'));
      expect(t.createRecord).not.toHaveBeenCalled();
    });

    it('画像は 4 枚まで、1 枚 1,000,000 byte までにし、上げる前に拒否する', async () => {
      const t = setup();

      expect(await t.publish({ text: 'a', images: Array.from({ length: 5 }, () => image(1)) })).toEqual(
        invalid('too_many_images'),
      );
      expect(await t.publish({ text: 'a', images: [image(1_000_001)] })).toEqual(invalid('image_too_large'));
      expect(t.uploadBlob).not.toHaveBeenCalled();
      expect((await t.publish({ text: 'a', images: Array.from({ length: 4 }, () => image(1_000_000)) })).ok).toBe(
        true,
      );
    });
  });
});
