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

  it('公開範囲のセレクトを出し、初期状態では「公開」を選んでおく', () => {
    const html = render();
    const select = /<select[^>]*name="visibility"[\s\S]*?<\/select>/.exec(html)?.[0] ?? '';

    expect(select).toContain('aria-label="公開範囲"');
    expect(select).toContain('<option value="public" selected="">');
    expect(select).not.toContain('<option value="unlisted" selected="">');
    expect(select).not.toContain('<option value="private" selected="">');
  });

  it('画像・CW・公開範囲・送り先を、投稿するボタンと同じ1行のツールバーにまとめる', () => {
    const html = render();
    const toolbar = html.slice(html.indexOf('mr-auto flex flex-wrap'), html.indexOf('投稿する'));

    expect(toolbar).toContain('aria-label="注意書き（CW）を付ける"');
    expect(toolbar).toContain('aria-label="公開範囲"');
    expect(toolbar).toContain('aria-label="送り先"');
    expect(toolbar.indexOf('aria-label="公開範囲"')).toBeLessThan(toolbar.indexOf('aria-label="送り先"'));
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
