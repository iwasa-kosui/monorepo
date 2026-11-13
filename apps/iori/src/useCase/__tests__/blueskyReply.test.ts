import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { createSqliteD1Fixture } from '../../adaptor/d1/__tests__/sqliteFixture.ts';
import { createD1BlueskyLikeTargetResolver } from '../../adaptor/d1/blueskyTimeline/blueskyLikeTargetResolver.ts';
import { Instant } from '../../domain/instant/instant.ts';
import type { BlueskyClient, BlueskyClientError, BlueskyQueryClient } from '../../ports/blueskyClient.ts';
import { ReplyToBlueskyPostUseCase } from '../replyToBlueskyPost.ts';

const NOW = Instant.orThrow(Date.UTC(2026, 10, 12, 3));
const TOP = 'at://did:plc:a/app.bsky.feed.post/top';
const NESTED = 'at://did:plc:a/app.bsky.feed.post/nested';
const REPOST = `${TOP}#repost:did:plc:b`;
const ROOT = { uri: 'at://did:plc:c/app.bsky.feed.post/root', cid: 'bafyroot' };
const failure: BlueskyClientError = {
  type: 'BlueskyClientError',
  kind: 'http',
  message: 'getPosts failed: status 500',
  status: 500,
};

const setup = (posts: Record<string, unknown> = {
  [TOP]: { uri: TOP, cid: 'bafytop-fresh', record: { text: 'top' } },
  [NESTED]: { uri: NESTED, cid: 'bafynested-fresh', record: { reply: { root: ROOT, parent: ROOT } } },
}) => {
  const { db, sqlite } = createSqliteD1Fixture();
  const insertItem = sqlite.prepare(
    'INSERT INTO bluesky_timeline_items(feedItemId,uri,cid,authorDid,authorHandle,text,facets,repostedByDid,postedAt,indexedAt,fetchedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
  );
  insertItem.run(TOP, TOP, 'bafytop-stale', 'did:plc:a', 'alice.bsky.social', 't', '[]', null, 1, 1, 1);
  insertItem.run(REPOST, TOP, 'bafytop-stale', 'did:plc:a', 'alice.bsky.social', 't', '[]', 'did:plc:b', 1, 1, 1);
  insertItem.run(NESTED, NESTED, 'bafynested-stale', 'did:plc:a', 'alice.bsky.social', 't', '[]', null, 1, 1, 1);
  const createRecord = vi.fn<BlueskyClient['createRecord']>(async (_record, rkey) =>
    RA.ok({ uri: `at://did:plc:me/app.bsky.feed.post/${rkey}`, cid: 'bafynew', rkey })
  );
  const uploadBlob = vi.fn<BlueskyClient['uploadBlob']>();
  const query = vi.fn<BlueskyQueryClient['query']>(async (_nsid, params) => {
    const post = posts[String(params.uris ?? '')];
    return RA.ok({ posts: post === undefined ? [] : [post] });
  });
  const reply = ReplyToBlueskyPostUseCase.create({
    client: { createRecord, uploadBlob },
    query,
    targetResolver: createD1BlueskyLikeTargetResolver(db),
    now: () => NOW,
  });
  const record = () => createRecord.mock.calls[0]![0];
  return { reply, createRecord, uploadBlob, query, record, sqlite };
};

