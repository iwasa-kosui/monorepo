import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import type { FeedSource } from '../api/mastodonClient.ts';
import { XFeedSourceManager } from './XFeedSourceManager.tsx';

const source = (overrides: Partial<FeedSource> = {}): FeedSource => ({
  feedSourceId: '00000000-0000-4000-8000-000000000001',
  kind: 'x_user',
  url: 'https://x.com/jack',
  title: '@jack',
  enabled: true,
  lastFetchedAt: '2026-11-06T01:00:00.000Z',
  lastError: null,
  ...overrides,
});

const render = (props: Partial<Parameters<typeof XFeedSourceManager>[0]> = {}): string =>
  String(jsx(XFeedSourceManager, {
    sources: [source()],
    username: '',
    isAdding: false,
    addError: '',
    togglingIds: [],
    toggleError: '',
    onUsernameInput: () => {},
    onAdd: () => {},
    onToggle: () => {},
    ...props,
  }));

describe('XFeedSourceManager', () => {
  it('ユーザー名、有効の表示、最後に取得した日時、無効にするボタンを出す', () => {
    const html = render();

    expect(html).toContain('@jack');
    expect(html).toContain('有効');
    expect(html).toContain('datetime="2026-11-06T01:00:00.000Z"');
    expect(html).toContain('無効にする');
    expect(html).not.toContain('有効にする');
  });

  it('無効のユーザーには無効の表示と有効にするボタンを出す', () => {
    const html = render({ sources: [source({ enabled: false })] });

    expect(html).toContain('無効</span>');
    expect(html).toContain('有効にする');
    expect(html).not.toContain('無効にする');
  });

  it('まだ取得していないユーザーには未取得と出す', () => {
    const html = render({ sources: [source({ lastFetchedAt: null })] });

    expect(html).toContain('未取得');
    expect(html).not.toContain('<time');
  });

  it('最後のエラーがあるときだけ出す', () => {
    expect(render()).not.toContain('エラー:');
    expect(render({ sources: [source({ lastError: 'HTTP 429' })] })).toContain('エラー: HTTP 429');
  });

  it('ユーザーがいないときは追加を促す案内を出す', () => {
    const html = render({ sources: [] });

    expect(html).toContain('取り込む X のユーザーがまだいません');
    expect(html).not.toContain('<ul');
  });

  it('ユーザー名とエラーの HTML をエスケープする', () => {
    const html = render({
      sources: [source({ title: '@"><b>', lastError: '<script>alert(1)</script>' })],
      addError: '<img src=x onerror=alert(2)>',
    });

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('追加中は追加ボタンを押せなくする', () => {
    const html = render({ isAdding: true });

    expect(html).toContain('追加中...');
    expect(html).toMatch(/<button type="submit" disabled/);
  });

  it('切り替え中の行のボタンだけを押せなくする', () => {
    const html = render({
      sources: [source({ feedSourceId: 'a' }), source({ feedSourceId: 'b', title: '@bob' })],
      togglingIds: ['a'],
    });

    expect(html.match(/<button type="button" disabled/g)).toHaveLength(1);
  });

  it('追加と切り替えのエラーを alert で出す', () => {
    const html = render({ addError: '追加の失敗', toggleError: '切り替えの失敗' });

    expect(html).toContain('追加の失敗');
    expect(html).toContain('切り替えの失敗');
    expect(html.match(/role="alert"/g)).toHaveLength(2);
  });
});
