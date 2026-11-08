import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import { XFetchControl } from './XFetchControl.tsx';

const DISABLED_ATTRIBUTE = /\sdisabled(?:=|>|\s)/;

const render = (props: Partial<Parameters<typeof XFetchControl>[0]> = {}): string =>
  String(jsx(XFetchControl, {
    fetchEnabled: true,
    isRefreshing: false,
    onRefresh: () => {},
    message: '',
    ...props,
  }));

describe('XFetchControl', () => {
  it('取得が有効なときは、押せる今すぐ取得ボタンを出す', () => {
    const html = render();

    expect(html).toContain('今すぐ取得');
    expect(html).not.toMatch(DISABLED_ATTRIBUTE);
    expect(html).not.toContain('取り込みは無効です');
  });

  it('取得中は、取得中の表示にしてボタンを disabled にする', () => {
    const html = render({ isRefreshing: true });

    expect(html).toContain('取得中...');
    expect(html).not.toContain('今すぐ取得');
    expect(html).toMatch(DISABLED_ATTRIBUTE);
  });

  it('取得が無効なときは、ボタンを出さずに取り込みは無効だと表示する', () => {
    const html = render({ fetchEnabled: false });

    expect(html).not.toContain('<button');
    expect(html).toContain('取り込みは無効です');
  });

  it('メッセージがあるときだけ、role が status の段落で出す', () => {
    expect(render()).not.toContain('role="status"');
    expect(render({ message: '3 件を取り込みました' })).toContain('<p role="status"');
    expect(render({ message: '3 件を取り込みました' })).toContain('3 件を取り込みました');
  });
});
