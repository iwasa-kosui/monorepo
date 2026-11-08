import type { RequestContext } from '@fedify/fedify';
import { type Context, Hono } from 'hono';
import { z } from 'zod/v4';

import type { ActorResolverByUserId } from '../../domain/actor/actor.ts';
import type { ActorId } from '../../domain/actor/actorId.ts';
import type { PublishedArticlesWithAuthorResolver } from '../../domain/article/article.ts';
import { Article } from '../../domain/article/article.ts';
import { ArticleId } from '../../domain/article/articleId.ts';
import type { ArticleBodyResolver } from '../../domain/articleBody/articleBody.ts';
import {
  type DigestHeadersResolverByArticleIds,
  type DigestResolverByArticleId,
  SUMMARY_DIGEST_TOPIC_KEY,
} from '../../domain/digest/digest.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { Scope } from '../../domain/oauth/scope.ts';
import { PostId } from '../../domain/post/postId.ts';
import { sanitizePostContent } from '../../domain/post/sanitizePostContent.ts';
import type { UserId } from '../../domain/user/userId.ts';
import type { CreateArticleUseCase } from '../../useCase/createArticle.ts';
import type { DeleteArticleUseCase } from '../../useCase/deleteArticle.ts';
import type { EditArticleUseCase } from '../../useCase/editArticle.ts';
import type { GetArticleForEditUseCase } from '../../useCase/getArticleForEdit.ts';
import type { GetArticlesUseCase } from '../../useCase/getArticles.ts';
import type { GetArticleWithThreadUseCase } from '../../useCase/getArticleWithThread.ts';
import type { PublishArticleUseCase } from '../../useCase/publishArticle.ts';
import type { UnpublishArticleUseCase } from '../../useCase/unpublishArticle.ts';
import { handleInternalError } from './helper/mastodonErrors.ts';
import { readRequestBody } from './helper/requestBody.ts';
import { sanitizeArticleBody } from './helper/sanitizeArticleBody.ts';
import {
  getMastodonPrincipal,
  isSameOriginRequest,
  type MastodonAuthEnv,
  type MastodonAuthn,
  rejectUnlessTokenScope,
} from './mastodonAuthn.ts';

export type WorkerIoriArticlesRouterDeps = Readonly<{
  authn: MastodonAuthn;
  getArticleWithThreadUseCase: GetArticleWithThreadUseCase;
  getArticlesUseCase: GetArticlesUseCase;
  createArticleUseCase: CreateArticleUseCase;
  publishArticleUseCase: PublishArticleUseCase;
  unpublishArticleUseCase: UnpublishArticleUseCase;
  deleteArticleUseCase: DeleteArticleUseCase;
  getArticleForEditUseCase: GetArticleForEditUseCase;
  editArticleUseCase: EditArticleUseCase;
  publishedArticlesResolver: PublishedArticlesWithAuthorResolver;
  articleBodyResolver?: ArticleBodyResolver;
  digestHeadersResolverByArticleIds?: DigestHeadersResolverByArticleIds;
  digestResolverByArticleId?: DigestResolverByArticleId;
  actorResolverByUserId?: ActorResolverByUserId;
  publishOgImage?: (article: Article) => Promise<void>;
  deleteOgImage?: (articleId: ArticleId) => Promise<void>;
  createContext: (request: Request) => RequestContext<unknown>;
}>;

const invalidToken = { error: 'The access token is invalid' } as const;
const invalidArticleId = { error: 'Invalid article ID' } as const;
const readStatuses = Scope.orThrow('read:statuses');
const writeStatuses = Scope.orThrow('write:statuses');
const createArticleBody = z.object({ rootPostId: PostId.zodType, title: z.string().min(1).max(200) });
const editArticleBody = z.object({
  title: z.string(),
  markdown: z.string().min(1).max(100_000),
  baseUpdatedAt: Instant.zodType,
});

const userIdOf = (c: Context<MastodonAuthEnv>): UserId | undefined => getMastodonPrincipal(c)?.userId ?? undefined;

