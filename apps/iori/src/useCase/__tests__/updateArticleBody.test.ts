import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { ActorId } from '../../domain/actor/actorId.ts';
import type { Article, ArticleResolver, ArticleStatus } from '../../domain/article/article.ts';
import { ArticleId } from '../../domain/article/articleId.ts';
import type { ArticleBodyWritten, ArticleBodyWrittenStore } from '../../domain/articleBody/articleBody.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { PostId } from '../../domain/post/postId.ts';
import { UserId } from '../../domain/user/userId.ts';
import { UpdateArticleBodyUseCase } from '../updateArticleBody.ts';

const createArticle = (rootPostId: PostId | null, status: ArticleStatus = 'draft'): Article => ({
  articleId: ArticleId.generate(),
  authorActorId: ActorId.generate(),
  authorUserId: UserId.generate(),
  rootPostId,
  title: 'Article',
  status,
  createdAt: Instant.orThrow(Date.parse('2026-08-05T00:00:00.000Z')),
  publishedAt: null,
  unpublishedAt: null,
});

const createDeps = (article: Article | undefined) => {
  const events: ArticleBodyWritten[] = [];
  const articleResolver: ArticleResolver = {
    resolve: vi.fn(async (articleId: ArticleId) =>
      RA.ok(article?.articleId === articleId ? article : undefined)
    ) as unknown as ArticleResolver['resolve'],
  };
  const articleBodyWrittenStore: ArticleBodyWrittenStore = {
    store: vi.fn(async (...written) => {
      events.push(...written);
      return RA.ok(undefined);
    }),
  };
  return { articleResolver, articleBodyWrittenStore, events };
};

describe('UpdateArticleBodyUseCase', () => {
  it('rootPostId が null の article の本文をサニタイズして更新する', async () => {
    const article = createArticle(null);
    const deps = createDeps(article);

    const result = await UpdateArticleBodyUseCase.create(deps).run({
      articleId: article.articleId,
      privateHtml: '<p>private</p><script>alert(1)</script>',
      publicHtml: '<p>public</p>',
    });

    expect(result.ok).toBe(true);
    expect(deps.events).toHaveLength(1);
    expect(deps.events[0]?.eventName).toBe('articleBody.written');
    expect(deps.events[0]?.aggregateState).toMatchObject({
      articleId: article.articleId,
      privateHtml: '<p>private</p>',
      publicHtml: '<p>public</p>',
    });
  });

  it('rootPostId がある article には ArticleNotFoundError を返し、更新しない', async () => {
    const article = createArticle(PostId.generate());
    const deps = createDeps(article);

    const result = await UpdateArticleBodyUseCase.create(deps).run({
      articleId: article.articleId,
      privateHtml: '<p>a</p>',
      publicHtml: '<p>b</p>',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.err.type).toBe('ArticleNotFoundError');
    expect(deps.events).toEqual([]);
  });

  it('published の article には ArticleInvalidStatusError を返し、更新しない', async () => {
    const article = createArticle(null, 'published');
    const deps = createDeps(article);

    const result = await UpdateArticleBodyUseCase.create(deps).run({
      articleId: article.articleId,
      privateHtml: '<p>a</p>',
      publicHtml: '<p>b</p>',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.err.type).toBe('ArticleInvalidStatusError');
    expect(deps.events).toEqual([]);
  });

  it.each(['draft', 'unpublished'] as const)('%s の article の本文は更新できる', async (status) => {
    const article = createArticle(null, status);
    const deps = createDeps(article);

    const result = await UpdateArticleBodyUseCase.create(deps).run({
      articleId: article.articleId,
      privateHtml: '<p>a</p>',
      publicHtml: '<p>b</p>',
    });

    expect(result.ok).toBe(true);
    expect(deps.events).toHaveLength(1);
  });
});
