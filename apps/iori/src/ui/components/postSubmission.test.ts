import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Status } from '../../adaptor/mastodon/entities.ts';
import { DEFAULT_BLUESKY_INTERACTION_DRAFT } from './blueskyInteractionDraft.ts';
import {
  canSubmitPost,
  editParams,
  mediaOverflowNotice,
  mediaSlotsLeft,
  postedNotice,
  type PostFormValue,
  quoteParams,
  replyParams,
  saveMediaDescriptions,
  submitPost,
} from './postSubmission.ts';

const created = {
  id: 'status-1',
  media_attachments: [{ id: 'media-1', url: 'https://example.com/a.png' }],
} as unknown as Status;

const filled: PostFormValue = {
  content: 'hello',
  uploaded: [{ id: 'media-1', url: 'https://example.com/a.png', description: '', savedDescription: '' }],
  destination: 'both',
  visibility: 'public',
  cw: '',
  sensitive: false,
};

const updateMedia = vi.fn().mockResolvedValue({});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('canSubmitPost', () => {
  it('accepts non-blank content while idle', () => {
    expect(canSubmitPost('hello', false, false)).toBe(true);
  });

  it('rejects blank content', () => {
    expect(canSubmitPost('  \n', false, false)).toBe(false);
  });

  it('rejects while uploading or posting', () => {
    expect(canSubmitPost('hello', true, false)).toBe(false);
    expect(canSubmitPost('hello', false, true)).toBe(false);
  });
});

