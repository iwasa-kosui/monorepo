import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { Instant } from '../../domain/instant/instant.ts';
import type { BlueskyClient, BlueskyClientError, BlueskyQueryClient } from '../../ports/blueskyClient.ts';
import { PostToBlueskyUseCase } from '../postToBluesky.ts';

const NOW = Instant.orThrow(Date.UTC(2026, 10, 12, 3));
const BLOB = { $type: 'blob', ref: { $link: 'bafyblob' }, mimeType: 'image/png', size: 3 } as const;
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
  const createPostWithGates = vi.fn<BlueskyClient['createPostWithGates']>(async ({ rkey }) =>
    RA.ok({ uri: `at://did:plc:me/app.bsky.feed.post/${rkey}`, cid: 'bafygated', rkey })
  );
  const uploadBlob = vi.fn<BlueskyClient['uploadBlob']>(async () => RA.ok(BLOB));
  const query = vi.fn<BlueskyQueryClient['query']>(async () => RA.ok({}));
  const postToBluesky = PostToBlueskyUseCase.create({
    client: { createRecord, createPostWithGates, uploadBlob },
    query,
    now: () => NOW,
  });
  return { postToBluesky, createRecord, createPostWithGates, uploadBlob, query };
};

describe('PostToBlueskyUseCase', () => {
  it('本文を Bluesky に投稿し、uri と cid と bsky.app の URL を返す', async () => {
    const t = setup();

    const result = await t.postToBluesky.run({ text: 'こんにちは', images: [] });

    const rkey = t.createRecord.mock.calls[0]![1];
    expect(result).toEqual({
      ok: true,
      val: {
        uri: `at://did:plc:me/app.bsky.feed.post/${rkey}`,
        cid: 'bafynew',
        url: `https://bsky.app/profile/did:plc:me/post/${rkey}`,
      },
    });
    expect(t.createRecord.mock.calls[0]![0]).toMatchObject({ $type: 'app.bsky.feed.post', text: 'こんにちは' });
    expect(t.createRecord.mock.calls[0]![0]).not.toHaveProperty('reply');
    expect(t.uploadBlob).not.toHaveBeenCalled();
  });

  it('画像の bytes と mimeType をアップロードし、alt を付けて投稿に埋め込む', async () => {
    const t = setup();
    const bytes = new Uint8Array([1, 2, 3]);

    const result = await t.postToBluesky.run({ text: '', images: [{ bytes, mimeType: 'image/png', alt: '猫の写真' }] });

    expect(result.ok).toBe(true);
    expect(t.uploadBlob).toHaveBeenCalledExactlyOnceWith({ bytes, mimeType: 'image/png' });
    expect(t.createRecord.mock.calls[0]![0]).toMatchObject({
      embed: { $type: 'app.bsky.embed.images', images: [{ alt: '猫の写真', image: BLOB }] },
    });
  });

  it('入力が不正なら、Bluesky を呼ばずに BlueskyPostInvalid を返す', async () => {
    const t = setup();

    const result = await t.postToBluesky.run({ text: 'あ'.repeat(301), images: [] });

    expect(result).toEqual({ ok: false, err: { type: 'BlueskyPostInvalid', reason: 'too_many_graphemes' } });
    expect(t.uploadBlob).not.toHaveBeenCalled();
    expect(t.createRecord).not.toHaveBeenCalled();
  });

  it('uploadBlob の失敗をそのまま返し、投稿しない', async () => {
    const t = setup();
    t.uploadBlob.mockReturnValueOnce(RA.err(failure));

    const result = await t.postToBluesky.run({
      text: 'hi',
      images: [{ bytes: new Uint8Array([1]), mimeType: 'image/png', alt: '' }],
    });

    expect(result).toEqual({ ok: false, err: failure });
    expect(t.createRecord).not.toHaveBeenCalled();
  });

  describe('返信の制限と引用の禁止', () => {
    it('既定の interaction なら createRecord だけを呼び、gate を作らない', async () => {
      const t = setup();

      const result = await t.postToBluesky.run({
        text: 'hi',
        images: [],
        interaction: { replyRestriction: 'everyone', quoteDisabled: false },
      });

      expect(result.ok).toBe(true);
      expect(t.createRecord).toHaveBeenCalledTimes(1);
      expect(t.createPostWithGates).not.toHaveBeenCalled();
    });

    it.each(
      [
        ['空集合 (誰も返信できない)', { replyRestriction: [], quoteDisabled: false }],
        ['引用の禁止だけ', { replyRestriction: 'everyone', quoteDisabled: true }],
        ['返信の制限と引用の禁止', { replyRestriction: ['following'], quoteDisabled: true }],
      ] as const,
    )(
      '%s なら createPostWithGates に同じ interaction と投稿と rkey を渡し、createRecord を呼ばない',
      async (_name, interaction) => {
        const t = setup();

        const result = await t.postToBluesky.run({ text: 'こんにちは', images: [], interaction });

        expect(t.createRecord).not.toHaveBeenCalled();
        expect(t.createPostWithGates).toHaveBeenCalledTimes(1);
        const input = t.createPostWithGates.mock.calls[0]![0];
        expect(input.interaction).toEqual(interaction);
        expect(input.record).toMatchObject({ $type: 'app.bsky.feed.post', text: 'こんにちは' });
        expect(result).toEqual({
          ok: true,
          val: {
            uri: `at://did:plc:me/app.bsky.feed.post/${input.rkey}`,
            cid: 'bafygated',
            url: `https://bsky.app/profile/did:plc:me/post/${input.rkey}`,
          },
        });
      },
    );
  });
});
