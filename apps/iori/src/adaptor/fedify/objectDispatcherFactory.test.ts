import { Article as FedifyArticle, Note, type RequestContext } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { ActorId } from '../../domain/actor/actorId.ts';
import type { Article, ArticleResolver, ArticleStatus } from '../../domain/article/article.ts';
import { ArticleId } from '../../domain/article/articleId.ts';
import type { ArticleBodyResolver } from '../../domain/articleBody/articleBody.ts';
import { Instant } from '../../domain/instant/instant.ts';
import type { LocalPost, Post, PostResolver, RemotePost, ThreadResolver } from '../../domain/post/post.ts';
import { PostId } from '../../domain/post/postId.ts';
import type { Visibility } from '../../domain/post/visibility.ts';
import type { User } from '../../domain/user/user.ts';
import { UserId } from '../../domain/user/userId.ts';
import { Username } from '../../domain/user/username.ts';
import { createObjectDispatcher } from './objectDispatcherFactory.ts';

const createArticle = (status: ArticleStatus): Article => ({
  articleId: ArticleId.generate(),
  authorActorId: ActorId.generate(),
  authorUserId: UserId.generate(),
  rootPostId: PostId.generate(),
  title: 'Article',
  status,
  createdAt: Instant.orThrow(Date.parse('2026-08-05T00:00:00.000Z')),
  publishedAt: status === 'draft' ? null : Instant.orThrow(Date.parse('2026-08-06T00:00:00.000Z')),
  unpublishedAt: status === 'unpublished' ? Instant.orThrow(Date.parse('2026-08-07T00:00:00.000Z')) : null,
});

const createContext = () =>
  ({
    getObjectUri: (_type: unknown, values: { identifier: string; id: string }) =>
      new URL(`https://example.com/users/${values.identifier}/articles/${values.id}`),
    getActorUri: (identifier: string) => new URL(`https://example.com/users/${identifier}`),
    getFollowersUri: (identifier: string) => new URL(`https://example.com/users/${identifier}/followers`),
  }) as unknown as RequestContext<unknown>;

const createDispatcher = (article: Article) =>
  createObjectDispatcher({
    origin: 'https://example.com',
    postResolver: {} as PostResolver,
    postImagesResolver: {} as never,
    userResolverByUsername: {} as never,
    articleResolver: { resolve: vi.fn(async () => RA.ok(article)) } as unknown as ArticleResolver,
    threadResolver: {
      resolve: vi.fn(async () => RA.ok({ currentPost: null, ancestors: [], descendants: [] })),
    } as unknown as ThreadResolver,
    articleBodyResolver: { resolve: vi.fn(async () => RA.ok(undefined)) } as unknown as ArticleBodyResolver,
  });

describe('createObjectDispatcher ofArticle', () => {
  it('published の記事は Article を返す', async () => {
    const article = createArticle('published');

    const result = await createDispatcher(article).ofArticle(createContext(), {
      id: article.articleId,
      identifier: 'kosui',
    });

    expect(result).toBeInstanceOf(FedifyArticle);
  });

  it.each(['draft', 'unpublished'] as const)('%s の記事は null を返す', async (status) => {
    const article = createArticle(status);

    const result = await createDispatcher(article).ofArticle(createContext(), {
      id: article.articleId,
      identifier: 'kosui',
    });

    expect(result).toBeNull();
  });

  it('UUID でない id の記事は null を返す', async () => {
    const result = await createDispatcher(createArticle('published')).ofArticle(createContext(), {
      id: 'abc',
      identifier: 'kosui',
    });

    expect(result).toBeNull();
  });

  const createBodyDispatcher = (article: Article, publicHtml: string) => {
    const resolveThread = vi.fn(async () => RA.ok({ currentPost: null, ancestors: [], descendants: [] }));
    const dispatcher = createObjectDispatcher({
      origin: 'https://example.com',
      postResolver: {} as PostResolver,
      postImagesResolver: {} as never,
      userResolverByUsername: {} as never,
      articleResolver: { resolve: vi.fn(async () => RA.ok(article)) } as unknown as ArticleResolver,
      threadResolver: { resolve: resolveThread } as unknown as ThreadResolver,
      articleBodyResolver: {
        resolve: vi.fn(async () =>
          RA.ok({
            articleId: article.articleId,
            privateHtml: '<p>private</p>',
            publicHtml,
            updatedAt: article.createdAt,
          })
        ),
      } as unknown as ArticleBodyResolver,
    });
    return { dispatcher, resolveThread };
  };

  it('本文を持つ published の記事は content に public_html を使う', async () => {
    const article = { ...createArticle('published'), rootPostId: null };
    const { dispatcher, resolveThread } = createBodyDispatcher(article, '<p>public</p>');

    const result = await dispatcher.ofArticle(createContext(), { id: article.articleId, identifier: 'kosui' });

    expect(result).toBeInstanceOf(FedifyArticle);
    expect((result as FedifyArticle).content?.toString()).toBe('<p>public</p>');
    expect(resolveThread).not.toHaveBeenCalled();
  });

  it('本文の content はサニタイズして出力する', async () => {
    const article = { ...createArticle('published'), rootPostId: null };
    const { dispatcher } = createBodyDispatcher(
      article,
      '<p>public</p><script>alert(1)</script><a href="javascript:alert(1)">link</a><span class="x">s</span>',
    );

    const result = await dispatcher.ofArticle(createContext(), { id: article.articleId, identifier: 'kosui' });

    expect((result as FedifyArticle).content?.toString()).toBe(
      '<p>public</p><a rel="noopener noreferrer nofollow">link</a><span>s</span>',
    );
  });
});

