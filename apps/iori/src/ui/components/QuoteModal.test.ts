import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import type { PostWithAuthor } from '../../domain/post/post.ts';
import { postToStatus } from '../legacyConversion.ts';
import { QuoteModal } from './QuoteModal.tsx';

const target = postToStatus({
  postId: 'post-1',
  actorId: 'actor-1',
  userId: 'user-1',
  username: 'alice',
  content: '<p>引用される本文</p>',
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
  type: 'remote',
  uri: 'https://remote.example/notes/1',
} as unknown as PostWithAuthor);

const render = (props: Partial<Parameters<typeof QuoteModal>[0]> = {}): string =>
  String(jsx(QuoteModal, {
    target,
    content: '',
    destination: 'fediverse',
    isSending: false,
    errorText: undefined,
    onClose: () => {},
    onSubmit: () => {},
    onContentChange: () => {},
    onDestinationChange: () => {},
    ...props,
  }));

describe('QuoteModal', () => {
  it('見出しを引用、ボタンを引用して投稿にし、返信の文言を出さない', () => {
    const html = render({ content: 'コメント' });

    expect(html).toMatch(/<h2[^>]*>引用<\/h2>/);
    expect(html).toMatch(/>引用して投稿<\/button>/);
    expect(html).not.toContain('返信');
  });

  it('引用する投稿の抜粋を出す', () => {
    expect(render()).toContain('引用される本文');
  });

  it('コメント欄の placeholder を出す', () => {
    expect(render()).toContain('引用にコメントを書く（⌘+Enter で送信）');
  });

  it('エラー文を alert として出す', () => {
    expect(render({ errorText: 'この投稿は引用できません' })).toMatch(
      /<p role="alert"[^>]*>この投稿は引用できません<\/p>/,
    );
  });

  it('エラーが無いときは alert を出さない', () => {
    expect(render()).not.toContain('role="alert"');
  });

  it('本文が空のときは送信のボタンを押せない', () => {
    expect(render({ content: '' })).toMatch(/<button[^>]*disabled[^>]*>引用して投稿<\/button>/);
    expect(render({ content: 'コメント' })).not.toMatch(/<button[^>]*disabled[^>]*>引用して投稿<\/button>/);
  });
});
