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
    onFollow: async () => {},
    onUnfollow: async () => {},
    onMute: async () => {},
    onUnmute: async () => {},
    onReportOpen: () => {},
    onReportClose: () => {},
    onReportSubmit: () => {},
    onBlock: async () => {},
    onUnblock: async () => {},
    isMuting: false,
    isBlocking: false,
    isTogglingFollow: false,
    isLoadingRemoteStatuses: false,
    isReportOpen: false,
    isReporting: false,
    isReported: false,
    ...overrides,
  }));

describe('RemoteUserPage', () => {
  it('escapes HTML in display_name', () => {
    const html = render(account({ display_name: '<script>alert(1)</script>' }));

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
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
