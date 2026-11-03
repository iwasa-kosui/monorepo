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
  it('renders a favourite with the actor, the liked post content and a link to the post', () => {
    const html = render(notification({ type: 'favourite', status: status('p1') }));

    expect(html).toContain('alice@remote.example');
    expect(html).toContain('liked your post');
    expect(html).toContain('<p>content of p1</p>');
    expect(html).toContain('href="/users/kosui/posts/p1"');
    expect(html).toContain('href="/remote-users/actor-2"');
  });

  it('renders a mention with the reply content and a link to the replied-to post', () => {
    const html = render(notification({ type: 'mention', status: status('reply-1', { in_reply_to_id: 'p1' }) }));

    expect(html).toContain('replied to your post');
    expect(html).toContain('<p>content of reply-1</p>');
    expect(html).toContain('href="/users/kosui/posts/p1"');
  });

  it('renders a follow without a post', () => {
    const html = render(notification({ type: 'follow' }));

    expect(html).toContain('started following you');
    expect(html).toContain('alice@remote.example');
    expect(html).not.toContain('role="button"');
  });

  it('renders an emoji reaction with the custom emoji image', () => {
    const html = render(notification({
      type: 'iori:emoji_reaction',
      status: status('p2'),
      iori: { emoji: ':blobcat:', url: 'https://remote.example/blobcat.png' },
    }));

    expect(html).toContain('reacted with');
    expect(html).toContain('src="https://remote.example/blobcat.png"');
    expect(html).toContain('<p>content of p2</p>');
    expect(html).toContain('href="/users/kosui/posts/p2"');
  });

  it('renders an emoji reaction as text when the emoji has no url', () => {
    const html = render(notification({
      type: 'iori:emoji_reaction',
      status: status('p2'),
      iori: { emoji: '🎉', url: null },
    }));

    expect(html).toContain('🎉');
    expect(html).not.toContain('<img src="https://remote');
  });

  it('does not render a javascript: avatar or emoji image url', () => {
    const html = render(notification({
      type: 'iori:emoji_reaction',
      status: status('p2'),
      iori: { emoji: ':x:', url: EVIL },
    }));

    expect(html).not.toContain('javascript:');
  });

  it('renders nothing for a notification type the page does not request', () => {
    expect(render(notification({ type: 'reblog' }))).toBe('');
  });
});
