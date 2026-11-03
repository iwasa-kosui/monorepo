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
  content: '<p>hello</p>',
  createdAt: Date.parse('2026-01-02T03:04:05.000Z'),
  logoUri: undefined,
  liked: false,
  reposted: false,
  inReplyToUri: null,
  images: [],
  likeCount: 0,
  repostCount: 0,
  reactions: [],
  linkPreviews: [],
} as unknown as PostWithAuthor);

const render = (status: Status, isLoggedIn?: boolean): string => String(jsx(PostView, { status, isLoggedIn }));

describe('PostView の翻訳ボタン', () => {
  it('ログイン済みで、direct でなく、本文が日本語でも空でもなければ出す', () => {
    expect(render({ ...base, language: 'und', visibility: 'public' }, true)).toContain('翻訳');
  });

  it('ログインしていなければ出さない', () => {
    expect(render({ ...base, language: 'und' }, false)).not.toContain('翻訳');
    expect(render({ ...base, language: 'und' })).not.toContain('翻訳');
  });

  it('direct の投稿には出さない', () => {
    expect(render({ ...base, language: 'und', visibility: 'direct' }, true)).not.toContain('翻訳');
  });

  it('日本語の投稿と本文が空の投稿には出さない', () => {
    expect(render({ ...base, language: 'ja' }, true)).not.toContain('翻訳');
    expect(render({ ...base, language: null }, true)).not.toContain('翻訳');
  });

  it('ブーストされた投稿の言語で決める', () => {
    const boost: Status = { ...base, id: 'repost-1', language: null, reblog: { ...base, language: 'und' } };

    expect(render(boost, true)).toContain('翻訳');
  });

  it('訳文は押すまで出さない', () => {
    const html = render({ ...base, language: 'und' }, true);

    expect(html).not.toContain('Workers AI で翻訳');
    expect(html).not.toContain('原文のみ表示');
  });
});
