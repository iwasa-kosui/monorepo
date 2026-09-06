import type { RequestContext } from '@fedify/fedify';
import { sValidator } from '@hono/standard-validator';
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { z } from 'zod/v4';

import type { PublishedArticlesWithAuthorResolver } from '../../domain/article/article.ts';
import type { Article } from '../../domain/article/article.ts';
import { ArticleId } from '../../domain/article/articleId.ts';
import { PostId } from '../../domain/post/postId.ts';
import { SessionId } from '../../domain/session/sessionId.ts';
import type { CreateArticleUseCase } from '../../useCase/createArticle.ts';
import type { DeleteArticleUseCase } from '../../useCase/deleteArticle.ts';
import type { GetArticlesUseCase } from '../../useCase/getArticles.ts';
import type { GetArticleWithThreadUseCase } from '../../useCase/getArticleWithThread.ts';
import type { PublishArticleUseCase } from '../../useCase/publishArticle.ts';
import type { UnpublishArticleUseCase } from '../../useCase/unpublishArticle.ts';
import { sanitize } from './helper/sanitize.ts';

export type WorkerArticlesApiRouterDeps = Readonly<{
  getArticleWithThreadUseCase: GetArticleWithThreadUseCase;
  getArticlesUseCase: GetArticlesUseCase;
  createArticleUseCase: CreateArticleUseCase;
  publishArticleUseCase: PublishArticleUseCase;
  unpublishArticleUseCase: UnpublishArticleUseCase;
  deleteArticleUseCase: DeleteArticleUseCase;
  publishedArticlesResolver: PublishedArticlesWithAuthorResolver;
  publishOgImage?: (article: Article) => Promise<void>;
  createContext: (request: Request) => RequestContext<unknown>;
}>;

export const createWorkerArticlesApiRouter = (deps: WorkerArticlesApiRouterDeps): Hono => {
  const app = new Hono();

  app.get('/v1/articles/:articleId', async (c) => {
    const articleId = ArticleId.parse(c.req.param('articleId'));
    if (!articleId.ok) return c.json({ error: 'Invalid article ID' }, 400);
    const result = await deps.getArticleWithThreadUseCase.run({ articleId: articleId.val });
    if (!result.ok) {
      return result.err.type === 'ArticleNotFoundError'
        ? c.json({ error: result.err.message }, 404)
        : c.json({ error: `Failed to get article: ${JSON.stringify(result.err)}` }, 400);
    }
    return c.json({
      article: result.val.article,
      thread: result.val.thread.map((post) => ({ ...post, content: sanitize(post.content) })),
    });
  });

  app.get('/v1/articles', async (c) => {
    const sessionCookie = getCookie(c, 'sessionId');
    if (sessionCookie === undefined) {
      const result = await deps.publishedArticlesResolver.resolve();
      return result.ok
        ? c.json({ articles: result.val.articles, authorUsername: result.val.authorUsername })
        : c.json({ error: 'Failed to get articles' }, 400);
    }
    const sessionId = SessionId.parse(sessionCookie);
    if (!sessionId.ok) return c.json({ error: 'Invalid session' }, 401);
    const result = await deps.getArticlesUseCase.run({ sessionId: sessionId.val });
    return result.ok
      ? c.json({ articles: result.val.articles, authorUsername: result.val.authorUsername })
      : c.json({ error: `Failed to get articles: ${JSON.stringify(result.err)}` }, 400);
  });

  app.post(
    '/v1/articles',
    sValidator('json', z.object({ rootPostId: PostId.zodType, title: z.string().min(1).max(200) })),
    async (c) => {
      const sessionId = SessionId.parse(getCookie(c, 'sessionId'));
      if (!sessionId.ok) return c.json({ error: 'Invalid session' }, 401);
      const result = await deps.createArticleUseCase.run({ sessionId: sessionId.val, ...c.req.valid('json') });
      if (result.ok) return c.json({ article: result.val.article });
      if (result.err.type === 'UnauthorizedError') return c.json({ error: result.err.message }, 403);
      if (result.err.type === 'PostNotFoundError') return c.json({ error: result.err.message }, 404);
      if (result.err.type === 'ArticleAlreadyExistsError') return c.json({ error: result.err.message }, 409);
      return c.json({ error: `Failed to create article: ${JSON.stringify(result.err)}` }, 400);
    },
  );

  app.post('/v1/articles/:articleId/publish', async (c) => {
    const articleId = ArticleId.parse(c.req.param('articleId'));
    if (!articleId.ok) return c.json({ error: 'Invalid article ID' }, 400);
    const sessionId = SessionId.parse(getCookie(c, 'sessionId'));
    if (!sessionId.ok) return c.json({ error: getCookie(c, 'sessionId') ? 'Invalid session' : 'Unauthorized' }, 401);
    const result = await deps.publishArticleUseCase.run({
      sessionId: sessionId.val,
      articleId: articleId.val,
      ctx: deps.createContext(c.req.raw),
    });
    if (result.ok) {
      await deps.publishOgImage?.(result.val.article);
      return c.json({ article: result.val.article });
    }
    if (result.err.type === 'UnauthorizedError') return c.json({ error: result.err.message }, 403);
    if (result.err.type === 'ArticleNotFoundError') return c.json({ error: result.err.message }, 404);
    return c.json({ error: result.err.message }, 400);
  });

  app.post('/v1/articles/:articleId/unpublish', async (c) => {
    const articleId = ArticleId.parse(c.req.param('articleId'));
    if (!articleId.ok) return c.json({ error: 'Invalid article ID' }, 400);
    const sessionId = SessionId.parse(getCookie(c, 'sessionId'));
    if (!sessionId.ok) return c.json({ error: getCookie(c, 'sessionId') ? 'Invalid session' : 'Unauthorized' }, 401);
    const result = await deps.unpublishArticleUseCase.run({
      sessionId: sessionId.val,
      articleId: articleId.val,
      ctx: deps.createContext(c.req.raw),
    });
    if (result.ok) return c.json({ article: result.val.article });
    if (result.err.type === 'UnauthorizedError') return c.json({ error: result.err.message }, 403);
    if (result.err.type === 'ArticleNotFoundError') return c.json({ error: result.err.message }, 404);
    return c.json({ error: result.err.message }, 400);
  });

  app.delete('/v1/articles/:articleId', async (c) => {
    const articleId = ArticleId.parse(c.req.param('articleId'));
    if (!articleId.ok) return c.json({ error: 'Invalid article ID' }, 400);
    const sessionId = SessionId.parse(getCookie(c, 'sessionId'));
    if (!sessionId.ok) return c.json({ error: getCookie(c, 'sessionId') ? 'Invalid session' : 'Unauthorized' }, 401);
    const result = await deps.deleteArticleUseCase.run({
      sessionId: sessionId.val,
      articleId: articleId.val,
      ctx: deps.createContext(c.req.raw),
    });
    if (result.ok) return c.json({ success: true });
    if (result.err.type === 'UnauthorizedError') return c.json({ error: result.err.message }, 403);
    if (result.err.type === 'ArticleNotFoundError') return c.json({ error: result.err.message }, 404);
    return c.json({ error: `Failed to delete article: ${JSON.stringify(result.err)}` }, 400);
  });

  return app;
};
