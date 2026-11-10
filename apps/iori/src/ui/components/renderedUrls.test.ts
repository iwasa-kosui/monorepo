import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import type { Account, Status } from '../../adaptor/mastodon/entities.ts';
import type { PostWithAuthor } from '../../domain/post/post.ts';
import { actorToAccount, postToStatus } from '../legacyConversion.ts';
import { ActorLink } from './ActorLink.tsx';
import { LinkPreviewCard } from './LinkPreviewCard.tsx';
import { PostView } from './PostView.tsx';

const EVIL = 'javascript:alert(1)';

const remotePost = {
  type: 'remote',
  postId: 'post-1',
  actorId: 'actor-1',
  userId: 'user-1',
  username: 'alice',
  uri: 'https://remote.example/notes/1',
  content: '<p>hello</p>',
  createdAt: Date.parse('2026-01-02T03:04:05.000Z'),
  logoUri: EVIL,
  liked: false,
  reposted: false,
  inReplyToUri: null,
  images: [{ url: EVIL, altText: 'evil' }, { url: 'https://remote.example/ok.png', altText: 'ok' }],
  likeCount: 0,
  repostCount: 0,
  reactions: [{ emoji: ':x:', count: 1, emojiImageUrl: EVIL }],
  linkPreviews: [
    { url: EVIL, title: 'bad', description: null, imageUrl: null, siteName: null, faviconUrl: null },
    {
      url: 'https://example.com/',
      title: 'good',
      description: null,
      imageUrl: EVIL,
      siteName: null,
      faviconUrl: EVIL,
    },
  ],
} as unknown as PostWithAuthor;

const renderStatus = (status: Status): string => String(jsx(PostView, { status }));

describe('PostView', () => {
  it('does not render a javascript: url in href or src', () => {
    const html = renderStatus(postToStatus(remotePost));

    expect(html).not.toContain('javascript:');
    expect(html).toContain('https://remote.example/ok.png');
    expect(html).toContain('https://example.com/');
  });

  it('does not link to a remote post whose uri is not an absolute http(s) url', () => {
    const status = postToStatus({ ...remotePost, uri: EVIL } as unknown as PostWithAuthor);

    expect(renderStatus(status)).not.toContain('javascript:');
  });

  it('does not render a javascript: avatar or attachment url of a boosted status', () => {
    const inner = postToStatus(remotePost);
    const booster = postToStatus(
      { ...remotePost, postId: 'post-2', uri: 'https://remote.example/notes/2' } as unknown as PostWithAuthor,
    );
    const html = renderStatus({ ...booster, reblog: { ...inner, account: { ...inner.account, avatar: EVIL } } });

    expect(html).not.toContain('javascript:');
  });
});

describe('ActorLink', () => {
  it('does not render a javascript: avatar or local account uri', () => {
    const account: Account = {
      ...actorToAccount({ type: 'local', id: 'a', uri: 'https://iori.example/users/kosui', logoUri: EVIL } as never),
      uri: EVIL,
    };

    const html = String(jsx(ActorLink, { account }));

    expect(html).not.toMatch(/(href|src)="javascript:/);
    expect(html).not.toContain('<img');
  });
});

describe('LinkPreviewCard', () => {
  it('renders nothing for a javascript: preview url', () => {
    const preview = { url: EVIL, title: null, description: null, image: null, site_name: null, favicon: null };

    expect(String(jsx(LinkPreviewCard, { preview }))).toBe('');
  });

  it('drops a javascript: image and favicon', () => {
    const preview = {
      url: 'https://example.com/',
      title: 't',
      description: null,
      image: EVIL,
      site_name: null,
      favicon: EVIL,
    };

    expect(String(jsx(LinkPreviewCard, { preview }))).not.toContain('javascript:');
  });
});
