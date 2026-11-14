import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import type { Account, Notification, Status } from '../../adaptor/mastodon/entities.ts';
import { NotificationItem } from './NotificationItem.tsx';

const EVIL = 'javascript:alert(1)';

const localAccount = {
  id: 'actor-1',
  username: 'kosui',
  acct: 'kosui',
  uri: 'https://iori.example/users/kosui',
  avatar: 'https://iori.example/avatar.png',
} as Account;

const remoteAccount = {
  id: 'actor-2',
  username: 'alice',
  acct: 'alice@remote.example',
  uri: 'https://remote.example/users/alice',
  avatar: EVIL,
} as Account;

const status = (id: string, overrides: Partial<Status> = {}): Status =>
  ({
    id,
    uri: `https://iori.example/users/kosui/posts/${id}`,
    account: localAccount,
    content: `<p>content of ${id}</p>`,
    spoiler_text: '',
    in_reply_to_id: null,
    ...overrides,
  }) as Status;

const notification = (overrides: Partial<Notification>): Notification =>
  ({
    id: 'n1',
    type: 'favourite',
    created_at: '2026-01-02T03:04:05.000Z',
    account: remoteAccount,
    ...overrides,
  }) as Notification;

const render = (n: Notification): string =>
  String(jsx(NotificationItem, { notification: n, recipientUsername: 'kosui' }));

describe('NotificationItem', () => {
  it('renders the spoiler text instead of the content for a post with a content warning', () => {
    const html = render(notification({
      type: 'favourite',
      status: status('p4', { spoiler_text: 'spoiler topic' }),
    }));

    expect(html).toContain('CW: spoiler topic');
    expect(html).not.toContain('content of p4');
  });

  it('escapes html in the spoiler text', () => {
    const html = render(notification({
      type: 'mention',
      status: status('p5', { spoiler_text: '<img src=x onerror=alert(1)>' }),
    }));

    expect(html).toContain('CW: &lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('content of p5');
  });

  it('does not render a javascript: avatar or emoji image url', () => {
    const html = render(notification({
      type: 'iori:emoji_reaction',
      status: status('p2'),
      iori: { emoji: ':x:', url: EVIL },
    }));

    expect(html).not.toContain('javascript:');
  });

  describe('Bluesky notifications without a status', () => {
    const blueskyAccount = {
      id: 'bluesky:did:plc:carol',
      username: 'carol.bsky.social',
      acct: 'carol.bsky.social',
      url: 'https://bsky.app/profile/carol.bsky.social',
      uri: 'https://bsky.app/profile/did:plc:carol',
      avatar: 'https://iori.example/default-avatar.png',
    } as Account;

    it('shows the text of a mention and links to the post itself', () => {
      const html = render(notification({
        type: 'mention',
        account: blueskyAccount,
        iori: {
          bluesky: {
            reason: 'mention',
            url: 'https://bsky.app/profile/did:plc:carol/post/3kmention',
            text: 'hello <b>there</b>',
          },
        },
      }));

      expect(html).toContain('mentioned you');
      expect(html).toContain('hello &lt;b&gt;there&lt;/b&gt;');
      expect(html).toContain('href="https://bsky.app/profile/did:plc:carol/post/3kmention"');
    });
  });
});