export const createWorkerIoriArticlesRouter = ({
  authn,
  getArticleWithThreadUseCase,
  getArticlesUseCase,
  createArticleUseCase,
  publishArticleUseCase,
  unpublishArticleUseCase,
  deleteArticleUseCase,
  getArticleForEditUseCase,
  editArticleUseCase,
  publishedArticlesResolver,
  articleBodyResolver,
  digestHeadersResolverByArticleIds,
  digestResolverByArticleId,
  actorResolverByUserId,
  publishOgImage,
  deleteOgImage,
  createContext,
}: WorkerIoriArticlesRouterDeps): Hono<MastodonAuthEnv> => {
  const deleteOgImageSafely = async (articleId: ArticleId) => {
    try {
      await deleteOgImage?.(articleId);
    } catch (error) {
      console.warn('Failed to delete the OGP image.', { articleId, error });
    }
  };

  const resolveDigestExclusions = async (article: Article, viewerUserId: UserId | undefined) => {
    if (viewerUserId === undefined || article.authorUserId !== viewerUserId) return undefined;
    if (digestResolverByArticleId === undefined) return undefined;
    const digest = await digestResolverByArticleId.resolve(article.articleId);
    if (!digest.ok || digest.val === undefined) return undefined;
    const body = await articleBodyResolver?.resolve(article.articleId);
    return {
      digestDate: digest.val.digestDate,
      topicKey: digest.val.topicKey,
      edited: Article.isBodyEdited(article, body?.ok ? body.val : undefined),
      items: digest.val.items.map(({ digestItemId, rank, url, title, feedback }) => ({
        digestItemId,
        rank,
        url,
        title,
        feedback,
      })),
      excluded: {
        timelineLinks: digest.val.trends.filter((trend) => trend.kind === 'timeline_link').length,
        hatena: digest.val.trends.filter((trend) => trend.kind === 'hatena').length,
        hatenaCounts: digest.val.topicKey === SUMMARY_DIGEST_TOPIC_KEY && digest.val.items.length > 0,
        xPosts: digest.val.topicKey === SUMMARY_DIGEST_TOPIC_KEY && digest.val.items.length === 0,
        recommendations: digest.val.items.some((item) => item.reasonInterestSourceId !== null),
      },
    };
  };

  return new Hono<MastodonAuthEnv>()
    .onError(handleInternalError)
    .get('/iori/v1/articles/:articleId', authn.optionalAuth, async (c) => {
      const rejection = rejectUnlessTokenScope(c, getMastodonPrincipal(c), [readStatuses]);
      if (rejection !== undefined) return rejection;
      const articleId = ArticleId.parse(c.req.param('articleId'));
      if (!articleId.ok) return c.json(invalidArticleId, 400);
      const viewerUserId = userIdOf(c);
      let currentActorId: ActorId | undefined;
      if (viewerUserId !== undefined && actorResolverByUserId !== undefined) {
        try {
          const actor = await actorResolverByUserId.resolve(viewerUserId);
          currentActorId = actor.ok ? actor.val?.id : undefined;
        } catch {
          currentActorId = undefined;
        }
      }
      const result = await getArticleWithThreadUseCase.run({
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
        thread: result.val.thread.map((post) => ({ ...post, content: sanitizePostContent(post.content) })),
        ...(result.val.body === undefined
          ? {}
          : { body: { html: sanitizeArticleBody(result.val.body.html), updatedAt: result.val.body.updatedAt } }),
        ...(digest === undefined ? {} : { digest }),
      });
    })
    .get('/iori/v1/articles', authn.optionalAuth, async (c) => {
      const rejection = rejectUnlessTokenScope(c, getMastodonPrincipal(c), [readStatuses]);
      if (rejection !== undefined) return rejection;
      const userId = userIdOf(c);
      if (userId === undefined) {
        const result = await publishedArticlesResolver.resolve();
        return result.ok
          ? c.json({ articles: result.val.articles, authorUsername: result.val.authorUsername })
          : c.json({ error: 'Failed to get articles' }, 400);
      }
      const result = await getArticlesUseCase.run({ userId });
      if (!result.ok) return c.json({ error: `Failed to get articles: ${JSON.stringify(result.err)}` }, 400);
      const digestHeaders = await digestHeadersResolverByArticleIds?.resolve(
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
    })
    .post('/iori/v1/articles', authn.requireUser(writeStatuses), async (c) => {
      const userId = userIdOf(c);
      if (userId === undefined) return c.json(invalidToken, 401);
      const body = createArticleBody.safeParse(await readRequestBody(c));
      if (!body.success) {
        return c.json({
          error: `Validation failed: ${body.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
        }, 400);
      }
      const result = await createArticleUseCase.run({ userId, ...body.data });
      if (result.ok) return c.json({ article: result.val.article });
      if (result.err.type === 'UnauthorizedError') return c.json({ error: result.err.message }, 403);
      if (result.err.type === 'PostNotFoundError') return c.json({ error: result.err.message }, 404);
      if (result.err.type === 'ArticleAlreadyExistsError') return c.json({ error: result.err.message }, 409);
      return c.json({ error: `Failed to create article: ${JSON.stringify(result.err)}` }, 400);
    })
    .post('/iori/v1/articles/:articleId/publish', authn.requireUser(writeStatuses), async (c) => {
      const userId = userIdOf(c);
      if (userId === undefined) return c.json(invalidToken, 401);
      const articleId = ArticleId.parse(c.req.param('articleId'));
      if (!articleId.ok) return c.json(invalidArticleId, 400);
      const result = await publishArticleUseCase.run({
        userId,
        articleId: articleId.val,
        ctx: createContext(c.req.raw),
      });
      if (result.ok) {
        await publishOgImage?.(result.val.article);
        return c.json({ article: result.val.article });
      }
      if (result.err.type === 'UnauthorizedError') return c.json({ error: result.err.message }, 403);
      if (result.err.type === 'ArticleNotFoundError') return c.json({ error: result.err.message }, 404);
      if (result.err.type === 'DigestSummaryNotPublishableError') return c.json({ error: result.err.message }, 409);
      return c.json({ error: result.err.message }, 400);
    })
    .post('/iori/v1/articles/:articleId/unpublish', authn.requireUser(writeStatuses), async (c) => {
      const userId = userIdOf(c);
      if (userId === undefined) return c.json(invalidToken, 401);
      const articleId = ArticleId.parse(c.req.param('articleId'));
      if (!articleId.ok) return c.json(invalidArticleId, 400);
      const result = await unpublishArticleUseCase.run({
        userId,
        articleId: articleId.val,
        ctx: createContext(c.req.raw),
      });
      if (result.ok) {
        await deleteOgImageSafely(articleId.val);
        return c.json({ article: result.val.article });
      }
      if (result.err.type === 'UnauthorizedError') return c.json({ error: result.err.message }, 403);
      if (result.err.type === 'ArticleNotFoundError') return c.json({ error: result.err.message }, 404);
      return c.json({ error: result.err.message }, 400);
    })
    .get('/iori/v1/articles/:articleId/edit', authn.requireUser(readStatuses), async (c) => {
      const userId = userIdOf(c);
      if (userId === undefined) return c.json(invalidToken, 401);
      const articleId = ArticleId.parse(c.req.param('articleId'));
      if (!articleId.ok) return c.json(invalidArticleId, 400);
      const result = await getArticleForEditUseCase.run({ userId, articleId: articleId.val });
      if (result.ok) {
        return c.json({
          title: result.val.title,
          markdown: result.val.markdown,
          updatedAt: result.val.updatedAt,
        });
      }
      if (result.err.type === 'ArticleNotFoundError') return c.json({ error: result.err.message }, 404);
      return c.json({ error: result.err.message }, 409);
    })
    .put(
      '/iori/v1/articles/:articleId',
      async (c, next) => {
        if (c.req.header('Authorization') === undefined && !isSameOriginRequest(c.req.raw)) {
          return c.json({ error: 'Forbidden' }, 403);
        }
        await next();
      },
      authn.requireUser(writeStatuses),
      async (c) => {
        const userId = userIdOf(c);
        if (userId === undefined) return c.json(invalidToken, 401);
        const articleId = ArticleId.parse(c.req.param('articleId'));
        if (!articleId.ok) return c.json(invalidArticleId, 400);
        const body = editArticleBody.safeParse(await readRequestBody(c));
        if (!body.success) {
          return c.json({
            error: `Validation failed: ${body.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
          }, 400);
        }
        const result = await editArticleUseCase.run({ userId, articleId: articleId.val, ...body.data });
        if (result.ok) return c.json({ article: result.val.article });
        if (!('type' in result.err)) return c.json({ error: `Validation failed: title (${result.err.message})` }, 400);
        if (result.err.type === 'ArticleNotFoundError') return c.json({ error: result.err.message }, 404);
        return c.json({ error: result.err.message }, 409);
      },
    )
    .delete('/iori/v1/articles/:articleId', authn.requireUser(writeStatuses), async (c) => {
      const userId = userIdOf(c);
      if (userId === undefined) return c.json(invalidToken, 401);
      const articleId = ArticleId.parse(c.req.param('articleId'));
      if (!articleId.ok) return c.json(invalidArticleId, 400);
      const result = await deleteArticleUseCase.run({
        userId,
        articleId: articleId.val,
        ctx: createContext(c.req.raw),
      });
      if (result.ok) {
        await deleteOgImageSafely(articleId.val);
        return c.json({ success: true });
      }
      if (result.err.type === 'UnauthorizedError') return c.json({ error: result.err.message }, 403);
      if (result.err.type === 'ArticleNotFoundError') return c.json({ error: result.err.message }, 404);
      return c.json({ error: `Failed to delete article: ${JSON.stringify(result.err)}` }, 400);
    });
};
