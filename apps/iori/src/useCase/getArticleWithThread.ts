import { RA, type Result } from '@iwasa-kosui/result';
import z from 'zod/v4';

import type { ActorId } from '../domain/actor/actorId.ts';
import { Article, ArticleNotFoundError, type ArticleResolver } from '../domain/article/article.ts';
import { ArticleId } from '../domain/article/articleId.ts';
import type { ArticleBodyResolver } from '../domain/articleBody/articleBody.ts';
import type { DigestXPostsResolverByArticleId } from '../domain/digest/digest.ts';
import { buildXPostsSection } from '../domain/digest/digestBody.ts';
import { Instant } from '../domain/instant/instant.ts';
import { Post, type PostWithAuthor, type ThreadResolver } from '../domain/post/post.ts';
import type { UserId } from '../domain/user/userId.ts';
import { Schema } from '../helper/schema.ts';
import type { IsDigestOwner } from './isDigestOwner.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  articleId: ArticleId;
  viewerUserId?: UserId;
  currentActorId?: ActorId;
}>;

const Ok = Schema.create(
  z.object({
    article: Article.zodType,
    thread: z.array(z.custom<PostWithAuthor>()),
    body: z.object({ html: z.string(), updatedAt: Instant.zodType }).optional(),
    hasXPosts: z.literal(true).optional(),
  }),
);
type Ok = z.infer<typeof Ok.zodType>;

type Err = ArticleNotFoundError;

export type GetArticleWithThreadUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  articleResolver: ArticleResolver;
  threadResolver: ThreadResolver;
  articleBodyResolver: ArticleBodyResolver;
  digestXPostsResolverByArticleId?: DigestXPostsResolverByArticleId;
  isDigestOwner?: IsDigestOwner;
  now?: () => Instant;
}>;

const create = ({
  articleResolver,
  threadResolver,
  articleBodyResolver,
  digestXPostsResolverByArticleId,
  isDigestOwner,
  now = Instant.now,
}: Deps): GetArticleWithThreadUseCase => {
  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind('article', async ({ articleId, viewerUserId }) => {
        const article = await articleResolver.resolve(articleId);
        if (!article.ok) {
          return article;
        }
        if (article.val === undefined) {
          return RA.err(ArticleNotFoundError.create(articleId));
        }
        if (article.val.status !== 'published' && article.val.authorUserId !== viewerUserId) {
          return RA.err(ArticleNotFoundError.create(articleId));
        }
        return RA.ok(article.val);
      }),
      RA.andThen(async ({ article, currentActorId, viewerUserId }): Promise<Result<Ok, Err>> => {
        if (article.rootPostId === null) {
          const body = await articleBodyResolver.resolve(article.articleId);
          if (!body.ok) {
            return body;
          }
          if (body.val === undefined) {
            return RA.err(ArticleNotFoundError.create(article.articleId));
          }
          if (article.status === 'published') {
            return RA.ok({ article, thread: [], body: { html: body.val.publicHtml, updatedAt: body.val.updatedAt } });
          }
          const xPosts = digestXPostsResolverByArticleId !== undefined && isDigestOwner !== undefined
              && await isDigestOwner(viewerUserId)
            ? await digestXPostsResolverByArticleId.resolve({ articleId: article.articleId, now: now() })
            : undefined;
          if (xPosts !== undefined && !xPosts.ok) {
            return xPosts;
          }
          const section = xPosts === undefined ? '' : buildXPostsSection(xPosts.val);
          return RA.ok({
            article,
            thread: [],
            body: { html: body.val.privateHtml + section, updatedAt: body.val.updatedAt },
            ...(section === '' ? {} : { hasXPosts: true as const }),
          });
        }
        const threadData = await threadResolver.resolve({
          postId: article.rootPostId,
          ...(currentActorId === undefined ? {} : { currentActorId, onlyVisibleToViewer: true }),
        });
        if (!threadData.ok) {
          return threadData;
        }
        const { currentPost, ancestors, descendants } = threadData.val;
        const posts: PostWithAuthor[] = [
          ...ancestors,
          ...(currentPost ? [currentPost] : []),
          ...descendants,
        ];
        const thread = currentActorId === undefined ? posts.filter(Post.isVisibleToAnonymous) : posts;
        return RA.ok({ article, thread });
      }),
    );

  return { run };
};

export const GetArticleWithThreadUseCase = {
  create,
} as const;
