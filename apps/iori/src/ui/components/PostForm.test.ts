import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import { PostForm } from './PostForm.tsx';

const render = (): string => String(jsx(PostForm, { onPosted: () => {} }));

describe('PostForm', () => {
  it('CW のトグルを aria-pressed 付きで出し、初期状態では CW の入力欄を出さない', () => {
    const html = render();

    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('aria-label="注意書き（CW）を付ける"');
    expect(html).not.toContain('name="spoiler_text"');
  });

  it('画像がなければ ALT の欄とセンシティブのチェックボックスを出さない', () => {
    const html = render();

    expect(html).not.toContain('説明（ALT）');
    expect(html).not.toContain('画像をセンシティブにする');
  });
});
