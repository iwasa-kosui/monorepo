import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import type { Visibility } from '../../domain/post/visibility.ts';
import type { PostVisibility } from './postVisibility.ts';
import { ReplyVisibilityControl, ReplyVisibilityNotice } from './ReplyVisibilityField.tsx';

const noop = () => {};

type Overrides = Partial<{
  value: PostVisibility;
  parentVisibility: Visibility;
  destination: 'fediverse' | 'bluesky' | 'both';
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

const renderNotice = (overrides: Overrides = {}): string =>
  String(jsx(ReplyVisibilityNotice, { value: 'public', ...overrides }));

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

describe('ReplyVisibilityNotice', () => {
  it('返信先がダイレクトなら、返信もダイレクトになる文を出す', () => {
    expect(renderNotice({ parentVisibility: 'direct', value: 'private', destination: 'fediverse' })).toContain(
      '返信先がダイレクトなので、返信もダイレクトになります',
    );
  });

  it('返信先がダイレクトで送り先が both なら、Bluesky には送らない旨を同じ文に含める', () => {
    const html = renderNotice({ parentVisibility: 'direct', value: 'private', destination: 'both' });

    expect(html).toContain('返信先がダイレクトなので、返信もダイレクトになり、Bluesky には送りません');
    expect(html).not.toContain('公開範囲が公開ではないので、Bluesky には送りません');
  });

  it('送り先が both で公開範囲が公開ではないとき、Bluesky に送らない案内を出す', () => {
    expect(renderNotice({ destination: 'both', value: 'unlisted' })).toContain(
      '公開範囲が公開ではないので、Bluesky には送りません',
    );
  });

  it('公開で送り先が both なら、何も出さない', () => {
    expect(renderNotice({ destination: 'both', value: 'public' })).toBe('');
  });

  it('送り先を渡さなければ、Bluesky の案内を出さない', () => {
    expect(renderNotice({ value: 'unlisted' })).not.toContain('Bluesky には送りません');
  });
});
