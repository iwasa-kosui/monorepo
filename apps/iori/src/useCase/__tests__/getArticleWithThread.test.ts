import { RA } from '@iwasa-kosui/result';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { ActorId } from '../../domain/actor/actorId.ts';
import type { Article, ArticleResolver, ArticleStatus } from '../../domain/article/article.ts';
import { ArticleId } from '../../domain/article/articleId.ts';
import type { ArticleBody, ArticleBodyResolver } from '../../domain/articleBody/articleBody.ts';
import type { DigestXPost, DigestXPostsResolverByArticleId } from '../../domain/digest/digest.ts';
import { XUsername } from '../../domain/feedSource/xUsername.ts';
import { Instant } from '../../domain/instant/instant.ts';
import type { PostWithAuthor, ThreadResolver } from '../../domain/post/post.ts';
import { PostId } from '../../domain/post/postId.ts';
import { UserId } from '../../domain/user/userId.ts';
import { Username } from '../../domain/user/username.ts';
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

const createDeps = (article: Article | undefined, body?: ArticleBody) => {
  const articleResolver: ArticleResolver = {
    resolve: vi.fn(async (articleId: ArticleId) =>
      RA.ok(article?.articleId === articleId ? article : undefined)
    ) as unknown as ArticleResolver['resolve'],
  };
  const resolveThread = vi.fn(async () => RA.ok({ currentPost: null, ancestors: [], descendants: [] }));
  const threadResolver: ThreadResolver = { resolve: resolveThread as unknown as ThreadResolver['resolve'] };
  const resolveBody = vi.fn(async () => RA.ok(body));
  const articleBodyResolver: ArticleBodyResolver = {
    resolve: resolveBody as unknown as ArticleBodyResolver['resolve'],
  };
  return { articleResolver, threadResolver, resolveThread, articleBodyResolver, resolveBody };
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
      markdown: null,
      updatedAt: Instant.orThrow(Date.parse('2026-08-05T00:00:00.000Z')),
    });
    const createBodyDeps = (article: Article, body: ArticleBody | undefined) => createDeps(article, body);

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

    it('body に本文の updatedAt を含める', async () => {
      const article = createBodyArticle('draft');
      const body = createBody(article);

      const result = await GetArticleWithThreadUseCase.create(createBodyDeps(article, body)).run({
        articleId: article.articleId,
        viewerUserId: authorUserId,
      });

      expect(result).toMatchObject({ ok: true, val: { body: { updatedAt: body.updatedAt } } });
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

    describe('X の投稿', () => {
      const xPostsOf = (...titles: string[]) =>
        titles.map((title, index) => ({
          username: XUsername.orThrow('jack'),
          title,
          url: `https://x.com/jack/status/${index + 1}`,
        }));
      const createXDeps = (article: Article, posts: ReadonlyArray<DigestXPost>) => {
        const resolveXPosts = vi.fn(async () => RA.ok(posts));
        const digestXPostsResolverByArticleId: DigestXPostsResolverByArticleId = {
          resolve: resolveXPosts as unknown as DigestXPostsResolverByArticleId['resolve'],
        };
        return { ...createBodyDeps(article, createBody(article)), digestXPostsResolverByArticleId, resolveXPosts };
      };

      it.each(['draft', 'unpublished'] as const)(
        '作者が %s を開くと、private_html の後ろに「X の投稿」の節を足す',
        async (status) => {
          const article = createBodyArticle(status);
          const deps = createXDeps(article, xPostsOf('first', 'second'));

          const result = await GetArticleWithThreadUseCase.create(deps).run({
            articleId: article.articleId,
            viewerUserId: authorUserId,
          });

          expect(result).toMatchObject({
            ok: true,
            val: {
              body: {
                html: '<p>private</p><h2>X の投稿</h2><ul>'
                  + '<li>@jack <a href="https://x.com/jack/status/1">first</a></li>'
                  + '<li>@jack <a href="https://x.com/jack/status/2">second</a></li></ul>',
              },
            },
          });
          expect(deps.resolveXPosts).toHaveBeenCalledWith(article.articleId);
        },
      );

      it('投稿が1件も残っていなければ、節を足さない', async () => {
        const article = createBodyArticle('draft');
        const deps = createXDeps(article, []);

        const result = await GetArticleWithThreadUseCase.create(deps).run({
          articleId: article.articleId,
          viewerUserId: authorUserId,
        });

        expect(result).toMatchObject({ ok: true, val: { body: { html: '<p>private</p>' } } });
      });

      it('published の記事には、作者が開いても節を足さず、投稿を引かない', async () => {
        const article = createBodyArticle('published');
        const deps = createXDeps(article, xPostsOf('first'));

        const result = await GetArticleWithThreadUseCase.create(deps).run({
          articleId: article.articleId,
          viewerUserId: authorUserId,
        });

        expect(result).toMatchObject({ ok: true, val: { body: { html: '<p>public</p>' } } });
        expect(deps.resolveXPosts).not.toHaveBeenCalled();
      });

      it('作者以外のユーザーと匿名には、draft を見せず、投稿を引かない', async () => {
        const article = createBodyArticle('draft');
        const deps = createXDeps(article, xPostsOf('first'));
        const useCase = GetArticleWithThreadUseCase.create(deps);

        const other = await useCase.run({ articleId: article.articleId, viewerUserId: otherUserId });
        const anonymous = await useCase.run({ articleId: article.articleId });

        for (const result of [other, anonymous]) {
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.err.type).toBe('ArticleNotFoundError');
        }
        expect(deps.resolveXPosts).not.toHaveBeenCalled();
      });

      it('投稿を引く resolver を渡さなければ、private_html のままにする', async () => {
        const article = createBodyArticle('draft');

        const result = await GetArticleWithThreadUseCase.create(createBodyDeps(article, createBody(article))).run({
          articleId: article.articleId,
          viewerUserId: authorUserId,
        });

        expect(result).toMatchObject({ ok: true, val: { body: { html: '<p>private</p>' } } });
      });
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

    it('articleBodyResolver が欠けると型エラーになる', () => {
      const { articleBodyResolver: _resolver, ...withoutResolver } = createDeps(undefined);
      type CreateDeps = Parameters<typeof GetArticleWithThreadUseCase.create>[0];

      expectTypeOf(withoutResolver).not.toExtend<CreateDeps>();
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

  describe('スレッドの閲覧者による絞り込み', () => {
    const postBase = {
      createdAt: Instant.orThrow(Date.parse('2026-08-05T00:00:00.000Z')),
      inReplyToUri: null,
      summary: null,
      sensitive: false,
      username: Username.orThrow('alice'),
      logoUri: undefined,
      liked: false,
      reposted: false,
      images: [],
      likeCount: 0,
      repostCount: 0,
      reactions: [],
      linkPreviews: [],
    };
    const remotePost = (content: string, visibility: 'public' | 'unlisted' | 'private' | 'direct' | null) =>
      ({
        ...postBase,
        type: 'remote',
        postId: PostId.generate(),
        actorId: ActorId.generate(),
        uri: `https://remote.example/notes/${content}`,
        content,
        visibility,
      }) satisfies PostWithAuthor;
    const localPost = (content: string) =>
      ({
        ...postBase,
        type: 'local',
        postId: PostId.generate(),
        actorId: ActorId.generate(),
        userId: authorUserId,
        content,
      }) satisfies PostWithAuthor;

    const setup = () => {
      const article = createArticle('published', authorUserId);
      const root = localPost('root');
      const publicReply = remotePost('public', 'public');
      const unlistedReply = remotePost('unlisted', 'unlisted');
      const directReply = remotePost('direct', 'direct');
      const privateReply = remotePost('private', 'private');
      const unknownReply = remotePost('unknown', null);
      const resolveThread = vi.fn(async (input: { onlyVisibleToViewer?: boolean }) =>
        RA.ok({
          currentPost: root,
          ancestors: [],
          descendants: input.onlyVisibleToViewer === true
            ? [publicReply, directReply, unlistedReply]
            : [publicReply, directReply, privateReply, unknownReply, unlistedReply],
        })
      );
      const deps = {
        ...createDeps(article),
        resolveThread,
        threadResolver: { resolve: resolveThread as unknown as ThreadResolver['resolve'] },
      };
      return { article, deps, root, publicReply, unlistedReply, directReply, privateReply, unknownReply };
    };

    it('匿名にはローカルの投稿と public と unlisted の投稿だけを返す', async () => {
      const { article, deps, root, publicReply, unlistedReply } = setup();

      const result = await GetArticleWithThreadUseCase.create(deps).run({ articleId: article.articleId });

      expect(result.ok && result.val.thread).toEqual([root, publicReply, unlistedReply]);
      expect(deps.resolveThread).toHaveBeenCalledWith({ postId: article.rootPostId });
    });

    it('ログイン中の閲覧者には currentActorId と onlyVisibleToViewer をリゾルバーに渡し、宛先の direct を返す', async () => {
      const { article, deps, root, publicReply, directReply, unlistedReply } = setup();
      const currentActorId = ActorId.generate();

      const result = await GetArticleWithThreadUseCase.create(deps).run({
        articleId: article.articleId,
        currentActorId,
      });

      expect(deps.resolveThread).toHaveBeenCalledWith({
        postId: article.rootPostId,
        currentActorId,
        onlyVisibleToViewer: true,
      });
      expect(result.ok && result.val.thread).toEqual([root, publicReply, directReply, unlistedReply]);
    });
  });
});
