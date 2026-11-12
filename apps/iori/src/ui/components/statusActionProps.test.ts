import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import type { Status } from '../../adaptor/mastodon/entities.ts';
import { PostView } from './PostView.tsx';
import { statusActionProps, type StatusActions } from './statusActionProps.ts';

const status = (id: string, overrides: Partial<Status> = {}): Status =>
  ({
    id,
    uri: `https://remote.example/notes/${id}`,
    url: `https://remote.example/notes/${id}`,
    created_at: '2026-01-02T03:04:05.000Z',
    edited_at: null,
    in_reply_to_id: null,
    account: {
      id: 'a1',
      username: 'alice',
      acct: 'alice@remote.example',
      display_name: 'alice',
      avatar: '',
      emojis: [],
    },
    content: '<p>本文です</p>',
    spoiler_text: '',
    sensitive: false,
    visibility: 'public',
    media_attachments: [],
    emojis: [],
    reblog: null,
    reblogged: false,
    favourited: false,
    bookmarked: false,
    favourites_count: 0,
    reblogs_count: 0,
    replies_count: 0,
    poll: null,
    card: null,
    ...overrides,
  }) as unknown as Status;

const actions = (overrides: Partial<StatusActions['actionState']> = {}): StatusActions => ({
  like: async () => {},
  undoLike: async () => {},
  bookmarkPost: async () => {},
  undoBookmarkPost: async () => {},
  repost: async () => {},
  undoRepost: async () => {},
  vote: async () => {},
  actionState: {
    likingPostId: null,
    undoingLikePostId: null,
    repostingPostId: null,
    undoingRepostPostId: null,
    ...overrides,
  },
});

describe('statusActionProps', () => {
  it('操作が渡されなければ何も渡さない', () => {
    expect(statusActionProps(undefined, status('p1'))).toEqual({});
  });

  it('いいね・いいね取り消し・リポスト・リポスト取り消し・ブックマーク・ブックマーク解除・投票を渡す', () => {
    const all = actions();
    const props = statusActionProps(all, status('p1'));

    expect(props.onLike).toBe(all.like);
    expect(props.onUndoLike).toBe(all.undoLike);
    expect(props.onRepost).toBe(all.repost);
    expect(props.onUndoRepost).toBe(all.undoRepost);
    expect(props.onBookmark).toBe(all.bookmarkPost);
    expect(props.onUndoBookmark).toBe(all.undoBookmarkPost);
    expect(props.onVote).toBe(all.vote);
  });

  it('送信中の状態は、その投稿の id と一致するときだけ true にする', () => {
    const props = statusActionProps(
      actions({ likingPostId: 'p1', undoingLikePostId: 'p2', repostingPostId: 'p3', undoingRepostPostId: 'p4' }),
      status('p1'),
    );

    expect(props).toMatchObject({
      isLiking: true,
      isUndoingLike: false,
      isReposting: false,
      isUndoingRepost: false,
    });
  });

  it('リポストの投稿は、リポストされた元の投稿の id で送信中かを判定する', () => {
    const boost = status('boost-1', { reblog: status('p1') });

    expect(statusActionProps(actions({ repostingPostId: 'p1' }), boost).isReposting).toBe(true);
    expect(statusActionProps(actions({ repostingPostId: 'boost-1' }), boost).isReposting).toBe(false);
  });

  it('PostView に渡すと、いいねとリポストの送信中の表示になる', () => {
    const post = status('p1');
    const html = String(jsx(PostView, { status: post, ...statusActionProps(actions({ likingPostId: 'p1' }), post) }));

    expect(html).toContain('いいね中...');
    expect(html).not.toContain('リポスト中...');
  });
});
