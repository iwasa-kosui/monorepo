import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { Post } from '../../domain/post/post.ts';
import type { PostId } from '../../domain/post/postId.ts';
import { type Interactor, PostInteractions } from '../../domain/postInteraction/postInteractions.ts';
import { GetPostInteractionsUseCase } from '../getPostInteractions.ts';

const postId = 'post-1' as PostId;

const actor = (acct: string): Interactor => ({
  actorId: null,
  isLocal: false,
  name: acct,
  acct,
  avatarUrl: null,
  url: null,
});

const remotePost = (overrides: Partial<Post> = {}) =>
  ({
    type: 'remote',
    postId,
    uri: 'https://remote.example/notes/1',
    url: null,
    visibility: 'public',
    ...overrides,
  }) as Post;

const stored: PostInteractions = { likes: [actor('me@iori.test')], reposts: [], reactions: [] };
const remote: PostInteractions = { likes: [actor('alice@remote.example')], reposts: [], reactions: [] };

const setup = (options: {
  post?: Post;
  fetch?: (signal: AbortSignal) => Promise<PostInteractions>;
  isBlockedUri?: (uri: string) => boolean;
  totalTimeoutMs?: number;
} = {}) => {
  const fetch = vi.fn((_post: unknown, signal: AbortSignal) => (options.fetch ?? (async () => remote))(signal));
  const useCase = GetPostInteractionsUseCase.create({
    postResolver: { resolve: async () => RA.ok('post' in options ? options.post : remotePost()) },
    storedPostInteractionsResolver: { resolve: async () => RA.ok(stored) },
    remotePostInteractionsFetcher: { fetch },
    isBlockedUri: options.isBlockedUri ?? (() => false),
    totalTimeoutMs: options.totalTimeoutMs,
  });
  return { fetch, run: () => useCase.run({ postId }) };
};

const acctsOf = (interactions: PostInteractions) => interactions.likes.map((like) => like.acct);

describe('GetPostInteractionsUseCase', () => {
  it('公開のリモート投稿では、手元の反応に相手のサーバーの反応を足して返す', async () => {
    const t = setup();

    const result = await t.run();

    expect(result.ok && acctsOf(result.val)).toEqual(['me@iori.test', 'alice@remote.example']);
  });

  it.each([
    ['ローカルの投稿', { post: { type: 'local', postId, visibility: 'public' } as Post }],
    ['フォロワー限定の投稿', { post: remotePost({ visibility: 'private' }) }],
    ['ブロックしたドメインの投稿', { isBlockedUri: () => true }],
  ])('%sでは相手のサーバーに問い合わせず、手元の反応だけを返す', async (_name, options) => {
    const t = setup(options);

    const result = await t.run();

    expect(result.ok && acctsOf(result.val)).toEqual(['me@iori.test']);
    expect(t.fetch).not.toHaveBeenCalled();
  });

  it('相手のサーバーからの取得が失敗しても、手元の反応は返す', async () => {
    const t = setup({ fetch: () => Promise.reject(new Error('boom')) });

    const result = await t.run();

    expect(result.ok && acctsOf(result.val)).toEqual(['me@iori.test']);
  });

  it('相手のサーバーが時間内に応えなければ、取得を打ち切って手元の反応だけを返す', async () => {
    let aborted = false;
    const t = setup({
      totalTimeoutMs: 10,
      fetch: (signal) =>
        new Promise(() => {
          signal.addEventListener('abort', () => {
            aborted = true;
          });
        }),
    });

    const result = await t.run();

    expect(result.ok && acctsOf(result.val)).toEqual(['me@iori.test']);
    expect(aborted).toBe(true);
  });

  it('投稿がなければ PostNotFoundError を返す', async () => {
    const t = setup({ post: undefined });

    expect(await t.run()).toMatchObject({ ok: false, err: { type: 'PostNotFoundError' } });
  });
});
