import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Status } from '../../adaptor/mastodon/entities.ts';
import { canSubmitPost, type PostFormValue, submitPost } from './postSubmission.ts';

const created = {
  id: 'status-1',
  media_attachments: [{ id: 'media-1', url: 'https://example.com/a.png' }],
} as unknown as Status;

const filled: PostFormValue = {
  content: 'hello',
  uploaded: [{ id: 'media-1', url: 'https://example.com/a.png' }],
};

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

    const result = await submitPost(filled, { create, onPosted });

    expect(create).toHaveBeenCalledWith({
      status: 'hello',
      media_ids: ['media-1'],
      content_type: 'text/markdown',
    });
    expect(result).toEqual({ kind: 'posted', status: created });
    expect(onPosted).toHaveBeenCalledTimes(1);
    expect(onPosted).toHaveBeenCalledWith(created);
    expect(assign).not.toHaveBeenCalled();
  });

  it('does not call onPosted and reports the failure message when creating fails', async () => {
    const create = vi.fn().mockRejectedValue(new Error('network'));
    const onPosted = vi.fn();

    const result = await submitPost(filled, { create, onPosted });

    expect(result).toEqual({ kind: 'failed', message: 'Failed to post. Please try again.' });
    expect(onPosted).not.toHaveBeenCalled();
  });

  it('includes the API message when the server rejects the post', async () => {
    const create = vi.fn().mockRejectedValue(Object.assign(new Error('Validation failed'), { status: 422 }));
    const onPosted = vi.fn();

    const result = await submitPost(filled, { create, onPosted });

    expect(result).toEqual({ kind: 'failed', message: 'Failed to post: Validation failed' });
    expect(onPosted).not.toHaveBeenCalled();
  });

  it('does not report a post failure when onPosted throws', async () => {
    const create = vi.fn().mockResolvedValue(created);
    const onPosted = vi.fn(() => {
      throw new Error('render');
    });

    await expect(submitPost(filled, { create, onPosted })).rejects.toThrow('render');
  });
});
