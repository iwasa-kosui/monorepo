import { jsx } from 'hono/jsx';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./postDestination.ts', () => ({ DEFAULT_POST_DESTINATION: 'bluesky' }));

const { PostForm } = await import('./PostForm.tsx');

describe('PostForm の送り先が Bluesky だけのとき', () => {
  it('返信できる人と引用の設定を出す', () => {
    const html = String(jsx(PostForm, { id: 'post', onPosted: () => {} }));

    expect(html).toContain('aria-label="返信できる人"');
    expect(html).toContain('name="post-bluesky-interaction-reply-mode"');
    expect(html).toContain('引用を許可しない');
  });
});