const author: User = { id: UserId.generate(), username: Username.orThrow('kosui') };

const createLocalPost = (): LocalPost => ({
  type: 'local',
  postId: PostId.generate(),
  actorId: ActorId.generate(),
  content: 'hello',
  createdAt: Instant.orThrow(Date.parse('2026-08-05T00:00:00.000Z')),
  userId: author.id,
  inReplyToUri: null,
});

const createRemotePost = (visibility: Visibility | null): RemotePost => ({
  type: 'remote',
  postId: PostId.generate(),
  actorId: ActorId.generate(),
  content: 'hello',
  createdAt: Instant.orThrow(Date.parse('2026-08-05T00:00:00.000Z')),
  uri: 'https://remote.example/notes/1',
  inReplyToUri: null,
  visibility,
});

const createNoteDispatcher = (post: Post | undefined, users: readonly User[] = [author]) =>
  createObjectDispatcher({
    origin: 'https://example.com',
    postResolver: { resolve: vi.fn(async () => RA.ok(post)) } as unknown as PostResolver,
    postImagesResolver: { resolve: vi.fn(async () => RA.ok([])) } as never,
    userResolverByUsername: {
      resolve: vi.fn(async (username: string) => RA.ok(users.find((user) => user.username === username))),
    } as never,
    articleBodyResolver: { resolve: vi.fn(async () => RA.ok(undefined)) } as unknown as ArticleBodyResolver,
  });

describe('createObjectDispatcher ofNote', () => {
  it('ローカルの公開投稿は、作者の identifier なら Note を返す', async () => {
    const post = createLocalPost();

    const result = await createNoteDispatcher(post).ofNote(createContext(), { id: post.postId, identifier: 'kosui' });

    expect(result).toBeInstanceOf(Note);
  });

  it.each([null, 'public', 'unlisted', 'private', 'direct'] as const)(
    'リモートの投稿（visibility: %s）は null を返す',
    async (visibility) => {
      const post = createRemotePost(visibility);

      const result = await createNoteDispatcher(post).ofNote(createContext(), {
        id: post.postId,
        identifier: 'kosui',
      });

      expect(result).toBeNull();
    },
  );

  it('作者と別のユーザーの identifier なら null を返す', async () => {
    const post = createLocalPost();
    const other: User = { id: UserId.generate(), username: Username.orThrow('someone') };

    const result = await createNoteDispatcher(post, [author, other]).ofNote(createContext(), {
      id: post.postId,
      identifier: 'someone',
    });

    expect(result).toBeNull();
  });

  it('存在しないユーザーの identifier なら null を返す', async () => {
    const post = createLocalPost();

    const result = await createNoteDispatcher(post).ofNote(createContext(), { id: post.postId, identifier: 'nobody' });

    expect(result).toBeNull();
  });

  it('identifier の大文字小文字が作者のユーザー名と違えば null を返す', async () => {
    const post = createLocalPost();

    const result = await createNoteDispatcher(post).ofNote(createContext(), { id: post.postId, identifier: 'Kosui' });

    expect(result).toBeNull();
  });

  it('存在しない投稿と削除済みの投稿（resolver が undefined を返す）は null を返す', async () => {
    const result = await createNoteDispatcher(undefined).ofNote(createContext(), {
      id: PostId.generate(),
      identifier: 'kosui',
    });

    expect(result).toBeNull();
  });

  it('UUID でない id の投稿は null を返す', async () => {
    const result = await createNoteDispatcher(createLocalPost()).ofNote(createContext(), {
      id: 'abc',
      identifier: 'kosui',
    });

    expect(result).toBeNull();
  });
});
