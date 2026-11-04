import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { createIoriApp } from '../../../appFactory.tsx';
import { ActorId } from '../../../domain/actor/actorId.ts';
import type { Article, ArticleStatus } from '../../../domain/article/article.ts';
import { ArticleId } from '../../../domain/article/articleId.ts';
import { Digest } from '../../../domain/digest/digest.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { Username } from '../../../domain/user/username.ts';
import { createMockRequestContext } from '../../../useCase/__tests__/helper/mockAdaptors.ts';
import type { CreateArticleUseCase } from '../../../useCase/createArticle.ts';
import type { DeleteArticleUseCase } from '../../../useCase/deleteArticle.ts';
import type { GetArticlesUseCase } from '../../../useCase/getArticles.ts';
import { GetArticleWithThreadUseCase } from '../../../useCase/getArticleWithThread.ts';
import type { PublishArticleUseCase } from '../../../useCase/publishArticle.ts';
import type { UnpublishArticleUseCase } from '../../../useCase/unpublishArticle.ts';
import { createMastodonAuthn, type MastodonAuthn } from '../mastodonAuthn.ts';
import { createWorkerIoriArticlesRouter, type WorkerIoriArticlesRouterDeps } from '../workerIoriArticlesRouter.ts';
import { createOAuthHarness } from './helper/oauthHarness.ts';

const origin = 'https://worker.test';
const articlesPath = `${origin}/api/iori/v1/articles`;
const sameOrigin = { Origin: origin };
const unused = { run: async () => RA.err({}) } as never;

const createAuth = () => {
  const harness = createOAuthHarness();
  const authn = createMastodonAuthn({
    verifyAccessTokenUseCase: harness.memory.useCases.verifyAccessTokenUseCase,
    sessionResolver: harness.memory.sessionResolver as never,
  });
  const cookieFor = (userId: UserId, expires?: Instant) =>
    `sessionId=${harness.memory.addSession(userId, expires).sessionId}`;
  const bearerFor = async (scope: string) => {
    const issued = await harness.issueUserToken(scope);
    return { userId: issued.userId, headers: { Authorization: `Bearer ${issued.token}` } };
  };
  return { authn, cookieFor, bearerFor };
};

const createApp = (authn: MastodonAuthn, deps: Partial<Omit<WorkerIoriArticlesRouterDeps, 'authn'>> = {}) =>
  createIoriApp({
    federationMiddleware: undefined,
    registerRoutes: (router) => {
      router.route(
        '/api',
        createWorkerIoriArticlesRouter({
          getArticleWithThreadUseCase: unused,
          getArticlesUseCase: unused,
          createArticleUseCase: unused,
          publishArticleUseCase: unused,
          unpublishArticleUseCase: unused,
          deleteArticleUseCase: unused,
          publishedArticlesResolver: { resolve: async () => RA.ok({ articles: [], authorUsername: null }) },
          createContext: () => createMockRequestContext(),
          ...deps,
          authn,
        }),
      );
    },
    serveAsset: async () => undefined,
    serveUpload: async () => undefined,
    serveOgImage: async () => new Response('not implemented', { status: 501 }),
  });

