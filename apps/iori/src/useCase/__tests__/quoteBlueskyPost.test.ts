import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { Instant } from '../../domain/instant/instant.ts';
import type { BlueskyClient, BlueskyClientError, BlueskyQueryClient } from '../../ports/blueskyClient.ts';
import { QuoteBlueskyPostUseCase } from '../quoteBlueskyPost.ts';

const NOW = Instant.orThrow(Date.UTC(2026, 10, 12, 3));
const TOP = 'at://did:plc:a/app.bsky.feed.post/top';
const failure: BlueskyClientError = {
  type: 'BlueskyClientError',
  kind: 'http',
  message: 'getPosts failed: status 500',
  status: 500,
};

const setup = (posts: Record<string, unknown> = { [TOP]: { uri: TOP, cid: 'bafytop', record: { text: 'top' } } }) => {
  const createRecord = vi.fn<BlueskyClient['createRecord']>(async (_record, rkey) =>
    RA.ok({ uri: `at://did:plc:me/app.bsky.feed.post/${rkey}`, cid: 'bafynew', rkey })
  );
  const uploadBlob = vi.fn<BlueskyClient['uploadBlob']>();
  const query = vi.fn<BlueskyQueryClient['query']>(async (_nsid, params) => {
    const post = posts[String(params.uris ?? '')];
    return RA.ok({ posts: post === undefined ? [] : [post] });
  });
  const quote = QuoteBlueskyPostUseCase.create({ client: { createRecord, uploadBlob }, query, now: () => NOW });
  const record = () => createRecord.mock.calls[0]![0];
  return { quote, createRecord, query, record };
};

describe('QuoteBlueskyPostUseCase', () => {
  it('getPosts から取った uri と cid の embed.record を付けて投稿し、uri と cid を返す', async () => {
    const t = setup();

    const result = await t.quote.run({ uri: TOP, text: '引用です' });

    const rkey = t.createRecord.mock.calls[0]![1];
    expect(result).toEqual({ ok: true, val: { uri: `at://did:plc:me/app.bsky.feed.post/${rkey}`, cid: 'bafynew' } });
    expect(t.query).toHaveBeenCalledExactlyOnceWith('app.bsky.feed.getPosts', { uris: TOP });
    expect(t.record()).toEqual({
      $type: 'app.bsky.feed.post',
      text: '引用です',
      createdAt: '2026-11-12T03:00:00.000Z',
      embed: { $type: 'app.bsky.embed.record', record: { uri: TOP, cid: 'bafytop' } },
    });
  });

  it('空文字と 301 grapheme を入力不正にし、対象の取得も投稿もしない', async () => {
    const t = setup();

    const empty = await t.quote.run({ uri: TOP, text: '  \n' });
    const long = await t.quote.run({ uri: TOP, text: 'あ'.repeat(301) });

    expect(empty).toEqual({ ok: false, err: { type: 'BlueskyPostInvalid', reason: 'empty' } });
    expect(long).toEqual({ ok: false, err: { type: 'BlueskyPostInvalid', reason: 'too_many_graphemes' } });
    expect(t.query).not.toHaveBeenCalled();
    expect(t.createRecord).not.toHaveBeenCalled();
  });

  it('300 grapheme ちょうどは通す', async () => {
    const t = setup();

    expect((await t.quote.run({ uri: TOP, text: 'あ'.repeat(300) })).ok).toBe(true);
  });

  it('getPosts に投稿が無ければ（削除済み）NotFound にし、投稿しない', async () => {
    const t = setup({});

    const result = await t.quote.run({ uri: TOP, text: 'hi' });

    expect(result).toEqual({ ok: false, err: { type: 'BlueskyQuoteTargetNotFound' } });
    expect(t.createRecord).not.toHaveBeenCalled();
  });

  it('getPosts の失敗を Bluesky のエラーとして返し、投稿しない', async () => {
    const t = setup();
    t.query.mockReturnValueOnce(RA.err(failure));

    const result = await t.quote.run({ uri: TOP, text: 'hi' });

    expect(result).toEqual({ ok: false, err: failure });
    expect(t.createRecord).not.toHaveBeenCalled();
  });

  it('getPosts の応答の形が違えば invalid_response にする', async () => {
    const t = setup();
    t.query.mockReturnValueOnce(RA.ok({ posts: [{ uri: TOP }] }));

    const result = await t.quote.run({ uri: TOP, text: 'hi' });

    expect(result).toMatchObject({ ok: false, err: { type: 'BlueskyClientError', kind: 'invalid_response' } });
    expect(t.createRecord).not.toHaveBeenCalled();
  });

  describe('引用できない投稿', () => {
    const notAllowed = { ok: false, err: { type: 'BlueskyQuoteNotAllowed' } };
    const target = (extra: Record<string, unknown>) => ({ [TOP]: { uri: TOP, cid: 'bafytop', ...extra } });

    it.each([
      ['引用が無効', { viewer: { embeddingDisabled: true } }],
      ['相手にブロックされている', { author: { viewer: { blockedBy: true } } }],
      ['相手をブロックしている', { author: { viewer: { blocking: 'at://did:plc:me/app.bsky.graph.block/1' } } }],
      [
        'リストでブロックしている',
        { author: { viewer: { blockingByList: { uri: 'at://did:plc:me/app.bsky.graph.list/1', name: 'mute' } } } },
      ],
    ])('%s ときは NotAllowed にし、投稿しない', async (_label, extra) => {
      const t = setup(target(extra));

      const result = await t.quote.run({ uri: TOP, text: 'hi' });

      expect(result).toEqual(notAllowed);
      expect(t.createRecord).not.toHaveBeenCalled();
    });

    it('返信だけが無効な投稿は引用できる', async () => {
      const t = setup(target({ viewer: { replyDisabled: true, embeddingDisabled: false } }));

      expect((await t.quote.run({ uri: TOP, text: 'hi' })).ok).toBe(true);
    });
  });

  it('createRecord の失敗を返す', async () => {
    const t = setup();
    t.createRecord.mockReturnValueOnce(RA.err(failure));

    expect(await t.quote.run({ uri: TOP, text: 'hi' })).toEqual({ ok: false, err: failure });
  });
});
