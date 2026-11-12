import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Status } from '../../adaptor/mastodon/entities.ts';
import { canSubmitPost, type PostFormValue, replyParams, submitPost } from './postSubmission.ts';

const created = {
  id: 'status-1',
  media_attachments: [{ id: 'media-1', url: 'https://example.com/a.png' }],
} as unknown as Status;

const filled: PostFormValue = {
  content: 'hello',
  uploaded: [{ id: 'media-1', url: 'https://example.com/a.png', description: '' }],
  destination: 'both',
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

describe('submitPost', () => {
  it('calls onPosted with the created status and does not call location.assign', async () => {
    const assign = vi.fn();
    vi.stubGlobal('window', { location: { assign } });
    const create = vi.fn().mockResolvedValue(created);
    const onPosted = vi.fn();

    const result = await submitPost(filled, { create, updateMedia, onPosted });

    expect(create).toHaveBeenCalledWith({
      status: 'hello',
      media_ids: ['media-1'],
      content_type: 'text/markdown',
      iori_destination: 'both',
    });
    expect(result).toEqual({ kind: 'posted', status: created });
    expect(onPosted).toHaveBeenCalledTimes(1);
    expect(onPosted).toHaveBeenCalledWith(created);
    expect(assign).not.toHaveBeenCalled();
  });

  it('passes the selected destination as iori_destination', async () => {
    const create = vi.fn().mockResolvedValue(created);

    await submitPost({ ...filled, destination: 'fediverse' }, { create, updateMedia, onPosted: vi.fn() });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ iori_destination: 'fediverse' }));
  });

  it('passes a trimmed spoiler_text and sensitive', async () => {
    const create = vi.fn().mockResolvedValue(created);

    await submitPost({ ...filled, cw: ' 注意 ', sensitive: true }, { create, updateMedia, onPosted: vi.fn() });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ spoiler_text: '注意', sensitive: true }));
  });

  it('omits spoiler_text and sensitive when the CW is blank and sensitive is off', async () => {
    const create = vi.fn().mockResolvedValue(created);

    await submitPost({ ...filled, cw: '  ' }, { create, updateMedia, onPosted: vi.fn() });

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
      { id: 'media-1', url: 'https://example.com/a.png', description: '猫の写真' },
      { id: 'media-2', url: 'https://example.com/b.png', description: '  ' },
      { id: 'media-3', url: 'https://example.com/c.png', description: '犬の写真' },
    ];

    await submitPost({ ...filled, uploaded }, { create, updateMedia: update, onPosted: vi.fn() });

    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledWith('media-1', '猫の写真');
    expect(update).toHaveBeenCalledWith('media-3', '犬の写真');
    expect(order).toEqual(['update:media-1', 'update:media-3', 'create']);
  });

  it('does not create the status and reports failure when saving a description fails', async () => {
    const create = vi.fn().mockResolvedValue(created);
    const update = vi.fn().mockRejectedValue(new Error('network'));
    const onPosted = vi.fn();
    const uploaded = [{ id: 'media-1', url: 'https://example.com/a.png', description: '猫の写真' }];

    const result = await submitPost({ ...filled, uploaded }, { create, updateMedia: update, onPosted });

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

    const result = await submitPost(filled, { create, updateMedia, onPosted });

    expect(result).toEqual({ kind: 'failed', message: 'Failed to post. Please try again.' });
    expect(onPosted).not.toHaveBeenCalled();
  });

  it('includes the API message when the server rejects the post', async () => {
    const create = vi.fn().mockRejectedValue(Object.assign(new Error('Validation failed'), { status: 422 }));
    const onPosted = vi.fn();

    const result = await submitPost(filled, { create, updateMedia, onPosted });

    expect(result).toEqual({ kind: 'failed', message: 'Failed to post: Validation failed' });
    expect(onPosted).not.toHaveBeenCalled();
  });

  it('does not report a post failure when onPosted throws', async () => {
    const create = vi.fn().mockResolvedValue(created);
    const onPosted = vi.fn(() => {
      throw new Error('render');
    });

    await expect(submitPost(filled, { create, updateMedia, onPosted })).rejects.toThrow('render');
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
});
