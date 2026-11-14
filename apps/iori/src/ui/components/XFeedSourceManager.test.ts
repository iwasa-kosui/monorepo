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
});
