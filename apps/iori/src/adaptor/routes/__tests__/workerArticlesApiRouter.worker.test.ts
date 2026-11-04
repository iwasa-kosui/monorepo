import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { createIoriApp } from '../../../appFactory.tsx';
import { ActorId } from '../../../domain/actor/actorId.ts';
import type { Article, ArticleStatus } from '../../../domain/article/article.ts';
import { ArticleId } from '../../../domain/article/articleId.ts';
import { Digest } from '../../../domain/digest/digest.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { SessionId } from '../../../domain/session/sessionId.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { Username } from '../../../domain/user/username.ts';
import { createMockRequestContext, createMockSessionResolver } from '../../../useCase/__tests__/helper/mockAdaptors.ts';
import type { CreateArticleUseCase } from '../../../useCase/createArticle.ts';
import type { DeleteArticleUseCase } from '../../../useCase/deleteArticle.ts';
import type { GetArticlesUseCase } from '../../../useCase/getArticles.ts';
import { GetArticleWithThreadUseCase } from '../../../useCase/getArticleWithThread.ts';
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
          article: { ...article, status: 'published' as const, publishedAt: createdAt },
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
            sessionResolver: createMockSessionResolver(),
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
    await expect(detail.json()).resolves.toMatchObject({
      article: { status: 'published' },
      thread: [{ content: '<p>thread</p>' }],
    });
    await expect(create.json()).resolves.toEqual({ article });
    await expect(publish.json()).resolves.toMatchObject({ article: { status: 'published' } });
    expect(publishOgImage).toHaveBeenCalledWith(expect.objectContaining({ articleId, title: article.title }));
    await expect(unpublish.json()).resolves.toMatchObject({ article: { status: 'unpublished' } });
    await expect(remove.json()).resolves.toEqual({ success: true });
  });

  describe('GET /v1/articles/:articleId の公開範囲', () => {
    const authorUserId = UserId.generate();
    const otherUserId = UserId.generate();
    const authorSessionId = SessionId.generate();
    const otherSessionId = SessionId.generate();
    const expiredSessionId = SessionId.generate();
    const createdAt = Instant.orThrow(Date.parse('2026-08-05T00:00:00.000Z'));

    const createArticle = (status: ArticleStatus): Article => ({
      articleId: ArticleId.generate(),
      authorActorId: ActorId.generate(),
      authorUserId,
      rootPostId: PostId.generate(),
      title: 'Visibility article',
      status,
      createdAt,
      publishedAt: status === 'draft' ? null : createdAt,
      unpublishedAt: status === 'unpublished' ? createdAt : null,
    });

    const createApp = (article: Article, options: Readonly<{ sessionResolverThrows?: boolean }> = {}) => {
      const sessionResolver = createMockSessionResolver();
      const future = Instant.orThrow(Date.now() + 60_000);
      sessionResolver.setSession({ sessionId: authorSessionId, userId: authorUserId, expires: future });
      sessionResolver.setSession({ sessionId: otherSessionId, userId: otherUserId, expires: future });
      sessionResolver.setSession({
        sessionId: expiredSessionId,
        userId: authorUserId,
        expires: Instant.orThrow(Date.now() - 60_000),
      });
      const getArticleWithThreadUseCase = GetArticleWithThreadUseCase.create({
        articleResolver: { resolve: async (id) => RA.ok(id === article.articleId ? article : undefined) },
        threadResolver: { resolve: async () => RA.ok({ currentPost: null, ancestors: [], descendants: [] }) },
        articleBodyResolver: { resolve: async () => RA.ok(undefined) },
      });
      const unused = { run: async () => RA.err({}) } as never;
      return createIoriApp({
        federationMiddleware: undefined,
        registerRoutes: (router) => {
          router.route(
            '/api',
            createWorkerArticlesApiRouter({
              getArticleWithThreadUseCase,
              getArticlesUseCase: unused,
              createArticleUseCase: unused,
              publishArticleUseCase: unused,
              unpublishArticleUseCase: unused,
              deleteArticleUseCase: unused,
              publishedArticlesResolver: { resolve: async () => RA.ok({ articles: [], authorUsername: null }) },
              sessionResolver: options.sessionResolverThrows
                ? {
                  resolve: async () => {
                    throw new Error('D1 is unavailable');
                  },
                }
                : sessionResolver,
              createContext: () => createMockRequestContext(),
            }),
          );
        },
        serveAsset: async () => undefined,
        serveUpload: async () => undefined,
        serveOgImage: async () => new Response('not implemented', { status: 501 }),
      });
    };

    const get = (app: ReturnType<typeof createApp>, article: Article, cookie?: string) =>
      app.request(
        `https://worker.test/api/v1/articles/${article.articleId}`,
        cookie === undefined ? undefined : { headers: { Cookie: cookie } },
      );

    it.each(['draft', 'unpublished'] as const)('%s は匿名だと 404 になる', async (status) => {
      const article = createArticle(status);

      expect((await get(createApp(article), article)).status).toBe(404);
    });

    it.each(['draft', 'unpublished'] as const)('%s は作者以外の Cookie だと 404 になる', async (status) => {
      const article = createArticle(status);

      expect((await get(createApp(article), article, `sessionId=${otherSessionId}`)).status).toBe(404);
    });

    it.each(['draft', 'unpublished'] as const)('%s は作者の Cookie だと 200 になる', async (status) => {
      const article = createArticle(status);

      const response = await get(createApp(article), article, `sessionId=${authorSessionId}`);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ article: { articleId: article.articleId, status } });
    });

    it.each(['draft', 'unpublished'] as const)('%s は期限切れの作者の Cookie だと 404 になる', async (status) => {
      const article = createArticle(status);

      expect((await get(createApp(article), article, `sessionId=${expiredSessionId}`)).status).toBe(404);
    });

    it('published は匿名でも 200 になる', async () => {
      const article = createArticle('published');

      expect((await get(createApp(article), article)).status).toBe(200);
    });

    it('published は形が不正な Cookie でも 200 になる', async () => {
      const article = createArticle('published');

      expect((await get(createApp(article), article, 'sessionId=not-a-uuid')).status).toBe(200);
    });

    it('published は存在しない session の Cookie でも 200 になる', async () => {
      const article = createArticle('published');

      expect((await get(createApp(article), article, `sessionId=${SessionId.generate()}`)).status).toBe(200);
    });

    it('session の解決が例外を投げても published は 200 になる', async () => {
      const article = createArticle('published');

      const app = createApp(article, { sessionResolverThrows: true });

      expect((await get(app, article, `sessionId=${authorSessionId}`)).status).toBe(200);
    });

    it('session の解決が例外を投げたら draft は 404 になる', async () => {
      const article = createArticle('draft');

      const app = createApp(article, { sessionResolverThrows: true });

      expect((await get(app, article, `sessionId=${authorSessionId}`)).status).toBe(404);
    });
  });

  describe('OG 画像の削除', () => {
    const articleId = ArticleId.generate();
    const article = {
      articleId,
      authorActorId: ActorId.generate(),
      authorUserId: UserId.generate(),
      rootPostId: PostId.generate(),
      title: 'OG article',
      status: 'unpublished' as const,
      createdAt: Instant.orThrow(Date.parse('2026-08-05T00:00:00.000Z')),
      publishedAt: null,
      unpublishedAt: null,
    };

    const createApp = (
      options: Readonly<{ succeeds: boolean; deleteOgImage: (articleId: ArticleId) => Promise<void> }>,
    ) => {
      const result = () =>
        options.succeeds
          ? RA.ok({ article, success: true as const })
          : RA.err({ type: 'UnauthorizedError' as const, message: 'forbidden' });
      const unpublishArticleUseCase = { run: async () => result() } as unknown as UnpublishArticleUseCase;
      const deleteArticleUseCase = { run: async () => result() } as unknown as DeleteArticleUseCase;
      const unused = { run: async () => RA.err({}) } as never;
      return createIoriApp({
        federationMiddleware: undefined,
        registerRoutes: (router) => {
          router.route(
            '/api',
            createWorkerArticlesApiRouter({
              getArticleWithThreadUseCase: unused,
              getArticlesUseCase: unused,
              createArticleUseCase: unused,
              publishArticleUseCase: unused,
              unpublishArticleUseCase,
              deleteArticleUseCase,
              publishedArticlesResolver: { resolve: async () => RA.ok({ articles: [], authorUsername: null }) },
              sessionResolver: createMockSessionResolver(),
              deleteOgImage: options.deleteOgImage,
              createContext: () => createMockRequestContext(),
            }),
          );
        },
        serveAsset: async () => undefined,
        serveUpload: async () => undefined,
        serveOgImage: async () => new Response('not implemented', { status: 501 }),
      });
    };

    const requests = {
      unpublish: (app: ReturnType<typeof createApp>) =>
        app.request(`https://worker.test/api/v1/articles/${articleId}/unpublish`, {
          method: 'POST',
          headers: { Cookie: sessionCookie },
        }),
      delete: (app: ReturnType<typeof createApp>) =>
        app.request(`https://worker.test/api/v1/articles/${articleId}`, {
          method: 'DELETE',
          headers: { Cookie: sessionCookie },
        }),
    };

    it.each(['unpublish', 'delete'] as const)('%s が成功したら OG 画像を削除する', async (operation) => {
      const deleteOgImage = vi.fn(async () => undefined);

      const response = await requests[operation](createApp({ succeeds: true, deleteOgImage }));

      expect(response.status).toBe(200);
      expect(deleteOgImage).toHaveBeenCalledExactlyOnceWith(articleId);
    });

    it.each(['unpublish', 'delete'] as const)(
      '%s の成功後に削除が失敗しても応答は成功のままで警告を出す',
      async (operation) => {
        const error = new Error('R2 is unavailable');
        const deleteOgImage = vi.fn(async () => {
          throw error;
        });
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        const response = await requests[operation](createApp({ succeeds: true, deleteOgImage }));

        expect(response.status).toBe(200);
        expect(warn).toHaveBeenCalledWith(expect.any(String), { articleId, error });
        warn.mockRestore();
      },
    );

    it.each(['unpublish', 'delete'] as const)('%s が失敗したら OG 画像を削除しない', async (operation) => {
      const deleteOgImage = vi.fn(async () => undefined);

      const response = await requests[operation](createApp({ succeeds: false, deleteOgImage }));

      expect(response.status).toBe(403);
      expect(deleteOgImage).not.toHaveBeenCalled();
    });
  });

  describe('本文を持つ article の GET /v1/articles/:articleId', () => {
    const authorUserId = UserId.generate();
    const authorSessionId = SessionId.generate();
    const createdAt = Instant.orThrow(Date.parse('2026-08-05T00:00:00.000Z'));

    const createApp = (status: ArticleStatus) => {
      const article: Article = {
        articleId: ArticleId.generate(),
        authorActorId: ActorId.generate(),
        authorUserId,
        rootPostId: null,
        title: 'Digest',
        status,
        createdAt,
        publishedAt: status === 'draft' ? null : createdAt,
        unpublishedAt: null,
      };
      const sessionResolver = createMockSessionResolver();
      sessionResolver.setSession({
        sessionId: authorSessionId,
        userId: authorUserId,
        expires: Instant.orThrow(Date.now() + 60_000),
      });
      const resolveThread = vi.fn(async () => RA.ok({ currentPost: null, ancestors: [], descendants: [] }));
      const unused = { run: async () => RA.err({}) } as never;
      const app = createIoriApp({
        federationMiddleware: undefined,
        registerRoutes: (router) => {
          router.route(
            '/api',
            createWorkerArticlesApiRouter({
              getArticleWithThreadUseCase: GetArticleWithThreadUseCase.create({
                articleResolver: { resolve: async (id) => RA.ok(id === article.articleId ? article : undefined) },
                threadResolver: { resolve: resolveThread as never },
                articleBodyResolver: {
                  resolve: async () =>
                    RA.ok({
                      articleId: article.articleId,
                      privateHtml: '<p>private</p><script>alert(1)</script>',
                      publicHtml: '<p>public</p><img src="https://example.com/a.png">',
                      updatedAt: createdAt,
                    }),
                },
              }),
              getArticlesUseCase: unused,
              createArticleUseCase: unused,
              publishArticleUseCase: unused,
              unpublishArticleUseCase: unused,
              deleteArticleUseCase: unused,
              publishedArticlesResolver: { resolve: async () => RA.ok({ articles: [], authorUsername: null }) },
              sessionResolver,
              createContext: () => createMockRequestContext(),
            }),
          );
        },
        serveAsset: async () => undefined,
        serveUpload: async () => undefined,
        serveOgImage: async () => new Response('not implemented', { status: 501 }),
      });
      return { app, article, resolveThread };
    };

    it('作者の draft は private_html を body として返し、出力でもサニタイズする', async () => {
      const { app, article, resolveThread } = createApp('draft');

      const response = await app.request(`https://worker.test/api/v1/articles/${article.articleId}`, {
        headers: { Cookie: `sessionId=${authorSessionId}` },
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        article: { articleId: article.articleId, rootPostId: null },
        thread: [],
        body: { html: '<p>private</p>' },
      });
      expect(resolveThread).not.toHaveBeenCalled();
    });

    it('匿名の published は public_html を body として返す', async () => {
      const { app, article } = createApp('published');

      const response = await app.request(`https://worker.test/api/v1/articles/${article.articleId}`);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ thread: [], body: { html: '<p>public</p>' } });
    });

    it('匿名の draft は 404 になる', async () => {
      const { app, article } = createApp('draft');

      const response = await app.request(`https://worker.test/api/v1/articles/${article.articleId}`);

      expect(response.status).toBe(404);
    });
  });

  describe('GET /v1/articles/:articleId のスレッドの絞り込み', () => {
    const authorUserId = UserId.generate();
    const viewerActorId = ActorId.generate();
    const sessionId = SessionId.generate();
    const createdAt = Instant.orThrow(Date.parse('2026-08-05T00:00:00.000Z'));
    const article: Article = {
      articleId: ArticleId.generate(),
      authorActorId: ActorId.generate(),
      authorUserId,
      rootPostId: PostId.generate(),
      title: 'Thread article',
      status: 'published',
      createdAt,
      publishedAt: createdAt,
      unpublishedAt: null,
    };
    const post = (content: string, visibility: 'public' | 'private' | 'direct' | null) => ({
      type: 'remote' as const,
      postId: PostId.generate(),
      actorId: ActorId.generate(),
      uri: `https://remote.example/notes/${content}`,
      content,
      createdAt,
      inReplyToUri: null,
      visibility,
      username: Username.orThrow('alice'),
      logoUri: undefined,
      liked: false,
      reposted: false,
      images: [],
      likeCount: 0,
      repostCount: 0,
      reactions: [],
      linkPreviews: [],
    });

    const createApp = () => {
      const sessionResolver = createMockSessionResolver();
      sessionResolver.setSession({ sessionId, userId: authorUserId, expires: Instant.orThrow(Date.now() + 60_000) });
      const resolveThread = vi.fn(async (input: { onlyVisibleToViewer?: boolean }) =>
        RA.ok({
          currentPost: null,
          ancestors: [],
          descendants: input.onlyVisibleToViewer === true
            ? [post('public', 'public'), post('direct-to-viewer', 'direct')]
            : [post('public', 'public'), post('direct', 'direct'), post('private', 'private'), post('unknown', null)],
        })
      );
      const unused = { run: async () => RA.err({}) } as never;
      const app = createIoriApp({
        federationMiddleware: undefined,
        registerRoutes: (router) => {
          router.route(
            '/api',
            createWorkerArticlesApiRouter({
              getArticleWithThreadUseCase: GetArticleWithThreadUseCase.create({
                articleResolver: { resolve: async () => RA.ok(article) },
                threadResolver: { resolve: resolveThread as never },
                articleBodyResolver: { resolve: async () => RA.ok(undefined) },
              }),
              getArticlesUseCase: unused,
              createArticleUseCase: unused,
              publishArticleUseCase: unused,
              unpublishArticleUseCase: unused,
              deleteArticleUseCase: unused,
              publishedArticlesResolver: { resolve: async () => RA.ok({ articles: [], authorUsername: null }) },
              sessionResolver,
              actorResolverByUserId: {
                resolve: async () =>
                  RA.ok({
                    id: viewerActorId,
                    userId: authorUserId,
                    uri: 'https://worker.test/users/kosui',
                    inboxUrl: 'https://worker.test/users/kosui/inbox',
                    type: 'local' as const,
                    logoUri: undefined,
                  }),
              },
              createContext: () => createMockRequestContext(),
            }),
          );
        },
        serveAsset: async () => undefined,
        serveUpload: async () => undefined,
        serveOgImage: async () => new Response('not implemented', { status: 501 }),
      });
      return { app, resolveThread };
    };

    const contentsOf = async (response: Response) =>
      ((await response.json()) as { thread: Array<{ content: string }> }).thread.map((item) => item.content);

    it('匿名には宛先外の direct と private と記録のない返信を返さない', async () => {
      const { app } = createApp();

      const response = await app.request(`https://worker.test/api/v1/articles/${article.articleId}`);

      expect(await contentsOf(response)).toEqual(['public']);
    });

    it('ログイン中は閲覧者の actor を渡し、宛先の direct を返す', async () => {
      const { app, resolveThread } = createApp();

      const response = await app.request(`https://worker.test/api/v1/articles/${article.articleId}`, {
        headers: { Cookie: `sessionId=${sessionId}` },
      });

      expect(resolveThread).toHaveBeenCalledWith({
        postId: article.rootPostId,
        currentActorId: viewerActorId,
        onlyVisibleToViewer: true,
      });
      expect(await contentsOf(response)).toEqual(['public', 'direct-to-viewer']);
    });
  });

  describe('ダイジェストの article の公開前の確認に使う情報', () => {
    const authorUserId = UserId.generate();
    const otherUserId = UserId.generate();
    const authorSessionId = SessionId.generate();
    const otherSessionId = SessionId.generate();
    const createdAt = Instant.orThrow(Date.parse('2026-11-05T00:00:00.000Z'));

    const createArticle = (status: ArticleStatus): Article => ({
      articleId: ArticleId.generate(),
      authorActorId: ActorId.generate(),
      authorUserId,
      rootPostId: null,
      title: '技術ニュースのダイジェスト 2026-11-05',
      status,
      createdAt,
      publishedAt: status === 'draft' ? null : createdAt,
      unpublishedAt: null,
    });

    const createDigest = (article: Article, itemCount: number, reasonInterestSourceId: string | null = null) => {
      const created = Digest.create({
        userId: authorUserId,
        digestDate: '2026-11-05',
        articleId: article.articleId,
        trigger: 'scheduled',
        items: Array.from({ length: itemCount }, (_, index) => ({
          feedEntryId: `entry-${index + 1}`,
          url: `https://example.com/${index + 1}`,
          title: `entry ${index + 1}`,
          rank: index + 1,
          score: null,
          summary: null,
          reasonInterestSourceId,
          feedback: null,
        })),
        trends: [
          { kind: 'timeline_link', rank: 1, url: 'https://example.com/t1', title: 'T1', count: 3 },
          { kind: 'timeline_link', rank: 2, url: 'https://example.com/t2', title: 'T2', count: 2 },
          { kind: 'hatena', rank: 1, url: 'https://example.com/h1', title: 'H1', count: 100 },
        ],
      }, createdAt);
      if (!created.ok) throw new Error('unexpected');
      return created.val.aggregateState;
    };

    const createApp = (article: Article, digest: Digest | undefined) => {
      const sessionResolver = createMockSessionResolver();
      const future = Instant.orThrow(Date.now() + 60_000);
      sessionResolver.setSession({ sessionId: authorSessionId, userId: authorUserId, expires: future });
      sessionResolver.setSession({ sessionId: otherSessionId, userId: otherUserId, expires: future });
      const unused = { run: async () => RA.err({}) } as never;
      return createIoriApp({
        federationMiddleware: undefined,
        registerRoutes: (router) => {
          router.route(
            '/api',
            createWorkerArticlesApiRouter({
              getArticleWithThreadUseCase: GetArticleWithThreadUseCase.create({
                articleResolver: { resolve: async (id) => RA.ok(id === article.articleId ? article : undefined) },
                threadResolver: { resolve: async () => RA.ok({ currentPost: null, ancestors: [], descendants: [] }) },
                articleBodyResolver: {
                  resolve: async () =>
                    RA.ok({
                      articleId: article.articleId,
                      privateHtml: '<p>private</p>',
                      publicHtml: '<p>public</p>',
                      updatedAt: createdAt,
                    }),
                },
              }),
              getArticlesUseCase: { run: async () => RA.ok({ articles: [article], authorUsername: 'kosui' }) },
              createArticleUseCase: unused,
              publishArticleUseCase: unused,
              unpublishArticleUseCase: unused,
              deleteArticleUseCase: unused,
              publishedArticlesResolver: {
                resolve: async () =>
                  RA.ok({ articles: [{ ...article, status: 'published' }], authorUsername: Username.orThrow('kosui') }),
              },
              digestHeaderResolverByArticleId: {
                resolve: async (id) => RA.ok(digest?.articleId === id ? digest : undefined),
              },
              digestHeadersResolverByArticleIds: {
                resolve: async (ids) => RA.ok(digest !== undefined && ids.includes(digest.articleId) ? [digest] : []),
              },
              digestResolverByUserIdAndDigestDate: {
                resolve: async ({ userId, digestDate }) =>
                  RA.ok(digest?.userId === userId && digest.digestDate === digestDate ? digest : undefined),
              },
              sessionResolver,
              createContext: () => createMockRequestContext(),
            }),
          );
        },
        serveAsset: async () => undefined,
        serveUpload: async () => undefined,
        serveOgImage: async () => new Response('not implemented', { status: 501 }),
      });
    };

    const getDetail = async (app: ReturnType<typeof createApp>, article: Article, sessionId?: SessionId) =>
      (await app.request(`https://worker.test/api/v1/articles/${article.articleId}`, {
        headers: sessionId === undefined ? undefined : { Cookie: `sessionId=${sessionId}` },
      })).json() as Promise<Record<string, unknown>>;

    it('作者がダイジェストの article を開くと、公開版で除く項目の件数を返す', async () => {
      const article = createArticle('draft');

      const body = await getDetail(createApp(article, createDigest(article, 2)), article, authorSessionId);

      expect(body.digest).toEqual({
        digestDate: '2026-11-05',
        excluded: { timelineLinks: 2, hatena: 1, hatenaCounts: true, recommendations: false },
      });
    });

    it('おすすめの項目があれば recommendations を true にする', async () => {
      const article = createArticle('draft');

      const body = await getDetail(
        createApp(article, createDigest(article, 2, 'interest-source-1')),
        article,
        authorSessionId,
      );

      expect(body.digest).toMatchObject({ excluded: { recommendations: true } });
    });

    it('新着の項目がなければ hatenaCounts を false にする', async () => {
      const article = createArticle('draft');

      const body = await getDetail(createApp(article, createDigest(article, 0)), article, authorSessionId);

      expect(body.digest).toMatchObject({ excluded: { hatenaCounts: false } });
    });

    it('公開中のダイジェストでも、匿名には digest を付けない', async () => {
      const article = createArticle('published');

      const body = await getDetail(createApp(article, createDigest(article, 2)), article);

      expect(body).not.toHaveProperty('digest');
      expect(body).toHaveProperty('article');
    });

    it('公開中のダイジェストでも、作者以外には digest を付けない', async () => {
      const article = createArticle('published');

      const body = await getDetail(createApp(article, createDigest(article, 2)), article, otherSessionId);

      expect(body).not.toHaveProperty('digest');
    });

    it('ダイジェストでない article には、作者でも digest を付けない', async () => {
      const article = createArticle('draft');

      const body = await getDetail(createApp(article, undefined), article, authorSessionId);

      expect(body).not.toHaveProperty('digest');
    });

    it('作者の一覧には article ごとの isDigest を付ける', async () => {
      const article = createArticle('draft');
      const cookie = { Cookie: `sessionId=${authorSessionId}` };

      const digestList = await createApp(article, createDigest(article, 1)).request(
        'https://worker.test/api/v1/articles',
        {
          headers: cookie,
        },
      );
      const plainList = await createApp(article, undefined).request('https://worker.test/api/v1/articles', {
        headers: cookie,
      });

      await expect(digestList.json()).resolves.toMatchObject({
        articles: [{ articleId: article.articleId, isDigest: true }],
      });
      await expect(plainList.json()).resolves.toMatchObject({
        articles: [{ articleId: article.articleId, isDigest: false }],
      });
    });

    it('匿名の一覧には isDigest を付けない', async () => {
      const article = createArticle('published');

      const response = await createApp(article, createDigest(article, 1)).request(
        'https://worker.test/api/v1/articles',
      );

      const body = await response.json() as { articles: Array<Record<string, unknown>> };
      expect(body.articles[0]).not.toHaveProperty('isDigest');
    });
  });
});
