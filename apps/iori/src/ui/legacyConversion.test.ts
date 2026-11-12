import { describe, expect, it } from 'vitest';

import type { Actor } from '../domain/actor/actor.ts';
import type { PostWithAuthor } from '../domain/post/post.ts';
import { isLocalAccount } from './api/status.ts';
import { actorToAccount, postToStatus } from './legacyConversion.ts';

const basePost = {
  postId: 'post-1',
  actorId: 'actor-1',
  content: '<p>hello</p>',
  createdAt: Date.parse('2026-01-02T03:04:05.000Z'),
  username: 'kosui',
  logoUri: undefined,
  liked: true,
  reposted: false,
  images: [{ url: 'https://iori.example/a.png', altText: 'alt' }],
  likeCount: 3,
  repostCount: 2,
  reactions: [{ emoji: '👍', count: 1, emojiImageUrl: null }],
  linkPreviews: [{
    url: 'https://example.com/',
    title: 'Example',
    description: null,
    imageUrl: null,
    siteName: 'Example Site',
    faviconUrl: 'https://example.com/favicon.ico',
  }],
};

describe('postToStatus', () => {
  it('converts a local post into a local status', () => {
    const post = { ...basePost, type: 'local', userId: 'user-1', inReplyToUri: null } as unknown as PostWithAuthor;

    const status = postToStatus(post);

    expect(status.id).toBe('post-1');
    expect(status.created_at).toBe('2026-01-02T03:04:05.000Z');
    expect(isLocalAccount(status.account)).toBe(true);
    expect(status.account.id).toBe('actor-1');
    expect(status.favourited).toBe(true);
    expect(status.reblogged).toBe(false);
    expect(status.favourites_count).toBe(3);
    expect(status.reblogs_count).toBe(2);
    expect(status.in_reply_to_id).toBeNull();
    expect(status.reblog).toBeNull();
    expect(status.media_attachments).toMatchObject([{
      type: 'image',
      url: 'https://iori.example/a.png',
      description: 'alt',
    }]);
    expect(status.iori?.reactions).toEqual([{ emoji: '👍', count: 1, url: null, me: false }]);
    expect(status.iori?.link_previews).toEqual([
      {
        url: 'https://example.com/',
        title: 'Example',
        description: null,
        image: null,
        site_name: 'Example Site',
        favicon: 'https://example.com/favicon.ico',
      },
    ]);
  });

  it('decides the media attachment type from mediaType, or from the url extension when mediaType is null', () => {
    const post = {
      ...basePost,
      type: 'remote',
      userId: undefined,
      inReplyToUri: null,
      images: [
        { url: 'https://remote.example/1.mp4', altText: 'v', mediaType: 'video/mp4' },
        { url: 'https://remote.example/2.mp3', altText: null, mediaType: 'audio/mpeg' },
        { url: 'https://remote.example/3.png', altText: null, mediaType: 'image/png' },
        { url: 'https://remote.example/4.webm', altText: null, mediaType: null },
        { url: 'https://remote.example/5.png', altText: null },
      ],
    } as unknown as PostWithAuthor;

    const status = postToStatus(post);

    expect(status.media_attachments.map((attachment) => [attachment.type, attachment.preview_url])).toEqual([
      ['video', null],
      ['audio', null],
      ['image', 'https://remote.example/3.png'],
      ['video', null],
      ['image', 'https://remote.example/5.png'],
    ]);
  });

  it('converts a remote post into a remote status that keeps the post uri', () => {
    const post = {
      ...basePost,
      type: 'remote',
      uri: 'https://remote.example/notes/1',
      inReplyToUri: 'https://remote.example/notes/0',
    } as unknown as PostWithAuthor;

    const status = postToStatus(post);

    expect(isLocalAccount(status.account)).toBe(false);
    expect(status.account.acct).toBe('kosui@remote.example');
    expect(status.uri).toBe('https://remote.example/notes/1');
    expect(status.in_reply_to_id).not.toBeNull();
  });
});

describe('postToStatus の visibility', () => {
  it.each(['public', 'unlisted', 'private'] as const)('ローカルの投稿の visibility %s をそのまま返す', (visibility) => {
    const post = {
      ...basePost,
      type: 'local',
      userId: 'user-1',
      inReplyToUri: null,
      visibility,
    } as unknown as PostWithAuthor;

    expect(postToStatus(post).visibility).toBe(visibility);
  });
});

describe('actorToAccount', () => {
  it('converts a local actor into a local account', () => {
    const actor = {
      type: 'local',
      id: 'actor-1',
      uri: 'https://iori.example/users/kosui',
      logoUri: 'https://iori.example/a.png',
    } as unknown as Actor;

    const account = actorToAccount(actor);

    expect(account.username).toBe('kosui');
    expect(isLocalAccount(account)).toBe(true);
    expect(account.avatar).toBe('https://iori.example/a.png');
  });

  it('converts a remote actor into a remote account with the host', () => {
    const actor = {
      type: 'remote',
      id: 'actor-2',
      uri: 'https://remote.example/users/alice',
      url: 'https://remote.example/@alice',
      username: 'alice',
    } as unknown as Actor;

    const account = actorToAccount(actor);

    expect(account.acct).toBe('alice@remote.example');
    expect(isLocalAccount(account)).toBe(false);
    expect(account.avatar).toBe('');
  });
});
