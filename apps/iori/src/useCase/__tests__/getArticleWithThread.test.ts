import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { ActorId } from '../../domain/actor/actorId.ts';
import type { Article, ArticleResolver, ArticleStatus } from '../../domain/article/article.ts';
import { ArticleId } from '../../domain/article/articleId.ts';
import type { ArticleBody, ArticleBodyResolver } from '../../domain/articleBody/articleBody.ts';
import { Instant } from '../../domain/instant/instant.ts';
import type { ThreadResolver } from '../../domain/post/post.ts';
import { PostId } from '../../domain/post/postId.ts';
import { UserId } from '../../domain/user/userId.ts';
import { GetArticleWithThreadUseCase } from '../getArticleWithThread.ts';

const createArticle = (status: ArticleStatus, authorUserId: UserId): Article => ({
  articleId: ArticleId.generate(),
  authorActorId: ActorId.generate(),
  authorUserId,
  rootPostId: PostId.generate(),
  title: 'Article',
  status,
  createdAt: Instant.orThrow(Date.parse('2026-08-05T00:00:00.000Z')),
  publishedAt: status === 'draft' ? null : Instant.orThrow(Date.parse('2026-08-06T00:00:00.000Z')),
  unpublishedAt: status === 'unpublished' ? Instant.orThrow(Date.parse('2026-08-07T00:00:00.000Z')) : null,
});

const createDeps = (article: Article | undefined) => {
  const articleResolver: ArticleResolver = {
    resolve: vi.fn(async (articleId: ArticleId) =>
      RA.ok(article?.articleId === articleId ? article : undefined)
    ) as unknown as ArticleResolver['resolve'],
  };
  const resolveThread = vi.fn(async () => RA.ok({ currentPost: null, ancestors: [], descendants: [] }));
  const threadResolver: ThreadResolver = { resolve: resolveThread as unknown as ThreadResolver['resolve'] };
  return { articleResolver, threadResolver, resolveThread };
};

