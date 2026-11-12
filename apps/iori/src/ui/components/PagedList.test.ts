import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import type { PagedListState } from '../hooks/pagedListState.ts';
import { PagedListBody } from './PagedList.tsx';

const render = (state: PagedListState<string>): string =>
  String(jsx(PagedListBody<string>, {
    state,
    emptyMessage: 'フィードはありません',
    renderItem: (item: string) => jsx('p', { key: item }, item),
    onRetryFirst: () => {},
    onRetryMore: () => {},
  }));

describe('PagedListBody', () => {
  it('読み込み中の文言を出す', () => {
    expect(render({ kind: 'loading' })).toContain('読み込んでいます');
  });

  it('最初の失敗は文言と再読み込みのボタンを出す', () => {
    const html = render({ kind: 'error', message: '読み込めませんでした' });

    expect(html).toContain('読み込めませんでした');
    expect(html).toContain('もう一度読み込む');
  });

  it('0 件なら空の文言を出す', () => {
    const html = render({ kind: 'ready', items: [], cursor: undefined, loadMoreFailed: null });

    expect(html).toContain('フィードはありません');
  });

  it('0 件でも cursor があれば空の文言を出さず、読み込み中の文言を出す', () => {
    const html = render({ kind: 'ready', items: [], cursor: 'next', loadMoreFailed: null });

    expect(html).toContain('読み込んでいます');
    expect(html).not.toContain('フィードはありません');
    expect(html).not.toContain('もう一度読み込む');
  });

  it('0 件で cursor があり続きの取得に失敗したら、失敗の文言と再読み込みのボタンを出す', () => {
    const html = render({
      kind: 'ready',
      items: [],
      cursor: 'next',
      loadMoreFailed: '続きを読み込めませんでした',
    });

    expect(html).toContain('続きを読み込めませんでした');
    expect(html).toContain('もう一度読み込む');
    expect(html).not.toContain('フィードはありません');
    expect(html).not.toContain('読み込んでいます');
  });

  it('項目を出し、続きが失敗しているときだけ文言と再読み込みのボタンを出す', () => {
    const ok = render({ kind: 'ready', items: ['a', 'b'], cursor: 'next', loadMoreFailed: null });
    const failed = render({
      kind: 'ready',
      items: ['a'],
      cursor: 'next',
      loadMoreFailed: '続きを読み込めませんでした',
    });

    expect(ok).toContain('<p>a</p>');
    expect(ok).toContain('<p>b</p>');
    expect(ok).not.toContain('もう一度読み込む');
    expect(failed).toContain('続きを読み込めませんでした');
    expect(failed).toContain('もう一度読み込む');
  });
});
