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
  summary: null,
  sensitive: false,
  images: [],
  likeCount: 0,
  repostCount: 0,
  reactions: [],
  linkPreviews: [],
} as unknown as PostWithAuthor);

const noop = () => {};

const render = (props: Partial<Parameters<typeof PostView>[0]> = {}, status: Status = base): string =>
  String(jsx(PostView, { status, ...props }));

describe('PostView のいいねボタン', () => {
  it('onLike も onUndoLike も渡さなければ出さない', () => {
    const html = render({}, { ...base, favourites_count: 3 });

    expect(html).not.toContain('title="いいね"');
    expect(html).not.toContain('title="いいねを取り消す"');
  });

  it('onLike を渡せば出す', () => {
    expect(render({ onLike: noop })).toContain('title="いいね"');
  });

  it('onUndoLike だけ渡しても出す', () => {
    expect(render({ onUndoLike: noop }, { ...base, favourited: true })).toContain('title="いいねを取り消す"');
  });

  it('出さないときはいいね数も出さない', () => {
    const hidden = render({}, { ...base, favourites_count: 7 });
    const shown = render({ onLike: noop }, { ...base, favourites_count: 7 });

    expect(hidden).not.toContain('>7<');
    expect(shown).toContain('>7<');
  });
});

describe('PostView のリポストボタン', () => {
  it('onRepost も onUndoRepost も渡さなければ出さない', () => {
    const html = render({}, { ...base, reblogs_count: 3 });

    expect(html).not.toContain('title="リポスト"');
    expect(html).not.toContain('title="リポストを取り消す"');
  });

  it('onRepost を渡せば出す', () => {
    expect(render({ onRepost: noop })).toContain('title="リポスト"');
  });

  it('onUndoRepost だけ渡しても出す', () => {
    expect(render({ onUndoRepost: noop }, { ...base, reblogged: true })).toContain('title="リポストを取り消す"');
  });

  it('出さないときはリポスト数も出さない', () => {
    const hidden = render({}, { ...base, reblogs_count: 7 });
    const shown = render({ onRepost: noop }, { ...base, reblogs_count: 7 });

    expect(hidden).not.toContain('>7<');
    expect(shown).toContain('>7<');
  });
});