describe('createWorkerIoriArticlesRouter', () => {
  const articleId = ArticleId.generate();
  const actorId = ActorId.generate();
  const rootPostId = PostId.generate();
  const createdAt = Instant.orThrow(Date.parse('2026-08-05T00:00:00.000Z'));
  const draftOf = (authorUserId: UserId) => ({
    articleId,
    authorActorId: actorId,
    authorUserId,
    rootPostId,
    title: 'D1 article',
    status: 'draft' as const,
    createdAt,
    publishedAt: null,
    unpublishedAt: null,
  });

  const createAuthoringApp = (auth: ReturnType<typeof createAuth>, authorUserId: UserId) => {
    const article = draftOf(authorUserId);
    const getArticleWithThreadUseCase: GetArticleWithThreadUseCase = {
      run: async () =>
        RA.ok({
          article: { ...article, status: 'published' as const, publishedAt: createdAt },
          thread: [{
            type: 'local',
            postId: rootPostId,
            actorId,
            userId: authorUserId,
            content:
              '<p>thread <a href="https://example.com/x" onclick="alert(1)">link</a></p><script>alert(1)</script>',
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
      run: vi.fn(async () => RA.ok({ articles: [article], authorUsername: 'kosui' })),
    };
    const createArticleUseCase: CreateArticleUseCase = { run: vi.fn(async () => RA.ok({ article })) };
    const publishArticleUseCase: PublishArticleUseCase = {
      run: async () => RA.ok({ article: { ...article, status: 'published', publishedAt: createdAt } }),
    };
    const unpublishArticleUseCase: UnpublishArticleUseCase = {
      run: async () => RA.ok({ article: { ...article, status: 'unpublished', unpublishedAt: createdAt } }),
    };
    const deleteArticleUseCase: DeleteArticleUseCase = { run: async () => RA.ok({ success: true }) };
    const publishOgImage = vi.fn(async () => undefined);
    const app = createApp(auth.authn, {
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
    });
    return { app, article, getArticlesUseCase, createArticleUseCase, publishOgImage };
  };

  it('serves public listing and authenticated article authoring contracts', async () => {
    const auth = createAuth();
    const authorUserId = UserId.generate();
    const cookie = auth.cookieFor(authorUserId);
    const { app, article, getArticlesUseCase, createArticleUseCase, publishOgImage } = createAuthoringApp(
      auth,
      authorUserId,
    );
    const writeHeaders = { Cookie: cookie, ...sameOrigin };

    const publicList = await app.request(articlesPath);
    const privateList = await app.request(articlesPath, { headers: { Cookie: cookie } });
    const detail = await app.request(`${articlesPath}/${articleId}`);
    const create = await app.request(articlesPath, {
      method: 'POST',
      headers: { ...writeHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ rootPostId, title: article.title }),
    });
    const publish = await app.request(`${articlesPath}/${articleId}/publish`, {
      method: 'POST',
      headers: writeHeaders,
    });
    const unpublish = await app.request(`${articlesPath}/${articleId}/unpublish`, {
      method: 'POST',
      headers: writeHeaders,
    });
    const remove = await app.request(`${articlesPath}/${articleId}`, { method: 'DELETE', headers: writeHeaders });

    await expect(publicList.json()).resolves.toMatchObject({ articles: [{ status: 'published' }] });
    await expect(privateList.json()).resolves.toMatchObject({ articles: [{ status: 'draft' }] });
    expect(getArticlesUseCase.run).toHaveBeenCalledExactlyOnceWith({ userId: authorUserId });
    await expect(detail.json()).resolves.toMatchObject({
      article: { status: 'published' },
      thread: [{ content: '<p>thread <a href="https://example.com/x">link</a></p>' }],
    });
    await expect(create.json()).resolves.toEqual({ article });
    expect(createArticleUseCase.run).toHaveBeenCalledExactlyOnceWith({
      userId: authorUserId,
      rootPostId,
      title: article.title,
    });
    await expect(publish.json()).resolves.toMatchObject({ article: { status: 'published' } });
    expect(publishOgImage).toHaveBeenCalledWith(expect.objectContaining({ articleId, title: article.title }));
    await expect(unpublish.json()).resolves.toMatchObject({ article: { status: 'unpublished' } });
    await expect(remove.json()).resolves.toEqual({ success: true });
  });

  describe('Bearer トークンと scope', () => {
    const jsonBody = JSON.stringify({ rootPostId, title: 'D1 article' });
    const writeRequests = {
      create: (headers: Record<string, string>) =>
        new Request(articlesPath, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: jsonBody,
        }),
      publish: (headers: Record<string, string>) =>
        new Request(`${articlesPath}/${articleId}/publish`, { method: 'POST', headers }),
      unpublish: (headers: Record<string, string>) =>
        new Request(`${articlesPath}/${articleId}/unpublish`, { method: 'POST', headers }),
      delete: (headers: Record<string, string>) =>
        new Request(`${articlesPath}/${articleId}`, { method: 'DELETE', headers }),
    };

    it('write:statuses の Bearer トークンで article を作成できる', async () => {
      const auth = createAuth();
      const me = await auth.bearerFor('write:statuses');
      const { app, article, createArticleUseCase } = createAuthoringApp(auth, me.userId);

      const response = await app.request(writeRequests.create(me.headers));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ article });
      expect(createArticleUseCase.run).toHaveBeenCalledExactlyOnceWith({
        userId: me.userId,
        rootPostId,
        title: article.title,
      });
    });

    it.each(Object.keys(writeRequests) as Array<keyof typeof writeRequests>)(
      '%s は write:statuses を満たさない scope のトークンを 403 にする',
      async (operation) => {
        const auth = createAuth();
        const me = await auth.bearerFor('read:statuses');
        const { app, createArticleUseCase } = createAuthoringApp(auth, me.userId);

        const response = await app.request(writeRequests[operation](me.headers));

        expect(response.status).toBe(403);
        await expect(response.json()).resolves.toEqual({ error: 'This action is outside the authorized scopes' });
        expect(createArticleUseCase.run).not.toHaveBeenCalled();
      },
    );

    it.each(Object.keys(writeRequests) as Array<keyof typeof writeRequests>)(
      '%s は認証なしだと 401 にする',
      async (operation) => {
        const auth = createAuth();
        const { app, createArticleUseCase } = createAuthoringApp(auth, UserId.generate());

        const response = await app.request(writeRequests[operation]({}));

        expect(response.status).toBe(401);
        await expect(response.json()).resolves.toEqual({ error: 'The access token is invalid' });
        expect(createArticleUseCase.run).not.toHaveBeenCalled();
      },
    );

    it('Cookie での書き込みは同一オリジンでなければ 403 にする', async () => {
      const auth = createAuth();
      const authorUserId = UserId.generate();
      const { app, createArticleUseCase } = createAuthoringApp(auth, authorUserId);

      const response = await app.request(writeRequests.create({ Cookie: auth.cookieFor(authorUserId) }));

      expect(response.status).toBe(403);
      expect(createArticleUseCase.run).not.toHaveBeenCalled();
    });

    it.each(['list', 'detail'] as const)(
      'GET %s は read:statuses を満たさない scope のトークンを 403 にする',
      async (kind) => {
        const auth = createAuth();
        const me = await auth.bearerFor('write:statuses');
        const { app } = createAuthoringApp(auth, me.userId);

        const response = await app.request(kind === 'list' ? articlesPath : `${articlesPath}/${articleId}`, {
          headers: me.headers,
        });

        expect(response.status).toBe(403);
      },
    );

    it('GET の一覧は read:statuses の Bearer トークンで作者の article を返す', async () => {
      const auth = createAuth();
      const me = await auth.bearerFor('read:statuses');
      const { app, getArticlesUseCase } = createAuthoringApp(auth, me.userId);

      const response = await app.request(articlesPath, { headers: me.headers });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ articles: [{ status: 'draft' }] });
      expect(getArticlesUseCase.run).toHaveBeenCalledExactlyOnceWith({ userId: me.userId });
    });

    it('無効な Bearer トークンは GET でも 401 にする', async () => {
      const auth = createAuth();
      const { app } = createAuthoringApp(auth, UserId.generate());

      const response = await app.request(articlesPath, { headers: { Authorization: 'Bearer nope' } });

      expect(response.status).toBe(401);
    });
  });

  describe('POST /iori/v1/articles の検証', () => {
    it.each([
      { title: 'no root post' },
      { rootPostId: 'not-a-uuid', title: 'bad root post' },
      { rootPostId: PostId.generate(), title: '' },
      { rootPostId: PostId.generate(), title: 'x'.repeat(201) },
    ])('不正な本文 %j は 400 と { error } にする', async (body) => {
      const auth = createAuth();
      const authorUserId = UserId.generate();
      const { app, createArticleUseCase } = createAuthoringApp(auth, authorUserId);

      const response = await app.request(articlesPath, {
        method: 'POST',
        headers: { Cookie: auth.cookieFor(authorUserId), ...sameOrigin, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: expect.stringMatching(/^Validation failed: /) });
      expect(createArticleUseCase.run).not.toHaveBeenCalled();
    });

    it.each(['publish', 'unpublish'] as const)('%s は不正な article ID を 400 にする', async (operation) => {
      const auth = createAuth();
      const authorUserId = UserId.generate();
      const { app } = createAuthoringApp(auth, authorUserId);

      const response = await app.request(`${articlesPath}/not-an-id/${operation}`, {
        method: 'POST',
        headers: { Cookie: auth.cookieFor(authorUserId), ...sameOrigin },
      });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'Invalid article ID' });
    });
  });

  describe('GET /iori/v1/articles/:articleId の公開範囲', () => {
    const authorUserId = UserId.generate();
    const otherUserId = UserId.generate();
    const createdAt = Instant.orThrow(Date.parse('2026-08-05T00:00:00.000Z'));

    const createArticle = (status: ArticleStatus, authorId: UserId = authorUserId): Article => ({
      articleId: ArticleId.generate(),
      authorActorId: ActorId.generate(),
      authorUserId: authorId,
      rootPostId: PostId.generate(),
      title: 'Visibility article',
      status,
      createdAt,
      publishedAt: status === 'draft' ? null : createdAt,
      unpublishedAt: status === 'unpublished' ? createdAt : null,
    });

    const setup = (article: Article) => {
      const auth = createAuth();
      const app = createApp(auth.authn, {
        getArticleWithThreadUseCase: GetArticleWithThreadUseCase.create({
          articleResolver: { resolve: async (id) => RA.ok(id === article.articleId ? article : undefined) },
          threadResolver: { resolve: async () => RA.ok({ currentPost: null, ancestors: [], descendants: [] }) },
          articleBodyResolver: { resolve: async () => RA.ok(undefined) },
        }),
      });
      return { app, auth };
    };

    const get = (app: ReturnType<typeof createApp>, article: Article, headers?: Record<string, string>) =>
      app.request(`${articlesPath}/${article.articleId}`, headers === undefined ? undefined : { headers });

    it.each(['draft', 'unpublished'] as const)('%s は匿名だと 404 になる', async (status) => {
      const article = createArticle(status);

      expect((await get(setup(article).app, article)).status).toBe(404);
    });

    it.each(['draft', 'unpublished'] as const)('%s は作者以外の Cookie だと 404 になる', async (status) => {
      const article = createArticle(status);
      const { app, auth } = setup(article);

      expect((await get(app, article, { Cookie: auth.cookieFor(otherUserId) })).status).toBe(404);
    });

    it.each(['draft', 'unpublished'] as const)('%s は作者の Cookie だと 200 になる', async (status) => {
      const article = createArticle(status);
      const { app, auth } = setup(article);

      const response = await get(app, article, { Cookie: auth.cookieFor(authorUserId) });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ article: { articleId: article.articleId, status } });
    });

    it.each(['draft', 'unpublished'] as const)('%s は作者の Bearer トークンだと 200 になる', async (status) => {
      const auth = createAuth();
      const me = await auth.bearerFor('read:statuses');
      const article = createArticle(status, me.userId);
      const app = createApp(auth.authn, {
        getArticleWithThreadUseCase: GetArticleWithThreadUseCase.create({
          articleResolver: { resolve: async (id) => RA.ok(id === article.articleId ? article : undefined) },
          threadResolver: { resolve: async () => RA.ok({ currentPost: null, ancestors: [], descendants: [] }) },
          articleBodyResolver: { resolve: async () => RA.ok(undefined) },
        }),
      });

      const response = await get(app, article, me.headers);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ article: { articleId: article.articleId, status } });
    });

    it.each(['draft', 'unpublished'] as const)('%s は作者以外の Bearer トークンだと 404 になる', async (status) => {
      const article = createArticle(status);
      const { app, auth } = setup(article);
      const me = await auth.bearerFor('read:statuses');

      expect((await get(app, article, me.headers)).status).toBe(404);
    });

    it.each(['draft', 'unpublished'] as const)('%s は期限切れの作者の Cookie だと 404 になる', async (status) => {
      const article = createArticle(status);
      const { app, auth } = setup(article);
      const expired = Instant.orThrow(Date.now() - 60_000);

      expect((await get(app, article, { Cookie: auth.cookieFor(authorUserId, expired) })).status).toBe(404);
    });

    it('published は匿名でも 200 になる', async () => {
      const article = createArticle('published');

      expect((await get(setup(article).app, article)).status).toBe(200);
    });

    it('published は形が不正な Cookie でも 200 になる', async () => {
      const article = createArticle('published');

      expect((await get(setup(article).app, article, { Cookie: 'sessionId=not-a-uuid' })).status).toBe(200);
    });

    it('published は存在しない session の Cookie でも 200 になる', async () => {
      const article = createArticle('published');

      expect((await get(setup(article).app, article, { Cookie: `sessionId=${crypto.randomUUID()}` })).status).toBe(200);
    });
  });

  describe('OG 画像の削除', () => {
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

    const createOgApp = (
      options: Readonly<{ succeeds: boolean; deleteOgImage: (articleId: ArticleId) => Promise<void> }>,
    ) => {
      const auth = createAuth();
      const result = () =>
        options.succeeds
          ? RA.ok({ article, success: true as const })
          : RA.err({ type: 'UnauthorizedError' as const, message: 'forbidden' });
      const unpublishArticleUseCase = { run: async () => result() } as unknown as UnpublishArticleUseCase;
      const deleteArticleUseCase = { run: async () => result() } as unknown as DeleteArticleUseCase;
      const app = createApp(auth.authn, {
        unpublishArticleUseCase,
        deleteArticleUseCase,
        deleteOgImage: options.deleteOgImage,
      });
      return { app, headers: { Cookie: auth.cookieFor(UserId.generate()), ...sameOrigin } };
    };

    const requests = {
      unpublish: ({ app, headers }: ReturnType<typeof createOgApp>) =>
        app.request(`${articlesPath}/${articleId}/unpublish`, { method: 'POST', headers }),
      delete: ({ app, headers }: ReturnType<typeof createOgApp>) =>
        app.request(`${articlesPath}/${articleId}`, { method: 'DELETE', headers }),
    };

    it.each(['unpublish', 'delete'] as const)('%s が成功したら OG 画像を削除する', async (operation) => {
      const deleteOgImage = vi.fn(async () => undefined);

      const response = await requests[operation](createOgApp({ succeeds: true, deleteOgImage }));

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

        const response = await requests[operation](createOgApp({ succeeds: true, deleteOgImage }));

        expect(response.status).toBe(200);
        expect(warn).toHaveBeenCalledWith(expect.any(String), { articleId, error });
        warn.mockRestore();
      },
    );

    it.each(['unpublish', 'delete'] as const)('%s が失敗したら OG 画像を削除しない', async (operation) => {
      const deleteOgImage = vi.fn(async () => undefined);

      const response = await requests[operation](createOgApp({ succeeds: false, deleteOgImage }));

      expect(response.status).toBe(403);
      expect(deleteOgImage).not.toHaveBeenCalled();
    });
  });

  describe('本文を持つ article の GET /iori/v1/articles/:articleId', () => {
    const authorUserId = UserId.generate();
    const createdAt = Instant.orThrow(Date.parse('2026-08-05T00:00:00.000Z'));

    const createBodyApp = (status: ArticleStatus) => {
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
      const auth = createAuth();
      const resolveThread = vi.fn(async () => RA.ok({ currentPost: null, ancestors: [], descendants: [] }));
      const app = createApp(auth.authn, {
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
      });
      return { app, article, resolveThread, auth };
    };

    it('作者の draft は private_html を body として返し、出力でもサニタイズする', async () => {
      const { app, article, resolveThread, auth } = createBodyApp('draft');

      const response = await app.request(`${articlesPath}/${article.articleId}`, {
        headers: { Cookie: auth.cookieFor(authorUserId) },
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
      const { app, article } = createBodyApp('published');

      const response = await app.request(`${articlesPath}/${article.articleId}`);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ thread: [], body: { html: '<p>public</p>' } });
    });

    it('匿名の draft は 404 になる', async () => {
      const { app, article } = createBodyApp('draft');

      const response = await app.request(`${articlesPath}/${article.articleId}`);

      expect(response.status).toBe(404);
    });
  });

  describe('GET /iori/v1/articles/:articleId のスレッドの絞り込み', () => {
    const authorUserId = UserId.generate();
    const viewerActorId = ActorId.generate();
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

    const createThreadApp = () => {
      const auth = createAuth();
      const resolveThread = vi.fn(async (input: { onlyVisibleToViewer?: boolean }) =>
        RA.ok({
          currentPost: null,
          ancestors: [],
          descendants: input.onlyVisibleToViewer === true
            ? [post('public', 'public'), post('direct-to-viewer', 'direct')]
            : [post('public', 'public'), post('direct', 'direct'), post('private', 'private'), post('unknown', null)],
        })
      );
      const app = createApp(auth.authn, {
        getArticleWithThreadUseCase: GetArticleWithThreadUseCase.create({
          articleResolver: { resolve: async () => RA.ok(article) },
          threadResolver: { resolve: resolveThread as never },
          articleBodyResolver: { resolve: async () => RA.ok(undefined) },
        }),
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
      });
      return { app, resolveThread, auth };
    };

    const contentsOf = async (response: Response) =>
      ((await response.json()) as { thread: Array<{ content: string }> }).thread.map((item) => item.content);

    it('匿名には宛先外の direct と private と記録のない返信を返さない', async () => {
      const { app } = createThreadApp();

      const response = await app.request(`${articlesPath}/${article.articleId}`);

      expect(await contentsOf(response)).toEqual(['public']);
    });

    it('ログイン中は閲覧者の actor を渡し、宛先の direct を返す', async () => {
      const { app, resolveThread, auth } = createThreadApp();

      const response = await app.request(`${articlesPath}/${article.articleId}`, {
        headers: { Cookie: auth.cookieFor(authorUserId) },
      });

      expect(resolveThread).toHaveBeenCalledWith({
        postId: article.rootPostId,
        currentActorId: viewerActorId,
        onlyVisibleToViewer: true,
      });
      expect(await contentsOf(response)).toEqual(['public', 'direct-to-viewer']);
    });

    it('Bearer トークンでもログイン中と同じく閲覧者の actor を渡す', async () => {
      const { app, resolveThread, auth } = createThreadApp();
      const me = await auth.bearerFor('read:statuses');

      const response = await app.request(`${articlesPath}/${article.articleId}`, { headers: me.headers });

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
          feedbackAt: null,
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

    const createDigestApp = (article: Article, digest: Digest | undefined) => {
      const auth = createAuth();
      const app = createApp(auth.authn, {
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
      });
      return { app, auth };
    };

    const getDetail = async (
      { app }: ReturnType<typeof createDigestApp>,
      article: Article,
      cookie?: string,
    ) =>
      (await app.request(`${articlesPath}/${article.articleId}`, {
        headers: cookie === undefined ? undefined : { Cookie: cookie },
      })).json() as Promise<Record<string, unknown>>;

    it('作者がダイジェストの article を開くと、公開版で除く項目の件数を返す', async () => {
      const article = createArticle('draft');
      const t = createDigestApp(article, createDigest(article, 2));

      const body = await getDetail(t, article, t.auth.cookieFor(authorUserId));

      expect(body.digest).toEqual({
        digestDate: '2026-11-05',
        items: [1, 2].map((rank) => ({
          digestItemId: expect.any(String),
          rank,
          url: `https://example.com/${rank}`,
          title: `entry ${rank}`,
          feedback: null,
        })),
        excluded: { timelineLinks: 2, hatena: 1, hatenaCounts: true, recommendations: false },
      });
    });

    it('反応した項目は feedback を返す', async () => {
      const article = createArticle('draft');
      const digest = createDigest(article, 2);
      const reacted: Digest = {
        ...digest,
        items: digest.items.map((item, index) =>
          index === 0 ? { ...item, feedback: 'interested', feedbackAt: createdAt } : item
        ),
      };
      const t = createDigestApp(article, reacted);

      const body = await getDetail(t, article, t.auth.cookieFor(authorUserId));

      expect(body.digest).toMatchObject({
        items: [
          { rank: 1, feedback: 'interested' },
          { rank: 2, feedback: null },
        ],
      });
    });

    it('おすすめの項目があれば recommendations を true にする', async () => {
      const article = createArticle('draft');
      const t = createDigestApp(article, createDigest(article, 2, 'interest-source-1'));

      const body = await getDetail(t, article, t.auth.cookieFor(authorUserId));

      expect(body.digest).toMatchObject({ excluded: { recommendations: true } });
    });

    it('新着の項目がなければ hatenaCounts を false にする', async () => {
      const article = createArticle('draft');
      const t = createDigestApp(article, createDigest(article, 0));

      const body = await getDetail(t, article, t.auth.cookieFor(authorUserId));

      expect(body.digest).toMatchObject({ excluded: { hatenaCounts: false } });
    });

    it('公開中のダイジェストでも、匿名には digest を付けない', async () => {
      const article = createArticle('published');

      const body = await getDetail(createDigestApp(article, createDigest(article, 2)), article);

      expect(body).not.toHaveProperty('digest');
      expect(body).toHaveProperty('article');
    });

    it('公開中のダイジェストでも、作者以外には digest を付けない', async () => {
      const article = createArticle('published');
      const t = createDigestApp(article, createDigest(article, 2));

      const body = await getDetail(t, article, t.auth.cookieFor(otherUserId));

      expect(body).not.toHaveProperty('digest');
    });

    it('ダイジェストでない article には、作者でも digest を付けない', async () => {
      const article = createArticle('draft');
      const t = createDigestApp(article, undefined);

      const body = await getDetail(t, article, t.auth.cookieFor(authorUserId));

      expect(body).not.toHaveProperty('digest');
    });

    it('作者の一覧には article ごとの isDigest を付ける', async () => {
      const article = createArticle('draft');
      const withDigest = createDigestApp(article, createDigest(article, 1));
      const withoutDigest = createDigestApp(article, undefined);

      const digestList = await withDigest.app.request(articlesPath, {
        headers: { Cookie: withDigest.auth.cookieFor(authorUserId) },
      });
      const plainList = await withoutDigest.app.request(articlesPath, {
        headers: { Cookie: withoutDigest.auth.cookieFor(authorUserId) },
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

      const response = await createDigestApp(article, createDigest(article, 1)).app.request(articlesPath);

      const body = await response.json() as { articles: Array<Record<string, unknown>> };
      expect(body.articles[0]).not.toHaveProperty('isDigest');
    });
  });
});
