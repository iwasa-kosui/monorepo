import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import type { Status } from '../../adaptor/mastodon/entities.ts';
import type { PostWithAuthor } from '../../domain/post/post.ts';
import { postToStatus } from '../legacyConversion.ts';
import { PostView } from './PostView.tsx';

type Image = Readonly<{ url: string; altText: string | null; mediaType: string | null }>;

const statusWith = (images: readonly Image[], overrides: Partial<Status> = {}): Status => ({
  ...postToStatus({
    type: 'remote',
    postId: 'post-1',
    actorId: 'actor-1',
    userId: 'user-1',
    username: 'alice',
    uri: 'https://remote.example/notes/1',
    content: '<p>本文です</p>',
    createdAt: Date.parse('2026-01-02T03:04:05.000Z'),
    logoUri: undefined,
    liked: false,
    reposted: false,
    inReplyToUri: null,
    summary: null,
    sensitive: false,
    images: images.map((image, index) => ({ imageId: `image-${index}`, ...image })),
    likeCount: 0,
    repostCount: 0,
    reactions: [],
    linkPreviews: [],
  } as unknown as PostWithAuthor),
  ...overrides,
});

const render = (status: Status): string => String(jsx(PostView, { status }));

const video: Image = { url: 'https://remote.example/media/1.mp4', altText: '海の動画', mediaType: 'video/mp4' };
const audio: Image = { url: 'https://remote.example/media/1.mp3', altText: '曲の説明', mediaType: 'audio/mpeg' };
describe('PostView の動画と音声', () => {
  it('http と https 以外の URL の動画と音声は描画しない', () => {
    const html = render(
      statusWith([
        { ...video, url: 'javascript:alert(1)' },
        { ...audio, url: 'data:audio/mpeg;base64,AAAA' },
      ]),
    );

    expect(html).not.toContain('<video');
    expect(html).not.toContain('<audio');
  });

  it('sensitive の間は動画と音声を描画せず、「表示する」を出す', () => {
    const html = render(statusWith([video, audio], { sensitive: true }));

    expect(html).toContain('センシティブなメディアがあります');
    expect(html).toContain('表示する');
    expect(html).not.toContain('<video');
    expect(html).not.toContain('<audio');
    expect(html).not.toContain('https://remote.example/media/1.mp4');
  });
});
