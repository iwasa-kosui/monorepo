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
  it('renders a favourite with the actor, the liked post content and a link to the post', () => {
    const html = render(notification({ type: 'favourite', status: status('p1') }));

    expect(html).toContain('alice@remote.example');
    expect(html).toContain('liked your post');
    expect(html).toContain('<p>content of p1</p>');
    expect(html).toContain('href="/users/kosui/posts/p1"');
    expect(html).toContain('href="/remote-users/actor-2"');
  });

  it('renders a reblog with the actor, the boosted post content and a link to the post', () => {
    const html = render(notification({ type: 'reblog', status: status('p3') }));

    expect(html).toContain('alice@remote.example');
    expect(html).toContain('boosted your post');
    expect(html).toContain('<p>content of p3</p>');
    expect(html).toContain('href="/users/kosui/posts/p3"');
    expect(html).toContain('href="/remote-users/actor-2"');
  });

  it('renders a mention from a remote account with a link to the detail page of the post itself', () => {
    const html = render(notification({
      type: 'mention',
      status: status('m1', { uri: 'https://remote.example/users/alice/statuses/m1', account: remoteAccount }),
      iori: { fediverse: { reason: 'mention' } },
    }));

    expect(html).toContain('mentioned you');
    expect(html).not.toContain('replied to your post');
    expect(html).toContain('<p>content of m1</p>');
    expect(html).toContain('href="/posts/m1"');
    expect(html).not.toContain('/users/kosui/posts/');
  });

  it('renders a mention that replies to my post with a link to the detail page of the reply', () => {
    const html = render(notification({
      type: 'mention',
      status: status('reply-1', { account: remoteAccount, in_reply_to_id: 'p1' }),
      iori: { fediverse: { reason: 'reply' } },
    }));

    expect(html).toContain('replied to your post');
    expect(html).toContain('<p>content of reply-1</p>');
    expect(html).toContain('href="/posts/reply-1"');
    expect(html).not.toContain('href="/users/kosui/posts/p1"');
  });

  it('keeps the reply label for a mention without a fediverse reason', () => {
    const html = render(notification({ type: 'mention', status: status('m3', { account: remoteAccount }) }));

    expect(html).toContain('replied to your post');
  });

  it('renders a mention from a local account with a link to the post in the profile', () => {
    const html = render(notification({
      type: 'mention',
      account: localAccount,
      status: status('m2', { account: localAccount }),
    }));

    expect(html).toContain('href="/users/kosui/posts/m2"');
  });

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

  describe('Bluesky notifications without a status', () => {
    const blueskyAccount = {
      id: 'bluesky:did:plc:carol',
      username: 'carol.bsky.social',
      acct: 'carol.bsky.social',
      url: 'https://bsky.app/profile/carol.bsky.social',
      uri: 'https://bsky.app/profile/did:plc:carol',
      avatar: 'https://iori.example/default-avatar.png',
    } as Account;

    it('links a favourite to the post on bsky.app and the actor to the profile page in iori', () => {
      const html = render(notification({
        type: 'favourite',
        account: blueskyAccount,
        iori: { bluesky: { reason: 'like', url: 'https://bsky.app/profile/did:plc:me/post/3kpost' } },
      }));

      expect(html).toContain('liked your post');
      expect(html).toContain('carol.bsky.social');
      expect(html).toContain('href="https://bsky.app/profile/did:plc:me/post/3kpost"');
      expect(html).toContain('href="/bluesky/profile/did%3Aplc%3Acarol"');
      expect(html).not.toContain('/posts/"');
    });

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

    it('shows the text of a reply and a quote with their own labels', () => {
      const reply = render(notification({
        type: 'mention',
        account: blueskyAccount,
        status: status('p1'),
        iori: { bluesky: { reason: 'reply', url: 'https://bsky.app/x', text: 'a reply' } },
      }));
      const quote = render(notification({
        type: 'mention',
        account: blueskyAccount,
        iori: { bluesky: { reason: 'quote', url: 'https://bsky.app/y', text: 'a quote' } },
      }));

      expect(reply).toContain('replied to your post');
      expect(reply).toContain('a reply');
      expect(reply).not.toContain('content of p1');
      expect(quote).toContain('quoted your post');
    });

    describe('with a synthesized status', () => {
      const synthetic = (id: string, overrides: Partial<Status> = {}): Status =>
        status(id, { content: '', account: blueskyAccount, ...overrides });

      it('links a favourite to bsky.app and renders no internal link or empty block', () => {
        const html = render(notification({
          type: 'favourite',
          account: blueskyAccount,
          status: synthetic('bluesky:at://did:plc:me/app.bsky.feed.post/3kpost'),
          iori: { bluesky: { reason: 'like', url: 'https://bsky.app/profile/did:plc:me/post/3kpost' } },
        }));

        expect(html).toContain('href="https://bsky.app/profile/did:plc:me/post/3kpost"');
        expect(html).not.toContain('/users/kosui/posts/');
        expect(html).not.toContain('role="button"');
      });

      it('prefers the text of a mention over the synthesized content', () => {
        const html = render(notification({
          type: 'mention',
          account: blueskyAccount,
          status: synthetic('bluesky:at://did:plc:carol/app.bsky.feed.post/3kmention', {
            content: '<p>from content</p>',
          }),
          iori: {
            bluesky: {
              reason: 'mention',
              url: 'https://bsky.app/profile/did:plc:carol/post/3kmention',
              text: 'from text',
            },
          },
        }));

        expect(html).toContain('from text');
        expect(html).not.toContain('from content');
        expect(html).not.toContain('/users/kosui/posts/');
      });

      it('renders a reblog without an internal link or an empty block', () => {
        const html = render(notification({
          type: 'reblog',
          account: blueskyAccount,
          status: synthetic('bluesky:at://did:plc:me/app.bsky.feed.post/3kpost'),
          iori: { bluesky: { reason: 'repost', url: 'https://bsky.app/profile/did:plc:me/post/3kpost' } },
        }));

        expect(html).toContain('boosted your post');
        expect(html).toContain('href="https://bsky.app/profile/did:plc:me/post/3kpost"');
        expect(html).not.toContain('/posts/bluesky:');
        expect(html).not.toContain('role="button"');
      });
    });

    it('renders a follow and a reblog without a status', () => {
      const follow = render(notification({
        type: 'follow',
        account: blueskyAccount,
        iori: { bluesky: { reason: 'follow', url: 'https://bsky.app/profile/carol.bsky.social' } },
      }));
      const reblog = render(notification({
        type: 'reblog',
        account: blueskyAccount,
        iori: { bluesky: { reason: 'repost', url: 'https://bsky.app/profile/did:plc:me/post/3kpost' } },
      }));

      expect(follow).toContain('started following you');
      expect(reblog).toContain('boosted your post');
    });
  });

  it('renders nothing for a notification type the page does not request', () => {
    expect(render(notification({ type: 'poll' }))).toBe('');
  });
});
