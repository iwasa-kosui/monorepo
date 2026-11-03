import { Article as FedifyArticle, type RequestContext } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { ActorId } from '../../domain/actor/actorId.ts';
import type { Article, ArticleResolver, ArticleStatus } from '../../domain/article/article.ts';
import { ArticleId } from '../../domain/article/articleId.ts';
import type { ArticleBodyResolver } from '../../domain/articleBody/articleBody.ts';
import { Instant } from '../../domain/instant/instant.ts';
import type { PostResolver, ThreadResolver } from '../../domain/post/post.ts';
import { PostId } from '../../domain/post/postId.ts';
import { UserId } from '../../domain/user/userId.ts';
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

  const createBodyDispatcher = (article: Article, publicHtml: string) => {
    const resolveThread = vi.fn(async () => RA.ok({ currentPost: null, ancestors: [], descendants: [] }));
    const dispatcher = createObjectDispatcher({
      origin: 'https://example.com',
      postResolver: {} as PostResolver,
      postImagesResolver: {} as never,
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
