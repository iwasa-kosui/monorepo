import { RA, type Result } from '@iwasa-kosui/result';
import z from 'zod/v4';

import { Article, ArticleNotFoundError, type ArticleResolver } from '../domain/article/article.ts';
import { ArticleId } from '../domain/article/articleId.ts';
import type { ArticleBodyResolver } from '../domain/articleBody/articleBody.ts';
import type { PostWithAuthor, ThreadResolver } from '../domain/post/post.ts';
import type { UserId } from '../domain/user/userId.ts';
import { Schema } from '../helper/schema.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  articleId: ArticleId;
  viewerUserId?: UserId;
}>;

const Ok = Schema.create(
  z.object({
    article: Article.zodType,
    thread: z.array(z.custom<PostWithAuthor>()),
    body: z.object({ html: z.string() }).optional(),
  }),
);
type Ok = z.infer<typeof Ok.zodType>;

type Err = ArticleNotFoundError;

export type GetArticleWithThreadUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  articleResolver: ArticleResolver;
  threadResolver: ThreadResolver;
  articleBodyResolver?: ArticleBodyResolver;
}>;

const create = ({
  articleResolver,
  threadResolver,
  articleBodyResolver,
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
      RA.andThen(async ({ article }): Promise<Result<Ok, Err>> => {
        if (article.rootPostId === null) {
          if (articleBodyResolver === undefined) {
            return RA.err(ArticleNotFoundError.create(article.articleId));
          }
          const body = await articleBodyResolver.resolve(article.articleId);
          if (!body.ok) {
            return body;
          }
          if (body.val === undefined) {
            return RA.err(ArticleNotFoundError.create(article.articleId));
          }
          const html = article.status === 'published' ? body.val.publicHtml : body.val.privateHtml;
          return RA.ok({ article, thread: [], body: { html } });
        }
        const threadData = await threadResolver.resolve({ postId: article.rootPostId });
        if (!threadData.ok) {
          return threadData;
        }
        const { currentPost, ancestors, descendants } = threadData.val;
        const thread: PostWithAuthor[] = [
          ...ancestors,
          ...(currentPost ? [currentPost] : []),
          ...descendants,
        ];
        return RA.ok({ article, thread });
      }),
    );

  return { run };
};

export const GetArticleWithThreadUseCase = {
  create,
} as const;
