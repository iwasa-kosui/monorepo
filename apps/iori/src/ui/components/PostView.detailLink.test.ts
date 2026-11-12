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

const remote = postToStatus({
  ...source,
  type: 'remote',
  uri: 'https://remote.example/notes/1',
} as unknown as PostWithAuthor);
const local = postToStatus({ ...source, type: 'local' } as unknown as PostWithAuthor);

const timeLink = (status: Status, isLoggedIn?: boolean): string => {
  const html = String(jsx(PostView, { status, isLoggedIn }));
  const match = /<a [^>]*>\s*<time /.exec(html);
  if (match === null) throw new Error('time link not found');
  return match[0];
};

describe('PostView の時刻リンク', () => {
  it.each([true, false, undefined])(
    'リモート投稿は isLoggedIn=%s でも iori の詳細ページへ同じタブで飛ぶ',
    (isLoggedIn) => {
      const link = timeLink(remote, isLoggedIn);

      expect(link).toContain('href="/posts/post-1"');
      expect(link).not.toContain('target=');
      expect(link).not.toContain('remote.example');
    },
  );

  it.each([true, false, undefined])('ローカル投稿は isLoggedIn=%s でもユーザー配下の詳細ページへ飛ぶ', (isLoggedIn) => {
    const link = timeLink(local, isLoggedIn);

    expect(link).toContain('href="/users/alice/posts/post-1"');
    expect(link).not.toContain('target=');
  });

  it('ブーストされたリモート投稿は元の投稿の ID で詳細ページへ飛ぶ', () => {
    const boost: Status = { ...local, id: 'repost-1', reblog: remote };

    expect(timeLink(boost, true)).toContain('href="/posts/post-1"');
  });
});
