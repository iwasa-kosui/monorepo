import { RA } from '@iwasa-kosui/result';
import z from 'zod/v4';

import type { ThreadResolver } from '../adaptor/pg/post/threadResolver.ts';
import { Article, ArticleNotFoundError, type ArticleResolver } from '../domain/article/article.ts';
import { ArticleId } from '../domain/article/articleId.ts';
import type { PostWithAuthor } from '../domain/post/post.ts';
import { Schema } from '../helper/schema.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  articleId: ArticleId;
}>;

const Ok = Schema.create(
  z.object({
    article: Article.zodType,
    thread: z.array(z.custom<PostWithAuthor>()),
  }),
);
type Ok = z.infer<typeof Ok.zodType>;

type Err = ArticleNotFoundError;

export type GetArticleWithThreadUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  articleResolver: ArticleResolver;
  threadResolver: ThreadResolver;
}>;

const create = ({
  articleResolver,
  threadResolver,
}: Deps): GetArticleWithThreadUseCase => {
  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind('article', async ({ articleId }) => {
        const article = await articleResolver.resolve(articleId);
        if (!article.ok) {
          return article;
        }
        if (article.val === undefined) {
          return RA.err(ArticleNotFoundError.create(articleId));
        }
        return RA.ok(article.val);
      }),
      RA.andBind('threadData', async ({ article }) => {
        const threadData = await threadResolver.resolve({ postId: article.rootPostId });
        if (!threadData.ok) {
          return threadData;
        }
        return RA.ok(threadData.val);
      }),
      RA.map(({ article, threadData }) => {
        const { currentPost, ancestors, descendants } = threadData;
        const thread: PostWithAuthor[] = [
          ...ancestors,
          ...(currentPost ? [currentPost] : []),
          ...descendants,
        ];
        return { article, thread };
      }),
    );

  return { run };
};

export const GetArticleWithThreadUseCase = {
  create,
} as const;