describe('GetArticleWithThreadUseCase', () => {
  const authorUserId = UserId.generate();
  const otherUserId = UserId.generate();

  describe('published の記事', () => {
    it('匿名でも取得できる', async () => {
      const article = createArticle('published', authorUserId);
      const deps = createDeps(article);

      const result = await GetArticleWithThreadUseCase.create(deps).run({ articleId: article.articleId });

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.val.article).toEqual(article);
    });

    it('作者以外のユーザーでも取得できる', async () => {
      const article = createArticle('published', authorUserId);
      const deps = createDeps(article);

      const result = await GetArticleWithThreadUseCase.create(deps).run({
        articleId: article.articleId,
        viewerUserId: otherUserId,
      });

      expect(result.ok).toBe(true);
    });
  });

  describe.each(['draft', 'unpublished'] as const)('%s の記事', (status) => {
    it('作者は取得できる', async () => {
      const article = createArticle(status, authorUserId);
      const deps = createDeps(article);

      const result = await GetArticleWithThreadUseCase.create(deps).run({
        articleId: article.articleId,
        viewerUserId: authorUserId,
      });

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.val.article).toEqual(article);
      expect(deps.resolveThread).toHaveBeenCalledTimes(1);
    });

    it('作者以外のユーザーには ArticleNotFoundError を返し、thread を取得しない', async () => {
      const article = createArticle(status, authorUserId);
      const deps = createDeps(article);

      const result = await GetArticleWithThreadUseCase.create(deps).run({
        articleId: article.articleId,
        viewerUserId: otherUserId,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.err.type).toBe('ArticleNotFoundError');
      expect(deps.resolveThread).not.toHaveBeenCalled();
    });

    it('匿名には ArticleNotFoundError を返し、thread を取得しない', async () => {
      const article = createArticle(status, authorUserId);
      const deps = createDeps(article);

      const result = await GetArticleWithThreadUseCase.create(deps).run({ articleId: article.articleId });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.err.type).toBe('ArticleNotFoundError');
      expect(deps.resolveThread).not.toHaveBeenCalled();
    });
  });

  it('存在しない記事には ArticleNotFoundError を返す', async () => {
    const deps = createDeps(undefined);

    const result = await GetArticleWithThreadUseCase.create(deps).run({ articleId: ArticleId.generate() });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.err.type).toBe('ArticleNotFoundError');
    expect(deps.resolveThread).not.toHaveBeenCalled();
  });

  describe('本文を持つ article', () => {
    const createBodyArticle = (status: ArticleStatus): Article => ({
      ...createArticle(status, authorUserId),
      rootPostId: null,
    });
    const createBody = (article: Article): ArticleBody => ({
      articleId: article.articleId,
      privateHtml: '<p>private</p>',
      publicHtml: '<p>public</p>',
      updatedAt: Instant.orThrow(Date.parse('2026-08-05T00:00:00.000Z')),
    });
    const createBodyDeps = (article: Article, body: ArticleBody | undefined) => {
      const resolveBody = vi.fn(async () => RA.ok(body));
      const articleBodyResolver: ArticleBodyResolver = {
        resolve: resolveBody as unknown as ArticleBodyResolver['resolve'],
      };
      return { ...createDeps(article), articleBodyResolver, resolveBody };
    };

    it('作者は draft の private_html を取得し、thread を取得しない', async () => {
      const article = createBodyArticle('draft');
      const deps = createBodyDeps(article, createBody(article));

      const result = await GetArticleWithThreadUseCase.create(deps).run({
        articleId: article.articleId,
        viewerUserId: authorUserId,
      });

      expect(result).toMatchObject({ ok: true, val: { article, thread: [], body: { html: '<p>private</p>' } } });
      expect(deps.resolveThread).not.toHaveBeenCalled();
    });

    it('作者は unpublished の private_html を取得する', async () => {
      const article = createBodyArticle('unpublished');
      const deps = createBodyDeps(article, createBody(article));

      const result = await GetArticleWithThreadUseCase.create(deps).run({
        articleId: article.articleId,
        viewerUserId: authorUserId,
      });

      expect(result).toMatchObject({ ok: true, val: { body: { html: '<p>private</p>' } } });
    });

    it('匿名は published の public_html を取得する', async () => {
      const article = createBodyArticle('published');
      const deps = createBodyDeps(article, createBody(article));

      const result = await GetArticleWithThreadUseCase.create(deps).run({ articleId: article.articleId });

      expect(result).toMatchObject({ ok: true, val: { thread: [], body: { html: '<p>public</p>' } } });
    });

    it('作者も published では public_html を取得する', async () => {
      const article = createBodyArticle('published');
      const deps = createBodyDeps(article, createBody(article));

      const result = await GetArticleWithThreadUseCase.create(deps).run({
        articleId: article.articleId,
        viewerUserId: authorUserId,
      });

      expect(result).toMatchObject({ ok: true, val: { body: { html: '<p>public</p>' } } });
    });

    it('匿名の draft には ArticleNotFoundError を返し、本文を取得しない', async () => {
      const article = createBodyArticle('draft');
      const deps = createBodyDeps(article, createBody(article));

      const result = await GetArticleWithThreadUseCase.create(deps).run({ articleId: article.articleId });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.err.type).toBe('ArticleNotFoundError');
      expect(deps.resolveBody).not.toHaveBeenCalled();
    });

    it('本文が無ければ ArticleNotFoundError を返す', async () => {
      const article = createBodyArticle('published');
      const deps = createBodyDeps(article, undefined);

      const result = await GetArticleWithThreadUseCase.create(deps).run({ articleId: article.articleId });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.err.type).toBe('ArticleNotFoundError');
    });

    it('articleBodyResolver が無ければ ArticleNotFoundError を返す', async () => {
      const article = createBodyArticle('published');
      const deps = createDeps(article);

      const result = await GetArticleWithThreadUseCase.create(deps).run({ articleId: article.articleId });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.err.type).toBe('ArticleNotFoundError');
      expect(deps.resolveThread).not.toHaveBeenCalled();
    });

    it('rootPostId がある article は従来どおり thread を返し、body を返さない', async () => {
      const article = createArticle('published', authorUserId);
      const deps = createBodyDeps(article, createBody(article));

      const result = await GetArticleWithThreadUseCase.create(deps).run({ articleId: article.articleId });

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.val.body).toBeUndefined();
      expect(deps.resolveThread).toHaveBeenCalledTimes(1);
      expect(deps.resolveBody).not.toHaveBeenCalled();
    });
  });
});
