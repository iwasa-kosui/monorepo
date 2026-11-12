import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import { BlueskyStatusNotice } from './BlueskyStatusNotice.tsx';

const NOW = new Date(2026, 10, 12, 15, 30).getTime();

const render = (props: Partial<Parameters<typeof BlueskyStatusNotice>[0]> = {}): string =>
  String(jsx(BlueskyStatusNotice, { status: undefined, page: 'home', clientLoadFailed: false, now: NOW, ...props }));

describe('BlueskyStatusNotice', () => {
  it('通知が無いときは何も描画しない', () => {
    expect(render()).toBe('');
  });

  it('role が status の枠に、見出しと説明と再読み込みのボタンを出す', () => {
    const html = render({ clientLoadFailed: true });

    expect(html).toContain('role="status"');
    expect(html).toContain('Bluesky を読み込めませんでした');
    expect(html).toContain('iori のサーバーから Bluesky の投稿を読み込めませんでした。');
    expect(html).toContain('再読み込み');
    expect(html).toContain('text-terracotta');
  });

  it('無効なときは何も描画しない', () => {
    expect(render({ status: { enabled: false }, clientLoadFailed: true })).toBe('');
  });
});
