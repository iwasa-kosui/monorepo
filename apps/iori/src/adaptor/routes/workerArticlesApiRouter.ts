import type { RequestContext } from '@fedify/fedify';
import { sValidator } from '@hono/standard-validator';
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { z } from 'zod/v4';

import type { ActorResolverByUserId } from '../../domain/actor/actor.ts';
import type { ActorId } from '../../domain/actor/actorId.ts';
import type { PublishedArticlesWithAuthorResolver } from '../../domain/article/article.ts';
import type { Article } from '../../domain/article/article.ts';
import { ArticleId } from '../../domain/article/articleId.ts';
import type {
  DigestHeaderResolverByArticleId,
  DigestHeadersResolverByArticleIds,
  DigestResolverByUserIdAndDigestDate,
} from '../../domain/digest/digest.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { PostId } from '../../domain/post/postId.ts';
import type { SessionResolver } from '../../domain/session/session.ts';
import { SessionId } from '../../domain/session/sessionId.ts';
import type { UserId } from '../../domain/user/userId.ts';
import type { CreateArticleUseCase } from '../../useCase/createArticle.ts';
import type { DeleteArticleUseCase } from '../../useCase/deleteArticle.ts';
import type { GetArticlesUseCase } from '../../useCase/getArticles.ts';
import type { GetArticleWithThreadUseCase } from '../../useCase/getArticleWithThread.ts';
import { resolveSessionWith } from '../../useCase/helper/resolve.ts';
import type { PublishArticleUseCase } from '../../useCase/publishArticle.ts';
import type { UnpublishArticleUseCase } from '../../useCase/unpublishArticle.ts';
import { sanitize } from './helper/sanitize.ts';
import { sanitizeArticleBody } from './helper/sanitizeArticleBody.ts';

export type WorkerArticlesApiRouterDeps = Readonly<{
  getArticleWithThreadUseCase: GetArticleWithThreadUseCase;
  getArticlesUseCase: GetArticlesUseCase;
  createArticleUseCase: CreateArticleUseCase;
  publishArticleUseCase: PublishArticleUseCase;
  unpublishArticleUseCase: UnpublishArticleUseCase;
  deleteArticleUseCase: DeleteArticleUseCase;
  publishedArticlesResolver: PublishedArticlesWithAuthorResolver;
  digestHeaderResolverByArticleId?: DigestHeaderResolverByArticleId;
  digestHeadersResolverByArticleIds?: DigestHeadersResolverByArticleIds;
  digestResolverByUserIdAndDigestDate?: DigestResolverByUserIdAndDigestDate;
  sessionResolver: SessionResolver;
  actorResolverByUserId?: ActorResolverByUserId;
  publishOgImage?: (article: Article) => Promise<void>;
  deleteOgImage?: (articleId: ArticleId) => Promise<void>;
  createContext: (request: Request) => RequestContext<unknown>;
}>;

export const createWorkerArticlesApiRouter = (deps: WorkerArticlesApiRouterDeps): Hono => {
  const app = new Hono();

  const deleteOgImageSafely = async (articleId: ArticleId) => {
    try {
      await deps.deleteOgImage?.(articleId);
    } catch (error) {
      console.warn('Failed to delete the OGP image.', { articleId, error });
    }
  };

  const resolveDigestExclusions = async (article: Article, viewerUserId: UserId | undefined) => {
    if (viewerUserId === undefined || article.authorUserId !== viewerUserId) return undefined;
    if (deps.digestHeaderResolverByArticleId === undefined || deps.digestResolverByUserIdAndDigestDate === undefined) {
      return undefined;
    }
    const header = await deps.digestHeaderResolverByArticleId.resolve(article.articleId);
    if (!header.ok || header.val === undefined) return undefined;
    const digest = await deps.digestResolverByUserIdAndDigestDate.resolve({
      userId: header.val.userId,
      digestDate: header.val.digestDate,
    });
    if (!digest.ok || digest.val === undefined) return undefined;
    return {
      digestDate: digest.val.digestDate,
      excluded: {
        timelineLinks: digest.val.trends.filter((trend) => trend.kind === 'timeline_link').length,
        hatena: digest.val.trends.filter((trend) => trend.kind === 'hatena').length,
        hatenaCounts: digest.val.items.length > 0,
      },
    };
  };

  app.get('/v1/articles/:articleId', async (c) => {
    const articleId = ArticleId.parse(c.req.param('articleId'));
    if (!articleId.ok) return c.json({ error: 'Invalid article ID' }, 400);
    const sessionId = SessionId.parse(getCookie(c, 'sessionId'));
    let viewerUserId: UserId | undefined;
    if (sessionId.ok) {
      try {
        const session = await resolveSessionWith(deps.sessionResolver, Instant.now())(sessionId.val);
        viewerUserId = session.ok ? session.val.userId : undefined;
      } catch {
        viewerUserId = undefined;
      }
    }
    let currentActorId: ActorId | undefined;
    if (viewerUserId !== undefined && deps.actorResolverByUserId !== undefined) {
      try {
        const actor = await deps.actorResolverByUserId.resolve(viewerUserId);
        currentActorId = actor.ok ? actor.val?.id : undefined;
      } catch {
        currentActorId = undefined;
      }
    }
    const result = await deps.getArticleWithThreadUseCase.run({
      articleId: articleId.val,
      viewerUserId,
      currentActorId,
    });
    if (!result.ok) {
      return result.err.type === 'ArticleNotFoundError'
        ? c.json({ error: result.err.message }, 404)
        : c.json({ error: `Failed to get article: ${JSON.stringify(result.err)}` }, 400);
    }
    const digest = await resolveDigestExclusions(result.val.article, viewerUserId);
    return c.json({
      article: result.val.article,
      thread: result.val.thread.map((post) => ({ ...post, content: sanitize(post.content) })),
      ...(result.val.body === undefined ? {} : { body: { html: sanitizeArticleBody(result.val.body.html) } }),
      ...(digest === undefined ? {} : { digest }),
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
    if (!result.ok) return c.json({ error: `Failed to get articles: ${JSON.stringify(result.err)}` }, 400);
    const digestHeaders = await deps.digestHeadersResolverByArticleIds?.resolve(
      result.val.articles.map((article) => article.articleId),
    );
    const digestArticleIds = new Set(digestHeaders?.ok ? digestHeaders.val.map((header) => header.articleId) : []);
    return c.json({
      articles: result.val.articles.map((article) => ({
        ...article,
        isDigest: digestArticleIds.has(article.articleId),
      })),
      authorUsername: result.val.authorUsername,
    });
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
    if (result.ok) {
      await deleteOgImageSafely(articleId.val);
      return c.json({ article: result.val.article });
    }
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
    if (result.ok) {
      await deleteOgImageSafely(articleId.val);
      return c.json({ success: true });
    }
    if (result.err.type === 'UnauthorizedError') return c.json({ error: result.err.message }, 403);
    if (result.err.type === 'ArticleNotFoundError') return c.json({ error: result.err.message }, 404);
    return c.json({ error: `Failed to delete article: ${JSON.stringify(result.err)}` }, 400);
  });

  return app;
};
