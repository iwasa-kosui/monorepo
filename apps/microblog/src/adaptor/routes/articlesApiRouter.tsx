import { sValidator } from '@hono/standard-validator';
import { RA } from '@iwasa-kosui/result';
import { desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { z } from 'zod/v4';

import { ArticleId } from '../../domain/article/articleId.ts';
import { PostId } from '../../domain/post/postId.ts';
import { SessionId } from '../../domain/session/sessionId.ts';
import { Username } from '../../domain/user/username.ts';
import { Federation } from '../../federation.ts';
import { CreateArticleUseCase } from '../../useCase/createArticle.ts';
import { DeleteArticleUseCase } from '../../useCase/deleteArticle.ts';
import { GetArticlesUseCase } from '../../useCase/getArticles.ts';
import { GetArticleWithThreadUseCase } from '../../useCase/getArticleWithThread.ts';
import { PublishArticleUseCase } from '../../useCase/publishArticle.ts';
import { UnpublishArticleUseCase } from '../../useCase/unpublishArticle.ts';
import type { InferUseCaseError } from '../../useCase/useCase.ts';
import { PgActorResolverByUserId } from '../pg/actor/actorResolverByUserId.ts';
import { PgArticleCreatedStore } from '../pg/article/articleCreatedStore.ts';
import { PgArticleDeletedStore } from '../pg/article/articleDeletedStore.ts';
import { PgArticlePublishedStore } from '../pg/article/articlePublishedStore.ts';
import { PgArticleResolver } from '../pg/article/articleResolver.ts';
import { PgArticleResolverByRootPostId } from '../pg/article/articleResolverByRootPostId.ts';
import { PgArticlesResolverByAuthorActorId } from '../pg/article/articlesResolverByAuthorActorId.ts';
import { PgArticleUnpublishedStore } from '../pg/article/articleUnpublishedStore.ts';
import { DB } from '../pg/db.ts';
import { PgPostResolver } from '../pg/post/postResolver.ts';
import { PgThreadResolver } from '../pg/post/threadResolver.ts';
import { articlesTable, usersTable } from '../pg/schema.ts';
import { PgSessionResolver } from '../pg/session/sessionResolver.ts';
import { PgUserResolver } from '../pg/user/userResolver.ts';
import { sanitize } from './helper/sanitize.ts';

const app = new Hono();

app.get('/articles/:articleId', async (c) => {
  const articleIdParam = c.req.param('articleId');
  const articleIdResult = ArticleId.parse(articleIdParam);
  if (!articleIdResult.ok) {
    return c.json({ error: 'Invalid article ID' }, 400);
  }

  const useCase = GetArticleWithThreadUseCase.create({
    articleResolver: PgArticleResolver.getInstance(),
    threadResolver: PgThreadResolver.getInstance(),
  });

  const result = await useCase.run({
    articleId: articleIdResult.val,
  });

  if (!result.ok) {
    const err = result.err as InferUseCaseError<GetArticleWithThreadUseCase>;
    if (err.type === 'ArticleNotFoundError') {
      return c.json({ error: err.message }, 404);
    }
    return c.json({ error: `Failed to get article: ${JSON.stringify(err)}` }, 400);
  }

  return c.json({
    article: result.val.article,
    thread: result.val.thread.map((post) => ({
      ...post,
      content: sanitize(post.content),
    })),
  });
});

app.get('/articles', async (c) => {
  const sessionId = getCookie(c, 'sessionId');

  // Non-authenticated users: return only published articles
  if (!sessionId) {
    const rows = await DB.getInstance().select({
      article: articlesTable,
      username: usersTable.username,
    })
      .from(articlesTable)
      .innerJoin(usersTable, eq(articlesTable.authorUserId, usersTable.userId))
      .where(eq(articlesTable.status, 'published'))
      .orderBy(desc(articlesTable.publishedAt))
      .execute();

    const articles = rows.map((row) => PgArticleResolver.reconstructArticle(row.article));
    const authorUsername = rows.length > 0 ? Username.orThrow(rows[0].username) : null;
    return c.json({ articles, authorUsername });
  }

  const sessionIdResult = SessionId.parse(sessionId);
  if (!sessionIdResult.ok) {
    return c.json({ error: 'Invalid session' }, 401);
  }

  const useCase = GetArticlesUseCase.create({
    sessionResolver: PgSessionResolver.getInstance(),
    userResolver: PgUserResolver.getInstance(),
    actorResolverByUserId: PgActorResolverByUserId.getInstance(),
    articlesResolverByAuthorActorId: PgArticlesResolverByAuthorActorId.getInstance(),
  });

  const result = await useCase.run({
    sessionId: sessionIdResult.val,
  });

  if (!result.ok) {
    return c.json({ error: `Failed to get articles: ${JSON.stringify(result.err)}` }, 400);
  }
  return c.json({ articles: result.val.articles, authorUsername: result.val.authorUsername });
});

app.post(
  '/articles',
  sValidator(
    'json',
    z.object({
      rootPostId: PostId.zodType,
      title: z.string().min(1).max(200),
    }),
  ),
  async (c) => {
    const body = c.req.valid('json');
    const { rootPostId, title } = body;

    const sessionIdResult = await RA.flow(
      RA.ok(getCookie(c, 'sessionId')),
      RA.andThen(SessionId.parse),
    );
    if (!sessionIdResult.ok) {
      return c.json({ error: 'Invalid session' }, 401);
    }

    const useCase = CreateArticleUseCase.create({
      sessionResolver: PgSessionResolver.getInstance(),
      userResolver: PgUserResolver.getInstance(),
      actorResolverByUserId: PgActorResolverByUserId.getInstance(),
      postResolver: PgPostResolver.getInstance(),
      articleResolverByRootPostId: PgArticleResolverByRootPostId.getInstance(),
      articleCreatedStore: PgArticleCreatedStore.getInstance(),
    });

    const result = await useCase.run({
      sessionId: sessionIdResult.val,
      rootPostId,
      title,
    });

    if (!result.ok) {
      const err = result.err as InferUseCaseError<CreateArticleUseCase>;
      if (err.type === 'UnauthorizedError') {
        return c.json({ error: err.message }, 403);
      }
      if (err.type === 'PostNotFoundError') {
        return c.json({ error: err.message }, 404);
      }
      if (err.type === 'ArticleAlreadyExistsError') {
        return c.json({ error: err.message }, 409);
      }
      return c.json({ error: `Failed to create article: ${JSON.stringify(err)}` }, 400);
    }
    return c.json({ article: result.val.article });
  },
);

app.post('/articles/:articleId/publish', async (c) => {
  const articleIdParam = c.req.param('articleId');
  const articleIdResult = ArticleId.parse(articleIdParam);
  if (!articleIdResult.ok) {
    return c.json({ error: 'Invalid article ID' }, 400);
  }

  const sessionId = getCookie(c, 'sessionId');
  if (!sessionId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const sessionIdResult = SessionId.parse(sessionId);
  if (!sessionIdResult.ok) {
    return c.json({ error: 'Invalid session' }, 401);
  }

  const ctx = Federation.getInstance().createContext(c.req.raw, undefined);

  const useCase = PublishArticleUseCase.create({
    sessionResolver: PgSessionResolver.getInstance(),
    userResolver: PgUserResolver.getInstance(),
    actorResolverByUserId: PgActorResolverByUserId.getInstance(),
    articleResolver: PgArticleResolver.getInstance(),
    articlePublishedStore: PgArticlePublishedStore.getInstance(),
  });

  const result = await useCase.run({
    sessionId: sessionIdResult.val,
    articleId: articleIdResult.val,
    ctx,
  });

  if (!result.ok) {
    const err = result.err as InferUseCaseError<PublishArticleUseCase>;
    if (err.type === 'UnauthorizedError') {
      return c.json({ error: err.message }, 403);
    }
    if (err.type === 'ArticleNotFoundError') {
      return c.json({ error: err.message }, 404);
    }
    if (err.type === 'ArticleInvalidStatusError') {
      return c.json({ error: err.message }, 400);
    }
    return c.json({ error: `Failed to publish article: ${JSON.stringify(err)}` }, 400);
  }
  return c.json({ article: result.val.article });
});

app.post('/articles/:articleId/unpublish', async (c) => {
  const articleIdParam = c.req.param('articleId');
  const articleIdResult = ArticleId.parse(articleIdParam);
  if (!articleIdResult.ok) {
    return c.json({ error: 'Invalid article ID' }, 400);
  }

  const sessionId = getCookie(c, 'sessionId');
  if (!sessionId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const sessionIdResult = SessionId.parse(sessionId);
  if (!sessionIdResult.ok) {
    return c.json({ error: 'Invalid session' }, 401);
  }

  const ctx = Federation.getInstance().createContext(c.req.raw, undefined);

  const useCase = UnpublishArticleUseCase.create({
    sessionResolver: PgSessionResolver.getInstance(),
    userResolver: PgUserResolver.getInstance(),
    actorResolverByUserId: PgActorResolverByUserId.getInstance(),
    articleResolver: PgArticleResolver.getInstance(),
    articleUnpublishedStore: PgArticleUnpublishedStore.getInstance(),
  });

  const result = await useCase.run({
    sessionId: sessionIdResult.val,
    articleId: articleIdResult.val,
    ctx,
  });

  if (!result.ok) {
    const err = result.err as InferUseCaseError<UnpublishArticleUseCase>;
    if (err.type === 'UnauthorizedError') {
      return c.json({ error: err.message }, 403);
    }
    if (err.type === 'ArticleNotFoundError') {
      return c.json({ error: err.message }, 404);
    }
    if (err.type === 'ArticleInvalidStatusError') {
      return c.json({ error: err.message }, 400);
    }
    return c.json({ error: `Failed to unpublish article: ${JSON.stringify(err)}` }, 400);
  }
  return c.json({ article: result.val.article });
});

app.delete('/articles/:articleId', async (c) => {
  const articleIdParam = c.req.param('articleId');
  const articleIdResult = ArticleId.parse(articleIdParam);
  if (!articleIdResult.ok) {
    return c.json({ error: 'Invalid article ID' }, 400);
  }

  const sessionId = getCookie(c, 'sessionId');
  if (!sessionId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const sessionIdResult = SessionId.parse(sessionId);
  if (!sessionIdResult.ok) {
    return c.json({ error: 'Invalid session' }, 401);
  }

  const ctx = Federation.getInstance().createContext(c.req.raw, undefined);

  const useCase = DeleteArticleUseCase.create({
    sessionResolver: PgSessionResolver.getInstance(),
    userResolver: PgUserResolver.getInstance(),
    actorResolverByUserId: PgActorResolverByUserId.getInstance(),
    articleResolver: PgArticleResolver.getInstance(),
    articleDeletedStore: PgArticleDeletedStore.getInstance(),
  });

  const result = await useCase.run({
    sessionId: sessionIdResult.val,
    articleId: articleIdResult.val,
    ctx,
  });

  if (!result.ok) {
    const err = result.err as InferUseCaseError<DeleteArticleUseCase>;
    if (err.type === 'UnauthorizedError') {
      return c.json({ error: err.message }, 403);
    }
    if (err.type === 'ArticleNotFoundError') {
      return c.json({ error: err.message }, 404);
    }
    return c.json({ error: `Failed to delete article: ${JSON.stringify(err)}` }, 400);
  }
  return c.json({ success: true });
});

export type ArticlesApiRouterType = typeof app;
export { app as ArticlesApiRouter };
