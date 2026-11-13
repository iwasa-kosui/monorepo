import { describe, expect, it } from 'vitest';

import { resolveReplySubmission } from './replySubmission.ts';

const shared = {
  replyDestination: 'both',
  replyVisibility: 'public',
  replyParentVisibility: 'public',
} as const;

describe('resolveReplySubmission', () => {
  it('options が無い返信のモーダルは、共有の送り先と公開範囲を使い、共有の下書きを消す', () => {
    expect(resolveReplySubmission(shared)).toEqual({
      destination: 'both',
      visibility: 'public',
      parentVisibility: 'public',
      resetsSharedDraft: true,
    });
  });

  it('options があるスレッドのフォームは、共有の送り先が別の値でも options の送り先と公開範囲を使う', () => {
    const result = resolveReplySubmission(
      { ...shared, replyDestination: 'fediverse' },
      { destination: 'bluesky', visibility: 'unlisted', parentVisibility: 'unlisted' },
    );
    expect(result.destination).toBe('bluesky');
    expect(result.visibility).toBe('unlisted');
    expect(result.parentVisibility).toBe('unlisted');
  });

  it('スレッドのフォームから送信しても、返信のモーダルの書きかけを消さない', () => {
    const result = resolveReplySubmission(shared, { destination: 'both' });
    expect(result.resetsSharedDraft).toBe(false);
  });
});
