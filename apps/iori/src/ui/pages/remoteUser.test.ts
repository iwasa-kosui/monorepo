import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import type { Account } from '../../adaptor/mastodon/entities.ts';
import { CustomEmojiText, splitCustomEmojiText } from '../components/CustomEmojiText.tsx';
import { RemoteUserPage } from './remoteUser.tsx';

const emoji = { shortcode: 'blobcat', url: 'https://remote.example/emoji/blobcat.png' } as Account['emojis'][number];

const account = (overrides: Partial<Account> = {}): Account =>
  ({
    id: 'a1',
    username: 'alice',
    acct: 'alice@remote.example',
    url: 'https://remote.example/@alice',
    uri: 'https://remote.example/users/alice',
    display_name: 'alice',
    note: '',
    avatar: 'https://iori.example/default-avatar.png',
    header: 'https://iori.example/default-header.png',
    locked: false,
    bot: false,
    fields: [],
    emojis: [],
    ...overrides,
  }) as Account;

const render = (a: Account, overrides: Partial<Parameters<typeof RemoteUserPage>[0]> = {}): string =>
  String(jsx(RemoteUserPage, {
    account: a,
    statuses: [],
    isFollowing: false,
    isMuted: false,
    isBlocked: false,
    isLoggedIn: false,
    onLike: async () => {},
    onFollow: async () => {},
    onUnfollow: async () => {},
    onMute: async () => {},
    onUnmute: async () => {},
    onReportOpen: () => {},
    onReportClose: () => {},
    onReportSubmit: () => {},
    onBlock: async () => {},
    onUnblock: async () => {},
    likingPostId: null,
    isMuting: false,
    isBlocking: false,
    isTogglingFollow: false,
    isReportOpen: false,
    isReporting: false,
    isReported: false,
    ...overrides,
  }));

describe('RemoteUserPage profile', () => {
  it('shows the display name with the handle below it', () => {
    const html = render(account({ display_name: 'Alice Liddell' }));

    expect(html).toContain('Alice Liddell');
    expect(html).toContain('@alice@remote.example');
  });

  it('falls back to the username when display_name is empty', () => {
    const html = render(account({ display_name: '' }));

    expect(html).toContain('>alice</h1>');
  });

  it('shows the note as sanitized HTML', () => {
    const html = render(account({ note: '<p>自己紹介です</p>' }));

    expect(html).toContain('<p>自己紹介です</p>');
  });

  it('omits the note block when note is empty', () => {
    expect(render(account())).not.toContain('remote-user-note');
  });

  it('shows fields as a table with name as text and value as HTML', () => {
    const html = render(account({
      fields: [{ name: 'Web', value: '<a href="https://example.com">example.com</a>', verified_at: null }],
    }));

    expect(html).toContain('<table');
    expect(html).toContain('Web');
    expect(html).toContain('<a href="https://example.com">example.com</a>');
  });

  it('does not render fields when there are none', () => {
    expect(render(account())).not.toContain('<table');
  });

  it('shows bot and locked badges only when set', () => {
    const plain = render(account());
    expect(plain).not.toContain('承認制');
    expect(plain).not.toContain('>bot<');

    const flagged = render(account({ bot: true, locked: true }));
    expect(flagged).toContain('>bot<');
    expect(flagged).toContain('承認制');
  });

  it('shows the header image unless it is the default one', () => {
    expect(render(account())).not.toContain('ヘッダー画像');
    expect(render(account({ header: 'https://remote.example/header.png' }))).toContain(
      'src="https://remote.example/header.png"',
    );
  });

  it('escapes HTML in display_name', () => {
    const html = render(account({ display_name: '<script>alert(1)</script>' }));

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('turns :shortcode: in display_name and field names into img elements', () => {
    const html = render(account({
      display_name: 'alice :blobcat:',
      emojis: [emoji],
      fields: [{ name: ':blobcat: Web', value: 'x', verified_at: null }],
    }));

    expect(html.match(/<img src="https:\/\/remote\.example\/emoji\/blobcat\.png"/g)).toHaveLength(2);
  });

  it('turns shortcodes with hyphens into img elements', () => {
    const hyphenated = {
      shortcode: 'blobcat-heart',
      url: 'https://remote.example/emoji/blobcat-heart.png',
    } as Account['emojis'][number];
    const html = render(account({ display_name: 'alice :blobcat-heart:', emojis: [hyphenated] }));

    expect(html).toContain('<img src="https://remote.example/emoji/blobcat-heart.png"');
  });
});

describe('RemoteUserPage block button', () => {
  it('shows the block button after the mute button when logged in', () => {
    const html = render(account(), { isLoggedIn: true });

    expect(html).toContain('title="ブロック"');
    expect(html).not.toContain('ブロック解除');
    expect(html.indexOf('title="ブロック"')).toBeGreaterThan(html.indexOf('title="ミュート"'));
  });

  it('shows the unblock button in terracotta while blocked', () => {
    const html = render(account(), { isLoggedIn: true, isBlocked: true });
    const button = html.slice(html.lastIndexOf('<button', html.indexOf('title="ブロック解除"')));

    expect(button).toContain('text-terracotta');
    expect(html).not.toContain('title="ブロック"');
  });

  it('hides the block button when signed out', () => {
    expect(render(account())).not.toContain('ブロック');
  });
});

describe('CustomEmojiText', () => {
  it('keeps unknown shortcodes as text', () => {
    expect(splitCustomEmojiText('hi :unknown:', [emoji])).toEqual([{ type: 'text', text: 'hi :unknown:' }]);
  });

  it('splits text around known shortcodes', () => {
    expect(splitCustomEmojiText('a :blobcat: b', [emoji])).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'emoji', shortcode: 'blobcat', url: emoji.url },
      { type: 'text', text: ' b' },
    ]);
  });

  it('replaces a known shortcode that follows an unknown one', () => {
    expect(splitCustomEmojiText(':unknown:blobcat:', [emoji])).toEqual([
      { type: 'text', text: ':unknown' },
      { type: 'emoji', shortcode: 'blobcat', url: emoji.url },
    ]);
  });

  it('ignores emojis whose url is not http(s)', () => {
    const unsafe = { shortcode: 'x', url: 'javascript:alert(1)' } as Account['emojis'][number];

    expect(String(jsx(CustomEmojiText, { text: ':x:', emojis: [unsafe] }))).toBe(':x:');
  });
});

describe('RemoteUserPage report', () => {
  it('shows a report button titled 通報 for a signed-in viewer', () => {
    const html = render(account(), { isLoggedIn: true });

    expect(html).toMatch(/<button[^>]*title="通報"/);
  });

  it('does not show the report button to a signed-out viewer', () => {
    expect(render(account())).not.toContain('title="通報"');
  });

  it('shows the report modal for the handle only while it is open', () => {
    expect(render(account(), { isLoggedIn: true })).not.toContain('を通報');

    const html = render(account(), { isLoggedIn: true, isReportOpen: true, reportError: 'Failed to report: HTTP 422' });

    expect(html).toContain('@alice@remote.example を通報');
    expect(html).toContain('Failed to report: HTTP 422');
  });

  it('shows the 通報しました notice only after a successful report', () => {
    expect(render(account(), { isLoggedIn: true })).not.toContain('通報しました');
    expect(render(account(), { isLoggedIn: true, isReported: true })).toContain('通報しました');
  });
});
