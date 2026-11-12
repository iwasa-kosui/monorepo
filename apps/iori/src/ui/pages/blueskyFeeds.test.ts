import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import type { BlueskySavedFeedView } from '../api/blueskyFeedClient.ts';
import { FeedButton, FeedUrlFormView, FeedViewSwitch } from './blueskyFeeds.tsx';

const feed: BlueskySavedFeedView = {
  uri: 'at://did:plc:own/app.bsky.graph.list/3k',
  kind: 'list',
  pinned: false,
  displayName: 'Friends',
};

describe('FeedButton', () => {
  it('保存していない項目にだけ「保存していない」を出す', () => {
    const render = (unsaved: boolean) =>
      String(jsx(FeedButton, { feed, selected: false, unsaved, onSelect: () => {} }));

    expect(render(true)).toContain('保存していない');
    expect(render(false)).not.toContain('保存していない');
    expect(String(jsx(FeedButton, { feed, selected: false, onSelect: () => {} }))).not.toContain('保存していない');
  });

  it('list に「リスト」を出し、feed には出さない', () => {
    const html = (kind: 'feed' | 'list') =>
      String(jsx(FeedButton, { feed: { ...feed, kind }, selected: false, onSelect: () => {} }));

    expect(html('list')).toContain('リスト');
    expect(html('feed')).not.toContain('リスト');
  });
});

describe('FeedViewSwitch', () => {
  it('「投稿」と「メンバー」を出し、選んでいるほうを aria-selected にする', () => {
    const html = String(jsx(FeedViewSwitch, { view: 'members', onSelect: () => {} }));

    expect(html).toContain('投稿');
    expect(html).toContain('メンバー');
    expect(html).toMatch(/aria-selected="true"[^>]*>メンバー/);
    expect(html).toMatch(/aria-selected="false"[^>]*>投稿/);
  });
});

describe('FeedUrlFormView', () => {
  const render = (overrides: Partial<Parameters<typeof FeedUrlFormView>[0]> = {}) =>
    String(jsx(FeedUrlFormView, {
      value: '',
      submitting: false,
      error: undefined,
      onInput: () => {},
      onSubmit: () => {},
      ...overrides,
    }));

  it('「bsky.app のフィードやリストの URL を開く」入力欄と「開く」ボタンを出す', () => {
    const html = render({ value: 'https://bsky.app/profile/a.bsky.social/feed/x' });

    expect(html).toContain('bsky.app のフィードやリストの URL を開く');
    expect(html).toContain('value="https://bsky.app/profile/a.bsky.social/feed/x"');
    expect(html).toContain('開く');
    expect(html).not.toContain('role="alert"');
  });

  it('失敗の文言を alert にして出し、送信中はボタンを無効にする', () => {
    const html = render({ error: 'bsky.app のフィードかリストの URL を入力してください', submitting: true });

    expect(html).toContain('role="alert"');
    expect(html).toContain('bsky.app のフィードかリストの URL を入力してください');
    expect(html).toMatch(/\sdisabled(?=[\s>=])/);
    expect(render()).not.toMatch(/\sdisabled(?=[\s>=])/);
  });
});
