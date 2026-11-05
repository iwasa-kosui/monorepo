import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import type { Status } from '../../adaptor/mastodon/entities.ts';
import type { PostWithAuthor } from '../../domain/post/post.ts';
import { postToStatus } from '../legacyConversion.ts';
import { PostView } from './PostView.tsx';

const base = postToStatus({
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
  images: [{ imageId: 'image-1', url: 'https://remote.example/media/1.png', altText: null }],
  likeCount: 0,
  repostCount: 0,
  reactions: [],
  linkPreviews: [],
} as unknown as PostWithAuthor);

const render = (status: Status): string => String(jsx(PostView, { status }));

describe('PostView の content warning', () => {
  it('summary も sensitive もなければ、本文と画像をそのまま出す', () => {
    const html = render(base);

    expect(html).toContain('本文です');
    expect(html).toContain('https://remote.example/media/1.png');
    expect(html).not.toContain('もっと見る');
    expect(html).not.toContain('表示する');
  });

  it('spoiler_text があれば、文字列として出し、本文と画像を「もっと見る」まで隠す', () => {
    const html = render({ ...base, spoiler_text: 'ネタバレ注意', sensitive: true });

    expect(html).toContain('ネタバレ注意');
    expect(html).toContain('もっと見る');
    expect(html).not.toContain('本文です');
    expect(html).not.toContain('https://remote.example/media/1.png');
  });

  it('spoiler_text は HTML として描画しない', () => {
    const html = render({ ...base, spoiler_text: '<b>bold</b>' });

    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;');
    expect(html).not.toContain('<b>bold</b>');
  });

  it('spoiler_text が空で sensitive が true なら、画像だけを隠して本文は出す', () => {
    const html = render({ ...base, sensitive: true });

    expect(html).toContain('本文です');
    expect(html).toContain('表示する');
    expect(html).not.toContain('もっと見る');
    expect(html).not.toContain('https://remote.example/media/1.png');
  });
});