describe('mediaSlotsLeft', () => {
  it('returns the remaining slots and never goes negative', () => {
    expect(mediaSlotsLeft(1, 4)).toBe(3);
    expect(mediaSlotsLeft(4, 4)).toBe(0);
    expect(mediaSlotsLeft(5, 4)).toBe(0);
    expect(mediaSlotsLeft(10, Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('mediaOverflowNotice', () => {
  it('残りの枠を超えて選んだ枚数を知らせ、収まるときと上限なしのときは null にする', () => {
    expect(mediaOverflowNotice(6, 4, 4)).toBe('画像は4枚までです。2枚は追加しませんでした');
    expect(mediaOverflowNotice(3, 2, 4)).toBe('画像は4枚までです。1枚は追加しませんでした');
    expect(mediaOverflowNotice(4, 4, 4)).toBeNull();
    expect(mediaOverflowNotice(10, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('saveMediaDescriptions', () => {
  const media = (id: string, description: string, savedDescription: string) => ({
    id,
    url: `https://example.com/${id}.png`,
    description,
    savedDescription,
  });

  it('saves only the changed descriptions and normalizes blank ones', async () => {
    const update = vi.fn().mockResolvedValue({});
    const saved = vi.fn();

    await saveMediaDescriptions(
      [media('a', 'cat', ''), media('b', 'same', 'same'), media('c', '  ', 'old')],
      { updateMedia: update, onDescriptionSaved: saved },
    );

    expect(update.mock.calls).toEqual([['a', 'cat'], ['c', '']]);
    expect(saved.mock.calls).toEqual([['a', 'cat'], ['c', '']]);
  });

  it('stops at the first failure and keeps the earlier saves', async () => {
    const update = vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('boom'));
    const saved = vi.fn();

    await expect(
      saveMediaDescriptions(
        [media('a', 'x', ''), media('b', 'y', ''), media('c', 'z', '')],
        { updateMedia: update, onDescriptionSaved: saved },
      ),
    ).rejects.toThrow('boom');

    expect(saved.mock.calls).toEqual([['a', 'x']]);
    expect(update).toHaveBeenCalledTimes(2);
  });
});

describe('submitPost', () => {
  it('calls onPosted with the created status and does not call location.assign', async () => {
    const assign = vi.fn();
    vi.stubGlobal('window', { location: { assign } });
    const create = vi.fn().mockResolvedValue(created);
    const onPosted = vi.fn();

    const result = await submitPost(filled, {
      create,
      createBlueskyPost: vi.fn(),
      updateMedia,
      onDescriptionSaved: vi.fn(),
      onPosted,
    });

    expect(create).toHaveBeenCalledWith({
      status: 'hello',
      media_ids: ['media-1'],
      content_type: 'text/markdown',
      iori_destination: 'both',
      visibility: 'public',
    });
    expect(result).toEqual({ kind: 'posted', status: created });
    expect(onPosted).toHaveBeenCalledTimes(1);
    expect(onPosted).toHaveBeenCalledWith(created);
    expect(assign).not.toHaveBeenCalled();
  });

  it('passes the selected destination as iori_destination', async () => {
    const create = vi.fn().mockResolvedValue(created);

    await submitPost({ ...filled, destination: 'fediverse' }, {
      create,
      createBlueskyPost: vi.fn(),
      updateMedia,
      onDescriptionSaved: vi.fn(),
      onPosted: vi.fn(),
    });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ iori_destination: 'fediverse' }));
  });

  it.each(['public', 'unlisted', 'private'] as const)('passes the selected visibility %s', async (visibility) => {
    const create = vi.fn().mockResolvedValue(created);

    await submitPost({ ...filled, visibility }, {
      create,
      createBlueskyPost: vi.fn(),
      updateMedia,
      onDescriptionSaved: vi.fn(),
      onPosted: vi.fn(),
    });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ visibility }));
  });

  it('passes a trimmed spoiler_text and sensitive', async () => {
    const create = vi.fn().mockResolvedValue(created);

    await submitPost({ ...filled, cw: ' 注意 ', sensitive: true }, {
      create,
      createBlueskyPost: vi.fn(),
      updateMedia,
      onDescriptionSaved: vi.fn(),
      onPosted: vi.fn(),
    });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ spoiler_text: '注意', sensitive: true }));
  });

  it('omits spoiler_text and sensitive when the CW is blank and sensitive is off', async () => {
    const create = vi.fn().mockResolvedValue(created);

    await submitPost({ ...filled, cw: '  ' }, {
      create,
      createBlueskyPost: vi.fn(),
      updateMedia,
      onDescriptionSaved: vi.fn(),
      onPosted: vi.fn(),
    });

    const params = create.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(params).not.toHaveProperty('spoiler_text');
    expect(params).not.toHaveProperty('sensitive');
  });

  it('saves descriptions only for images that have one, before creating the status', async () => {
    const order: string[] = [];
    const update = vi.fn(async (id: string) => {
      order.push(`update:${id}`);
    });
    const create = vi.fn(async () => {
      order.push('create');
      return created;
    });
    const uploaded = [
      { id: 'media-1', url: 'https://example.com/a.png', description: '猫の写真', savedDescription: '' },
      { id: 'media-2', url: 'https://example.com/b.png', description: '  ', savedDescription: '' },
      { id: 'media-3', url: 'https://example.com/c.png', description: '犬の写真', savedDescription: '' },
    ];

    await submitPost({ ...filled, uploaded }, {
      create,
      createBlueskyPost: vi.fn(),
      updateMedia: update,
      onDescriptionSaved: vi.fn(),
      onPosted: vi.fn(),
    });

    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledWith('media-1', '猫の写真');
    expect(update).toHaveBeenCalledWith('media-3', '犬の写真');
    expect(order).toEqual(['update:media-1', 'update:media-3', 'create']);
  });

  it('does not save a description that matches the last saved one', async () => {
    const create = vi.fn().mockResolvedValue(created);
    const update = vi.fn().mockResolvedValue({});
    const uploaded = [
      { id: 'media-1', url: 'https://example.com/a.png', description: '猫の写真', savedDescription: '猫の写真' },
      { id: 'media-2', url: 'https://example.com/b.png', description: '犬の写真', savedDescription: '猫の写真' },
    ];

    await submitPost(
      { ...filled, uploaded },
      { create, createBlueskyPost: vi.fn(), updateMedia: update, onDescriptionSaved: vi.fn(), onPosted: vi.fn() },
    );

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith('media-2', '犬の写真');
  });

  it('saves an empty description when it was cleared after being saved', async () => {
    const create = vi.fn().mockResolvedValue(created);
    const update = vi.fn().mockResolvedValue({});
    const onDescriptionSaved = vi.fn();
    const uploaded = [
      { id: 'media-1', url: 'https://example.com/a.png', description: '', savedDescription: '猫の写真' },
    ];

    await submitPost({ ...filled, uploaded }, {
      create,
      createBlueskyPost: vi.fn(),
      updateMedia: update,
      onDescriptionSaved,
      onPosted: vi.fn(),
    });

    expect(update).toHaveBeenCalledWith('media-1', '');
    expect(onDescriptionSaved).toHaveBeenCalledWith('media-1', '');
  });

  it('reports saved descriptions even when creating the status fails', async () => {
    const create = vi.fn().mockRejectedValue(new Error('network'));
    const update = vi.fn().mockResolvedValue({});
    const onDescriptionSaved = vi.fn();
    const uploaded = [
      { id: 'media-1', url: 'https://example.com/a.png', description: '猫の写真', savedDescription: '' },
    ];

    const result = await submitPost(
      { ...filled, uploaded },
      { create, createBlueskyPost: vi.fn(), updateMedia: update, onDescriptionSaved, onPosted: vi.fn() },
    );

    expect(result.kind).toBe('failed');
    expect(onDescriptionSaved).toHaveBeenCalledWith('media-1', '猫の写真');
  });

  it('reports the descriptions saved before a later save fails', async () => {
    const create = vi.fn().mockResolvedValue(created);
    const update = vi.fn(async (id: string) => {
      if (id === 'media-2') throw new Error('network');
    });
    const onDescriptionSaved = vi.fn();
    const uploaded = [
      { id: 'media-1', url: 'https://example.com/a.png', description: '猫の写真', savedDescription: '' },
      { id: 'media-2', url: 'https://example.com/b.png', description: '犬の写真', savedDescription: '' },
    ];

    const result = await submitPost(
      { ...filled, uploaded },
      { create, createBlueskyPost: vi.fn(), updateMedia: update, onDescriptionSaved, onPosted: vi.fn() },
    );

    expect(result.kind).toBe('failed');
    expect(onDescriptionSaved).toHaveBeenCalledTimes(1);
    expect(onDescriptionSaved).toHaveBeenCalledWith('media-1', '猫の写真');
  });

  it('does not create the status and reports failure when saving a description fails', async () => {
    const create = vi.fn().mockResolvedValue(created);
    const update = vi.fn().mockRejectedValue(new Error('network'));
    const onPosted = vi.fn();
    const uploaded = [{
      id: 'media-1',
      url: 'https://example.com/a.png',
      description: '猫の写真',
      savedDescription: '',
    }];

    const result = await submitPost({ ...filled, uploaded }, {
      create,
      createBlueskyPost: vi.fn(),
      updateMedia: update,
      onDescriptionSaved: vi.fn(),
      onPosted,
    });

    expect(result).toEqual({
      kind: 'failed',
      message: 'Failed to save the image description. Please try again.',
    });
    expect(create).not.toHaveBeenCalled();
    expect(onPosted).not.toHaveBeenCalled();
  });

  it('does not call onPosted and reports the failure message when creating fails', async () => {
    const create = vi.fn().mockRejectedValue(new Error('network'));
    const onPosted = vi.fn();

    const result = await submitPost(filled, {
      create,
      createBlueskyPost: vi.fn(),
      updateMedia,
      onDescriptionSaved: vi.fn(),
      onPosted,
    });

    expect(result).toEqual({ kind: 'failed', message: 'Failed to post. Please try again.' });
    expect(onPosted).not.toHaveBeenCalled();
  });

  it('includes the API message when the server rejects the post', async () => {
    const create = vi.fn().mockRejectedValue(Object.assign(new Error('Validation failed'), { status: 422 }));
    const onPosted = vi.fn();

    const result = await submitPost(filled, {
      create,
      createBlueskyPost: vi.fn(),
      updateMedia,
      onDescriptionSaved: vi.fn(),
      onPosted,
    });

    expect(result).toEqual({ kind: 'failed', message: 'Failed to post: Validation failed' });
    expect(onPosted).not.toHaveBeenCalled();
  });

  it('does not report a post failure when onPosted throws', async () => {
    const create = vi.fn().mockResolvedValue(created);
    const onPosted = vi.fn(() => {
      throw new Error('render');
    });

    await expect(
      submitPost(filled, { create, createBlueskyPost: vi.fn(), updateMedia, onDescriptionSaved: vi.fn(), onPosted }),
    ).rejects.toThrow(
      'render',
    );
  });
});

describe('submitPost to Bluesky only', () => {
  const blueskyOnly: PostFormValue = { ...filled, destination: 'bluesky' };

  it.each(['unlisted', 'private'] as const)(
    'fails without calling createBlueskyPost or create when the visibility is %s',
    async (visibility) => {
      const create = vi.fn();
      const createBlueskyPost = vi.fn();

      const result = await submitPost({ ...blueskyOnly, visibility }, {
        create,
        createBlueskyPost,
        updateMedia,
        onDescriptionSaved: vi.fn(),
        onPosted: vi.fn(),
      });

      expect(result).toEqual({ kind: 'failed', message: 'Bluesky だけの投稿は公開でしか送れません' });
      expect(createBlueskyPost).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    },
  );

  it('calls createBlueskyPost with the content and media, and does not call create or onPosted', async () => {
    const create = vi.fn();
    const createBlueskyPost = vi.fn().mockResolvedValue({
      uri: 'at://did:plc:me/app.bsky.feed.post/3k',
      url: 'https://bsky.app/x',
    });
    const onPosted = vi.fn();

    const result = await submitPost(blueskyOnly, {
      create,
      createBlueskyPost,
      updateMedia,
      onDescriptionSaved: vi.fn(),
      onPosted,
    });

    expect(createBlueskyPost).toHaveBeenCalledExactlyOnceWith({
      status: 'hello',
      media_ids: ['media-1'],
      content_type: 'text/markdown',
    });
    expect(result).toEqual({ kind: 'postedToBluesky', url: 'https://bsky.app/x' });
    expect(create).not.toHaveBeenCalled();
    expect(onPosted).not.toHaveBeenCalled();
  });

  describe('Bluesky だけの投稿の返信の制限と引用の禁止', () => {
    const submit = async (value: PostFormValue) => {
      const createBlueskyPost = vi.fn().mockResolvedValue({ uri: 'at://x', url: null });
      await submitPost(value, {
        create: vi.fn(),
        createBlueskyPost,
        updateMedia,
        onDescriptionSaved: vi.fn(),
        onPosted: vi.fn(),
      });
      return createBlueskyPost.mock.calls[0]?.[0] as Record<string, unknown>;
    };

    it('設定が既定のときは reply_allow も quote_disabled も送らない', async () => {
      const params = await submit({ ...blueskyOnly, blueskyInteraction: DEFAULT_BLUESKY_INTERACTION_DRAFT });

      expect(params).toEqual({ status: 'hello', media_ids: ['media-1'], content_type: 'text/markdown' });
      expect(params).not.toHaveProperty('reply_allow');
      expect(params).not.toHaveProperty('quote_disabled');
    });

    it('設定が無いときも reply_allow も quote_disabled も送らない', async () => {
      const params = await submit(blueskyOnly);

      expect(params).not.toHaveProperty('reply_allow');
      expect(params).not.toHaveProperty('quote_disabled');
    });

    it('指定した人だけと引用の禁止を reply_allow と quote_disabled で送る', async () => {
      const params = await submit({
        ...blueskyOnly,
        blueskyInteraction: { replyMode: 'selected', audiences: ['followers', 'mention'], quoteDisabled: true },
      });

      expect(params).toMatchObject({ reply_allow: ['mention', 'followers'], quote_disabled: true });
    });

    it('返信を受け付けない設定は reply_allow を空配列で送る', async () => {
      const params = await submit({
        ...blueskyOnly,
        blueskyInteraction: { replyMode: 'nobody', audiences: [], quoteDisabled: false },
      });

      expect(params['reply_allow']).toEqual([]);
      expect(params).not.toHaveProperty('quote_disabled');
    });

    it('送り先が両方か Fediverse のときは、設定があっても送らない', async () => {
      for (const destination of ['both', 'fediverse'] as const) {
        const create = vi.fn().mockResolvedValue(created);
        const createBlueskyPost = vi.fn();

        await submitPost({
          ...filled,
          destination,
          blueskyInteraction: { replyMode: 'nobody', audiences: [], quoteDisabled: true },
        }, { create, createBlueskyPost, updateMedia, onDescriptionSaved: vi.fn(), onPosted: vi.fn() });

        expect(createBlueskyPost).not.toHaveBeenCalled();
        expect(create.mock.calls[0]?.[0]).not.toHaveProperty('reply_allow');
        expect(create.mock.calls[0]?.[0]).not.toHaveProperty('quote_disabled');
      }
    });
  });

  it('reports the server message when Bluesky refuses the post', async () => {
    const create = vi.fn();
    const createBlueskyPost = vi.fn().mockRejectedValue(
      Object.assign(new Error('Bluesky に送れる本文は 300 文字までです'), { status: 422 }),
    );
    const onPosted = vi.fn();

    const result = await submitPost(blueskyOnly, {
      create,
      createBlueskyPost,
      updateMedia,
      onDescriptionSaved: vi.fn(),
      onPosted,
    });

    expect(result).toEqual({ kind: 'failed', message: 'Failed to post: Bluesky に送れる本文は 300 文字までです' });
    expect(create).not.toHaveBeenCalled();
    expect(onPosted).not.toHaveBeenCalled();
  });

  it('reports the login message when Bluesky login fails', async () => {
    const createBlueskyPost = vi.fn().mockRejectedValue(
      Object.assign(new Error('Bluesky login failed'), { status: 502 }),
    );

    const result = await submitPost(blueskyOnly, {
      create: vi.fn(),
      createBlueskyPost,
      updateMedia,
      onDescriptionSaved: vi.fn(),
      onPosted: vi.fn(),
    });

    expect(result).toEqual({ kind: 'failed', message: 'Bluesky にログインできないため、操作できませんでした。' });
  });

  it('saves descriptions before calling createBlueskyPost', async () => {
    const order: string[] = [];
    const update = vi.fn(async (id: string) => {
      order.push(`update:${id}`);
    });
    const createBlueskyPost = vi.fn(async () => {
      order.push('createBlueskyPost');
      return { uri: 'at://did:plc:me/app.bsky.feed.post/3k', url: 'https://bsky.app/x' };
    });
    const uploaded = [
      { id: 'media-1', url: 'https://example.com/a.png', description: '猫の写真', savedDescription: '' },
      { id: 'media-2', url: 'https://example.com/b.png', description: '', savedDescription: '' },
    ];

    await submitPost({ ...blueskyOnly, uploaded }, {
      create: vi.fn(),
      createBlueskyPost,
      updateMedia: update,
      onDescriptionSaved: vi.fn(),
      onPosted: vi.fn(),
    });

    expect(update).toHaveBeenCalledExactlyOnceWith('media-1', '猫の写真');
    expect(order).toEqual(['update:media-1', 'createBlueskyPost']);
  });

  it('does not call createBlueskyPost and reports failure when saving a description fails', async () => {
    const createBlueskyPost = vi.fn();
    const update = vi.fn().mockRejectedValue(new Error('network'));
    const uploaded = [{
      id: 'media-1',
      url: 'https://example.com/a.png',
      description: '猫の写真',
      savedDescription: '',
    }];

    const result = await submitPost({ ...blueskyOnly, uploaded }, {
      create: vi.fn(),
      createBlueskyPost,
      updateMedia: update,
      onDescriptionSaved: vi.fn(),
      onPosted: vi.fn(),
    });

    expect(result).toEqual({
      kind: 'failed',
      message: 'Failed to save the image description. Please try again.',
    });
    expect(createBlueskyPost).not.toHaveBeenCalled();
  });

  it('does not pass cw or sensitive to createBlueskyPost', async () => {
    const createBlueskyPost = vi.fn().mockResolvedValue({ uri: 'at://x', url: null });

    await submitPost({ ...blueskyOnly, cw: '注意', sensitive: true }, {
      create: vi.fn(),
      createBlueskyPost,
      updateMedia,
      onDescriptionSaved: vi.fn(),
      onPosted: vi.fn(),
    });

    const params = createBlueskyPost.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(params).not.toHaveProperty('spoiler_text');
    expect(params).not.toHaveProperty('sensitive');
  });

  it('does not call createBlueskyPost for the other destinations', async () => {
    const createBlueskyPost = vi.fn();

    await submitPost(filled, {
      create: vi.fn().mockResolvedValue(created),
      createBlueskyPost,
      updateMedia,
      onDescriptionSaved: vi.fn(),
      onPosted: vi.fn(),
    });

    expect(createBlueskyPost).not.toHaveBeenCalled();
  });
});

describe('postedNotice', () => {
  it('says the post went to Bluesky and carries the URL', () => {
    expect(postedNotice('bluesky', { kind: 'postedToBluesky', url: 'https://bsky.app/x' })).toEqual({
      message: 'Bluesky に投稿しました',
      href: 'https://bsky.app/x',
    });
  });

  it('has no link when the URL is unknown', () => {
    expect(postedNotice('bluesky', { kind: 'postedToBluesky', url: null })).toEqual({
      message: 'Bluesky に投稿しました',
      href: null,
    });
  });

  it('keeps the existing message for a Fediverse post', () => {
    expect(postedNotice('fediverse', { kind: 'posted', status: created })).toEqual({
      message: 'Fediverse に投稿しました',
      href: null,
    });
  });

  it('passes the visibility of the created status, so a DM skip does not show the visibility reason', () => {
    const direct = {
      ...created,
      visibility: 'direct',
      iori: { bluesky_crosspost: { status: 'skipped', skip_reason: 'visibility' } },
    } as unknown as Status;

    expect(postedNotice('both', { kind: 'posted', status: direct })).toEqual({
      message: 'Fediverse に投稿しました。Bluesky には送っていません',
      href: null,
    });
  });
});

describe('replyParams', () => {
  it('passes the selected destination as iori_destination', () => {
    expect(replyParams('post-1', 'hello', 'fediverse')).toEqual({
      status: 'hello',
      in_reply_to_id: 'post-1',
      content_type: 'text/markdown',
      iori_destination: 'fediverse',
    });
  });

  it('passes the selected visibility as visibility', () => {
    expect(replyParams('post-1', 'hello', 'both', 'unlisted')).toEqual({
      status: 'hello',
      in_reply_to_id: 'post-1',
      content_type: 'text/markdown',
      iori_destination: 'both',
      visibility: 'unlisted',
    });
  });

  it('omits visibility when none is given, as for a reply to a direct post', () => {
    expect(replyParams('post-1', 'hello', 'fediverse', undefined)).not.toHaveProperty('visibility');
  });
});

describe('quoteParams', () => {
  it('passes the quoted post id as quoted_status_id and the selected destination as iori_destination', () => {
    expect(quoteParams('post-1', 'hello', 'fediverse')).toEqual({
      status: 'hello',
      quoted_status_id: 'post-1',
      content_type: 'text/markdown',
      iori_destination: 'fediverse',
    });
  });

  it('does not send in_reply_to_id', () => {
    expect(quoteParams('post-1', 'hello', 'fediverse')).not.toHaveProperty('in_reply_to_id');
  });
});

describe('editParams', () => {
  it('本文、CW、センシティブ、Markdown の指定を PUT に送る形にする', () => {
    expect(editParams({ content: '直した本文', cw: '注意', sensitive: true }, true)).toEqual({
      status: '直した本文',
      spoiler_text: '注意',
      sensitive: true,
      content_type: 'text/markdown',
    });
  });

  it('CW の前後の空白を取り、空白だけなら空文字にして CW を外す', () => {
    expect(editParams({ content: 'a', cw: ' 注意 ', sensitive: false }, true).spoiler_text).toBe('注意');
    expect(editParams({ content: 'a', cw: '  ', sensitive: false }, true).spoiler_text).toBe('');
  });

  it('画像が無い投稿では、センシティブを送らない', () => {
    expect(editParams({ content: 'a', cw: '', sensitive: true }, false).sensitive).toBe(false);
  });

  it('画像があり、センシティブを外したら false を送る', () => {
    expect(editParams({ content: 'a', cw: '', sensitive: false }, true).sensitive).toBe(false);
  });
});
