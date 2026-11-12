import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import { PostForm } from './PostForm.tsx';

const render = (): string => String(jsx(PostForm, { onPosted: () => {} }));

describe('PostForm', () => {
  it('CW のトグルを aria-pressed 付きで出し、初期状態では CW の入力欄を出さない', () => {
    const html = render();

    expect(html).toContain('aria-pressed="false"');
    expect(html).not.toContain('注意書き（CW）');
  });

  it('公開範囲の radiogroup を出し、初期状態では「公開」を選んでおく', () => {
    const html = render();

    expect(html).toContain('aria-label="公開範囲"');
    expect(html).toMatch(/<input[^>]*name="visibility"[^>]*value="public"[^>]*checked/);
    expect(html).not.toMatch(/<input[^>]*name="visibility"[^>]*value="unlisted"[^>]*checked/);
    expect(html).not.toMatch(/<input[^>]*name="visibility"[^>]*value="private"[^>]*checked/);
  });

  it('公開範囲が公開の初期状態では、Bluesky に送らない案内を出さない', () => {
    expect(render()).not.toContain('Bluesky には送りません');
  });

  it('画像がなければ ALT の欄とセンシティブのチェックボックスを出さない', () => {
    const html = render();

    expect(html).not.toContain('画像の説明（ALT）');
    expect(html).not.toContain('画像をセンシティブにする');
  });
});
