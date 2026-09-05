import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { createIoriApp } from '../../../appFactory.tsx';
import { ActorId } from '../../../domain/actor/actorId.ts';
import { ArticleId } from '../../../domain/article/articleId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { Username } from '../../../domain/user/username.ts';
import { createMockRequestContext } from '../../../useCase/__tests__/helper/mockAdaptors.ts';
import type { CreateArticleUseCase } from '../../../useCase/createArticle.ts';
import type { DeleteArticleUseCase } from '../../../useCase/deleteArticle.ts';
import type { GetArticlesUseCase } from '../../../useCase/getArticles.ts';
import type { GetArticleWithThreadUseCase } from '../../../useCase/getArticleWithThread.ts';
import type { PublishArticleUseCase } from '../../../useCase/publishArticle.ts';
import type { UnpublishArticleUseCase } from '../../../useCase/unpublishArticle.ts';
import { createWorkerArticlesApiRouter } from '../workerArticlesApiRouter.ts';

const sessionCookie = 'sessionId=4dc530d6-d06c-4b4a-a021-0e1aee0b6d82';

describe('createWorkerArticlesApiRouter', () => {
  it('serves public listing and authenticated article authoring contracts', async () => {
    const articleId = ArticleId.generate();
    const actorId = ActorId.generate();
    const userId = UserId.generate();
    const rootPostId = PostId.generate();
    const createdAt = Instant.orThrow(Date.parse('2026-08-05T00:00:00.000Z'));
    const article = {
      articleId,
      authorActorId: actorId,
      authorUserId: userId,
      rootPostId,
      title: 'D1 article',
      status: 'draft' as const,
      createdAt,
      publishedAt: null,
      unpublishedAt: null,
    };
    const getArticleWithThreadUseCase: GetArticleWithThreadUseCase = {
      run: async () =>
        RA.ok({
          article,
          thread: [{
            type: 'local',
            postId: rootPostId,
            actorId,
            userId,
            content: '<p>thread</p><script>alert(1)</script>',
            createdAt,
            inReplyToUri: null,
            username: Username.orThrow('kosui'),
            logoUri: undefined,
            liked: false,
            reposted: false,
            images: [],
            likeCount: 0,
            repostCount: 0,
            reactions: [],
            linkPreviews: [],
          }],
        }),
    };
    const getArticlesUseCase: GetArticlesUseCase = {
      run: async () => RA.ok({ articles: [article], authorUsername: 'kosui' }),
    };
    const createArticleUseCase: CreateArticleUseCase = { run: async () => RA.ok({ article }) };
    const publishArticleUseCase: PublishArticleUseCase = {
      run: async () => RA.ok({ article: { ...article, status: 'published', publishedAt: createdAt } }),
    };
    const unpublishArticleUseCase: UnpublishArticleUseCase = {
      run: async () => RA.ok({ article: { ...article, status: 'unpublished', unpublishedAt: createdAt } }),
    };
    const deleteArticleUseCase: DeleteArticleUseCase = { run: async () => RA.ok({ success: true }) };
    const publishOgImage = vi.fn(async () => undefined);
    const app = createIoriApp({
      federationMiddleware: undefined,
      registerRoutes: (router) => {
        router.route(
          '/api',
          createWorkerArticlesApiRouter({
            getArticleWithThreadUseCase,
            getArticlesUseCase,
            createArticleUseCase,
            publishArticleUseCase,
            unpublishArticleUseCase,
            deleteArticleUseCase,
            publishedArticlesResolver: {
              resolve: async () =>
                RA.ok({
                  articles: [{ ...article, status: 'published' }],
                  authorUsername: Username.orThrow('kosui'),
                }),
            },
            publishOgImage,
            createContext: () => createMockRequestContext(),
          }),
        );
      },
      serveAsset: async () => undefined,
      serveUpload: async () => undefined,
      serveOgImage: async () => new Response('not implemented', { status: 501 }),
    });

    const publicList = await app.request('https://worker.test/api/v1/articles');
    const privateList = await app.request('https://worker.test/api/v1/articles', {
      headers: { Cookie: sessionCookie },
    });
    const detail = await app.request(`https://worker.test/api/v1/articles/${articleId}`);
    const create = await app.request('https://worker.test/api/v1/articles', {
      method: 'POST',
      headers: { Cookie: sessionCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ rootPostId, title: article.title }),
    });
    const publish = await app.request(`https://worker.test/api/v1/articles/${articleId}/publish`, {
      method: 'POST',
      headers: { Cookie: sessionCookie },
    });
    const unpublish = await app.request(`https://worker.test/api/v1/articles/${articleId}/unpublish`, {
      method: 'POST',
      headers: { Cookie: sessionCookie },
    });
    const remove = await app.request(`https://worker.test/api/v1/articles/${articleId}`, {
      method: 'DELETE',
      headers: { Cookie: sessionCookie },
    });

    await expect(publicList.json()).resolves.toMatchObject({ articles: [{ status: 'published' }] });
    await expect(privateList.json()).resolves.toMatchObject({ articles: [{ status: 'draft' }] });
    await expect(detail.json()).resolves.toMatchObject({ thread: [{ content: '<p>thread</p>' }] });
    await expect(create.json()).resolves.toEqual({ article });
    await expect(publish.json()).resolves.toMatchObject({ article: { status: 'published' } });
    expect(publishOgImage).toHaveBeenCalledWith(expect.objectContaining({ articleId, title: article.title }));
    await expect(unpublish.json()).resolves.toMatchObject({ article: { status: 'unpublished' } });
    await expect(remove.json()).resolves.toEqual({ success: true });
  });
});
