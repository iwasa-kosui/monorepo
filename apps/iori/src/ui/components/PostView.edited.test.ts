import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import type { Status } from '../../adaptor/mastodon/entities.ts';
import type { PostWithAuthor } from '../../domain/post/post.ts';
import { postToStatus } from '../legacyConversion.ts';
import { PostView } from './PostView.tsx';

const source = {
  postId: 'post-1',
  actorId: 'actor-1',
  userId: 'user-1',
  username: 'alice',
  content: '<p>本文です</p>',
  createdAt: Date.parse('2026-01-02T03:04:05.000Z'),
  logoUri: undefined,
  liked: false,
  reposted: false,
  inReplyToUri: null,
  summary: null,
  sensitive: false,
  images: [],
  likeCount: 0,
  repostCount: 0,
  reactions: [],
  linkPreviews: [],
};

const local = postToStatus({ ...source, type: 'local' } as unknown as PostWithAuthor);
const remote = postToStatus({
  ...source,
  type: 'remote',
  uri: 'https://remote.example/notes/1',
} as unknown as PostWithAuthor);

const render = (status: Status): string => String(jsx(PostView, { status }));

describe('PostView の編集済みの表示', () => {
  it('edited_at が null なら「編集済み」を出さない', () => {
    expect(render({ ...local, edited_at: null })).not.toContain('編集済み');
  });

  it('edited_at があれば、投稿日時の後ろに「編集済み」を出す', () => {
    const html = render({ ...local, edited_at: '2026-01-03T00:00:00.000Z' });

    expect(html).toContain('編集済み');
    expect(html.indexOf('</time>')).toBeLessThan(html.indexOf('編集済み'));
  });

  it('リモートの投稿でも、edited_at があれば「編集済み」を出す', () => {
    expect(render({ ...remote, edited_at: '2026-01-03T00:00:00.000Z' })).toContain('編集済み');
    expect(render({ ...remote, edited_at: null })).not.toContain('編集済み');
  });

  it('リポストは中身の投稿の edited_at を見る', () => {
    const boost = { ...local, id: 'boost-1', reblog: { ...remote, edited_at: '2026-01-03T00:00:00.000Z' } };

    expect(render(boost)).toContain('編集済み');
    expect(render({ ...boost, edited_at: '2026-01-03T00:00:00.000Z', reblog: remote })).not.toContain('編集済み');
  });
});
