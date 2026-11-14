import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import type { Visibility } from '../../domain/post/visibility.ts';
import type { PostVisibility } from './postVisibility.ts';
import { ReplyVisibilityControl } from './ReplyVisibilityField.tsx';

const noop = () => {};

type Overrides = Partial<{
  value: PostVisibility;
  parentVisibility: Visibility;
  disabled: boolean;
}>;

const renderControl = (overrides: Overrides = {}): string =>
  String(jsx(ReplyVisibilityControl, {
    value: 'public',
    onChange: noop,
    disabled: false,
    name: 'thread-reply-visibility',
    id: 'thread-reply-visibility',
    ...overrides,
  }));

describe('ReplyVisibilityControl', () => {
  it('公開範囲のセレクトを出す', () => {
    const html = renderControl();

    expect(html).toContain('aria-label="公開範囲"');
    expect(html).toContain('name="thread-reply-visibility"');
  });

  it('返信先が未収載なら、公開の選択肢を無効にする', () => {
    const html = renderControl({ parentVisibility: 'unlisted', value: 'unlisted' });
    const disabled = [...html.matchAll(/<option value="(\w+)" disabled="">/g)].map((match) => match[1]);

    expect(disabled).toEqual(['public']);
  });

  it('返信先がダイレクトなら、セレクトの代わりにダイレクトの印を出す', () => {
    const html = renderControl({ parentVisibility: 'direct', value: 'private' });

    expect(html).toContain('ダイレクト');
    expect(html).not.toContain('name="thread-reply-visibility"');
  });
});
