import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { Instant } from '../../domain/instant/instant.ts';
import type { BlueskyClient, BlueskyQueryClient } from '../../ports/blueskyClient.ts';
import { QuoteBlueskyPostUseCase } from '../quoteBlueskyPost.ts';

const NOW = Instant.orThrow(Date.UTC(2026, 10, 12, 3));
const TOP = 'at://did:plc:a/app.bsky.feed.post/top';

const setup = (posts: Record<string, unknown> = { [TOP]: { uri: TOP, cid: 'bafytop', record: { text: 'top' } } }) => {
  const createRecord = vi.fn<BlueskyClient['createRecord']>(async (_record, rkey) =>
    RA.ok({ uri: `at://did:plc:me/app.bsky.feed.post/${rkey}`, cid: 'bafynew', rkey })
  );
  const createPostWithGates = vi.fn<BlueskyClient['createPostWithGates']>(async ({ rkey }) =>
    RA.ok({ uri: `at://did:plc:me/app.bsky.feed.post/${rkey}`, cid: 'bafygated', rkey })
  );
  const uploadBlob = vi.fn<BlueskyClient['uploadBlob']>();
  const query = vi.fn<BlueskyQueryClient['query']>(async (_nsid, params) => {
    const post = posts[String(params.uris ?? '')];
    return RA.ok({ posts: post === undefined ? [] : [post] });
  });
  const quote = QuoteBlueskyPostUseCase.create({
    client: { createRecord, createPostWithGates, uploadBlob },
    query,
    now: () => NOW,
  });
  const record = () => createRecord.mock.calls[0]![0];
  return { quote, createRecord, createPostWithGates, uploadBlob, query, record };
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

  it('画像を上げ、引用と images を recordWithMedia にして、空本文でも投稿する', async () => {
    const t = setup();
    const uploaded = { $type: 'blob', ref: { $link: 'bafyblob' }, mimeType: 'image/png', size: 3 } as const;
    t.uploadBlob.mockImplementationOnce(async () => RA.ok(uploaded));

    const result = await t.quote.run({
      uri: TOP,
      text: '',
      images: [{ bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/png', alt: '猫' }],
    });

    expect(result.ok).toBe(true);
    expect(t.record().embed).toEqual({
      $type: 'app.bsky.embed.recordWithMedia',
      record: { record: { uri: TOP, cid: 'bafytop' } },
      media: { $type: 'app.bsky.embed.images', images: [{ alt: '猫', image: uploaded }] },
    });
  });

  it('getPosts に投稿が無ければ（削除済み）NotFound にし、投稿しない', async () => {
    const t = setup({});

    const result = await t.quote.run({ uri: TOP, text: 'hi' });

    expect(result).toEqual({ ok: false, err: { type: 'BlueskyQuoteTargetNotFound' } });
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

  describe('返信の制限と引用の禁止', () => {
    it.each(
      [
        ['引用の禁止だけ', { replyRestriction: 'everyone', quoteDisabled: true }],
        ['返信の制限と引用の禁止', { replyRestriction: ['mention', 'followers'], quoteDisabled: true }],
      ] as const,
    )(
      '%s なら引用の embed を付けた投稿と interaction を createPostWithGates に渡し、createRecord を呼ばない',
      async (_name, interaction) => {
        const t = setup();

        const result = await t.quote.run({ uri: TOP, text: '引用です', interaction });

        expect(t.createRecord).not.toHaveBeenCalled();
        expect(t.createPostWithGates).toHaveBeenCalledTimes(1);
        const input = t.createPostWithGates.mock.calls[0]![0];
        expect(input.interaction).toEqual(interaction);
        expect(input.record).toMatchObject({
          text: '引用です',
          embed: { $type: 'app.bsky.embed.record', record: { uri: TOP, cid: 'bafytop' } },
        });
        expect(result).toEqual({
          ok: true,
          val: { uri: `at://did:plc:me/app.bsky.feed.post/${input.rkey}`, cid: 'bafygated' },
        });
      },
    );
  });
});
