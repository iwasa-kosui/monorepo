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

  it('公開範囲の radiogroup を出し、初期状態では「公開」を選んでおく', () => {
    const html = render();

    expect(html).toContain('aria-label="公開範囲"');
    expect(html).toMatch(/<input[^>]*name="visibility"[^>]*value="public"[^>]*checked/);
    expect(html).not.toMatch(/<input[^>]*name="visibility"[^>]*value="unlisted"[^>]*checked/);
    expect(html).not.toMatch(/<input[^>]*name="visibility"[^>]*value="private"[^>]*checked/);
  });

  it('公開範囲の選択欄を、送り先と別の行に置く', () => {
    const html = render();
    const visibility = html.indexOf('aria-label="公開範囲"');
    const destination = html.indexOf('aria-label="送り先"');

    expect(visibility).toBeGreaterThan(-1);
    expect(visibility).toBeLessThan(destination);
    expect(html).toMatch(/<div class="mt-2 flex flex-wrap [^"]*"[^>]*><div[^>]*aria-label="送り先"/);
  });

  it('公開範囲の説明の id を、フォームの id から作る', () => {
    const inline = String(jsx(PostForm, { id: 'post', onPosted: () => {} }));
    const modal = String(jsx(PostForm, { formId: 'post-modal-form', onPosted: () => {} }));

    expect(inline).toContain('id="post-visibility-description"');
    expect(modal).toContain('id="post-modal-form-visibility-description"');
  });

  it('公開範囲が公開の初期状態では、Bluesky に送らない案内を出さない', () => {
    expect(render()).not.toContain('Bluesky には送りません');
  });

  it('送り先が両方の初期状態では、返信できる人と引用の設定を出さない', () => {
    const html = render();

    expect(html).not.toContain('aria-label="返信できる人"');
    expect(html).not.toContain('引用を許可しない');
  });

  it('画像がなければ ALT の欄とセンシティブのチェックボックスを出さない', () => {
    const html = render();

    expect(html).not.toContain('説明（ALT）');
    expect(html).not.toContain('画像をセンシティブにする');
  });
});
