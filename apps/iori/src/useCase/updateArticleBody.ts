import { RA, type Result } from '@iwasa-kosui/result';
import z from 'zod/v4';

import { sanitizeArticleBody } from '../adaptor/routes/helper/sanitizeArticleBody.ts';
import { ArticleInvalidStatusError, ArticleNotFoundError, type ArticleResolver } from '../domain/article/article.ts';
import type { ArticleId } from '../domain/article/articleId.ts';
import { ArticleBody, type ArticleBodyWrittenStore } from '../domain/articleBody/articleBody.ts';
import { Instant } from '../domain/instant/instant.ts';
import { Schema } from '../helper/schema.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  articleId: ArticleId;
  privateHtml: string;
  publicHtml: string;
}>;

const Ok = Schema.create(
  z.object({
    body: ArticleBody.zodType,
  }),
);
type Ok = z.infer<typeof Ok.zodType>;

type Err = ArticleNotFoundError | ArticleInvalidStatusError;

export type UpdateArticleBodyUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  articleResolver: ArticleResolver;
  articleBodyWrittenStore: ArticleBodyWrittenStore;
}>;

const create = ({
  articleResolver,
  articleBodyWrittenStore,
}: Deps): UpdateArticleBodyUseCase => {
  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind('article', async ({ articleId }) => {
        const article = await articleResolver.resolve(articleId);
        if (!article.ok) {
          return article;
        }
        if (article.val === undefined || article.val.rootPostId !== null) {
          return RA.err(ArticleNotFoundError.create(articleId));
        }
        return RA.ok(article.val);
      }),
      RA.andThen(async ({ article, privateHtml, publicHtml }): Promise<Result<Ok, Err>> => {
        if (article.status === 'published') {
          return RA.err(
            ArticleInvalidStatusError.create(article.articleId, article.status, ['draft', 'unpublished']),
          );
        }
        const event = ArticleBody.writeArticleBody(Instant.now())({
          articleId: article.articleId,
          privateHtml: sanitizeArticleBody(privateHtml),
          publicHtml: sanitizeArticleBody(publicHtml),
        });
        await articleBodyWrittenStore.store(event);
        return RA.ok({ body: event.aggregateState });
      }),
    );

  return { run };
};

export const UpdateArticleBodyUseCase = {
  create,
} as const;
