import { RA, type Result } from '@iwasa-kosui/result';
import z from 'zod/v4';

import { ArticleNotFoundError, type ArticleResolver } from '../domain/article/article.ts';
import type { ArticleId } from '../domain/article/articleId.ts';
import type { ArticleBodyResolver } from '../domain/articleBody/articleBody.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { UserId } from '../domain/user/userId.ts';
import { Schema } from '../helper/schema.ts';
import { type EditableArticleError, resolveEditableArticleWith } from './helper/resolveEditableArticle.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  userId: UserId;
  articleId: ArticleId;
}>;

const Ok = Schema.create(
  z.object({
    title: z.string(),
    markdown: z.string(),
    updatedAt: Instant.zodType,
  }),
);
type Ok = z.infer<typeof Ok.zodType>;

type Err = EditableArticleError;

export type GetArticleForEditUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  articleResolver: ArticleResolver;
  articleBodyResolver: ArticleBodyResolver;
  htmlToMarkdown: (html: string) => string;
}>;

const create = ({
  articleResolver,
  articleBodyResolver,
  htmlToMarkdown,
}: Deps): GetArticleForEditUseCase => {
  const resolveEditableArticle = resolveEditableArticleWith(articleResolver);

  const run = async ({ userId, articleId }: Input): Promise<Result<Ok, Err>> => {
    const editable = await resolveEditableArticle(userId, articleId);
    if (!editable.ok) return editable;

    const body = await articleBodyResolver.resolve(articleId);
    if (!body.ok) return body;
    if (body.val === undefined) return RA.err(ArticleNotFoundError.create(articleId));

    return RA.ok({
      title: editable.val.title,
      markdown: body.val.markdown ?? htmlToMarkdown(body.val.publicHtml),
      updatedAt: body.val.updatedAt,
    });
  };

  return { run };
};

export const GetArticleForEditUseCase = {
  create,
} as const;