describe('ReplyToBlueskyPostUseCase', () => {
  it('トップレベル投稿への返信は、取り直した uri と cid を root と parent の両方にする', async () => {
    const t = setup();

    const result = await t.reply.run({ feedItemId: TOP, text: '返信です' });

    const rkey = t.createRecord.mock.calls[0]![1];
    expect(result).toEqual({ ok: true, val: { uri: `at://did:plc:me/app.bsky.feed.post/${rkey}`, cid: 'bafynew' } });
    expect(t.query).toHaveBeenCalledExactlyOnceWith('app.bsky.feed.getPosts', { uris: TOP });
    expect(t.record()).toEqual({
      $type: 'app.bsky.feed.post',
      text: '返信です',
      createdAt: '2026-11-12T03:00:00.000Z',
      reply: {
        root: { uri: TOP, cid: 'bafytop-fresh' },
        parent: { uri: TOP, cid: 'bafytop-fresh' },
      },
    });
  });

  it('画像を上げ、alt 付きの images embed を付けて、空本文でも返信する', async () => {
    const t = setup();
    const uploaded = { $type: 'blob', ref: { $link: 'bafyblob' }, mimeType: 'image/png', size: 3 } as const;
    t.uploadBlob.mockImplementationOnce(async () => RA.ok(uploaded));

    const result = await t.reply.run({
      uri: TOP,
      text: '',
      images: [{ bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/png', alt: '猫' }],
    });

    expect(result.ok).toBe(true);
    expect(t.record().embed).toEqual({ $type: 'app.bsky.embed.images', images: [{ alt: '猫', image: uploaded }] });
  });

  it('5 枚の画像は入力不正にし、返信先の取得も投稿もしない', async () => {
    const t = setup();

    const result = await t.reply.run({
      uri: TOP,
      text: 'hi',
      images: Array.from({ length: 5 }, () => ({ bytes: new Uint8Array([1]), mimeType: 'image/png', alt: '' })),
    });

    expect(result).toEqual({ ok: false, err: { type: 'BlueskyPostInvalid', reason: 'too_many_images' } });
    expect(t.query).not.toHaveBeenCalled();
  });

  it('返信への返信は、親の record.reply.root を root にし、親を parent にする', async () => {
    const t = setup();

    await t.reply.run({ feedItemId: NESTED, text: 'さらに返信' });

    expect(t.record().reply).toEqual({
      root: ROOT,
      parent: { uri: NESTED, cid: 'bafynested-fresh' },
    });
  });

  it('リポストの行からの返信は、元の投稿を返信先にする', async () => {
    const t = setup();

    await t.reply.run({ feedItemId: REPOST, text: 'hi' });

    expect(t.query).toHaveBeenCalledExactlyOnceWith('app.bsky.feed.getPosts', { uris: TOP });
    expect(t.record().reply?.parent).toEqual({ uri: TOP, cid: 'bafytop-fresh' });
  });

  it('本文の URL を、日本語を含む本文でも UTF-8 のバイト位置で link facet にする', async () => {
    const t = setup();
    const text = 'これは https://example.com/日本 ではなく https://example.com/x です';

    await t.reply.run({ feedItemId: TOP, text });

    const url = 'https://example.com/';
    const start = new TextEncoder().encode('これは ').byteLength;
    expect(t.record().facets).toEqual([
      {
        index: { byteStart: start, byteEnd: start + url.length },
        features: [{ $type: 'app.bsky.richtext.facet#link', uri: url }],
      },
      {
        index: {
          byteStart: new TextEncoder().encode('これは https://example.com/日本 ではなく ').byteLength,
          byteEnd:
            new TextEncoder().encode('これは https://example.com/日本 ではなく https://example.com/x').byteLength,
        },
        features: [{ $type: 'app.bsky.richtext.facet#link', uri: 'https://example.com/x' }],
      },
    ]);
  });

  it('uri で指定したら、D1 の行を引かず、その uri を getPosts で取り直して返信先にする', async () => {
    const t = setup();
    t.sqlite.exec('DELETE FROM bluesky_timeline_items');

    const result = await t.reply.run({ uri: TOP, text: 'uri からの返信' });

    expect(result.ok).toBe(true);
    expect(t.query).toHaveBeenCalledExactlyOnceWith('app.bsky.feed.getPosts', { uris: TOP });
    expect(t.record().reply).toEqual({
      root: { uri: TOP, cid: 'bafytop-fresh' },
      parent: { uri: TOP, cid: 'bafytop-fresh' },
    });
  });

  it('uri の投稿が getPosts に無ければ NotFound にし、投稿しない', async () => {
    const t = setup({});

    const result = await t.reply.run({ uri: TOP, text: 'hi' });

    expect(result).toEqual({ ok: false, err: { type: 'BlueskyReplyTargetNotFound' } });
    expect(t.createRecord).not.toHaveBeenCalled();
  });

  it('uri でも、空文字は入力不正にし、getPosts を呼ばない', async () => {
    const t = setup();

    const result = await t.reply.run({ uri: TOP, text: ' ' });

    expect(result).toEqual({ ok: false, err: { type: 'BlueskyPostInvalid', reason: 'empty' } });
    expect(t.query).not.toHaveBeenCalled();
  });

  it('空文字と 301 grapheme を入力不正にし、返信先の取得も投稿もしない', async () => {
    const t = setup();

    const empty = await t.reply.run({ feedItemId: TOP, text: '  \n' });
    const long = await t.reply.run({ feedItemId: TOP, text: 'あ'.repeat(301) });

    expect(empty).toEqual({ ok: false, err: { type: 'BlueskyPostInvalid', reason: 'empty' } });
    expect(long).toEqual({ ok: false, err: { type: 'BlueskyPostInvalid', reason: 'too_many_graphemes' } });
    expect(t.query).not.toHaveBeenCalled();
    expect(t.createRecord).not.toHaveBeenCalled();
  });

  it('300 grapheme ちょうどは通す', async () => {
    const t = setup();

    expect((await t.reply.run({ feedItemId: TOP, text: 'あ'.repeat(300) })).ok).toBe(true);
  });

  it('未知の feedItemId は NotFound にし、Bluesky を呼ばない', async () => {
    const t = setup();

    const result = await t.reply.run({ feedItemId: 'unknown', text: 'hi' });

    expect(result).toEqual({ ok: false, err: { type: 'BlueskyReplyTargetNotFound' } });
    expect(t.query).not.toHaveBeenCalled();
    expect(t.createRecord).not.toHaveBeenCalled();
  });

  it('getPosts に投稿が無ければ（削除済み）NotFound にし、投稿しない', async () => {
    const t = setup({});

    const result = await t.reply.run({ feedItemId: TOP, text: 'hi' });

    expect(result).toEqual({ ok: false, err: { type: 'BlueskyReplyTargetNotFound' } });
    expect(t.createRecord).not.toHaveBeenCalled();
  });

  it('getPosts の失敗を Bluesky のエラーとして返し、投稿しない', async () => {
    const t = setup();
    t.query.mockReturnValueOnce(RA.err(failure));

    const result = await t.reply.run({ feedItemId: TOP, text: 'hi' });

    expect(result).toEqual({ ok: false, err: failure });
    expect(t.createRecord).not.toHaveBeenCalled();
  });

  it('getPosts の応答の形が違えば invalid_response にする', async () => {
    const t = setup();
    t.query.mockReturnValueOnce(RA.ok({ posts: [{ uri: TOP }] }));

    const result = await t.reply.run({ feedItemId: TOP, text: 'hi' });

    expect(result).toMatchObject({ ok: false, err: { type: 'BlueskyClientError', kind: 'invalid_response' } });
    expect(t.createRecord).not.toHaveBeenCalled();
  });

  describe('返信できない投稿', () => {
    const notAllowed = { ok: false, err: { type: 'BlueskyReplyNotAllowed' } };
    const target = (extra: Record<string, unknown>) => ({ [TOP]: { uri: TOP, cid: 'bafytop-fresh', ...extra } });

    it.each([
      ['返信が無効', { viewer: { replyDisabled: true } }],
      ['相手にブロックされている', { author: { viewer: { blockedBy: true } } }],
      ['相手をブロックしている', { author: { viewer: { blocking: 'at://did:plc:me/app.bsky.graph.block/1' } } }],
    ])('%s ときは NotAllowed にし、投稿しない', async (_label, extra) => {
      const t = setup(target(extra));

      const result = await t.reply.run({ feedItemId: TOP, text: 'hi' });

      expect(result).toEqual(notAllowed);
      expect(t.createRecord).not.toHaveBeenCalled();
    });

    it('viewer が付いていても、どれにも当たらなければ投稿する', async () => {
      const t = setup(target({
        viewer: { replyDisabled: false },
        author: { viewer: { blockedBy: false, muted: false } },
      }));

      expect((await t.reply.run({ feedItemId: TOP, text: 'hi' })).ok).toBe(true);
    });
  });

  it('createRecord の失敗を返す', async () => {
    const t = setup();
    t.createRecord.mockReturnValueOnce(RA.err(failure));

    expect(await t.reply.run({ feedItemId: TOP, text: 'hi' })).toEqual({ ok: false, err: failure });
  });
});
