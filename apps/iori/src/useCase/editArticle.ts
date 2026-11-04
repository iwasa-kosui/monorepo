import { RA, type Result } from '@iwasa-kosui/result';
import z from 'zod/v4';

import { sanitizeArticleBody } from '../adaptor/routes/helper/sanitizeArticleBody.ts';
import {
  Article,
  ArticleInvalidStatusError,
  type ArticleParseError,
  type ArticleResolver,
  type ArticleWithBodyEditedStore,
} from '../domain/article/article.ts';
import type { ArticleId } from '../domain/article/articleId.ts';
import { ArticleBody } from '../domain/articleBody/articleBody.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { UserId } from '../domain/user/userId.ts';
import { Schema } from '../helper/schema.ts';
import { type EditableArticleError, resolveEditableArticleWith } from './helper/resolveEditableArticle.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  userId: UserId;
  articleId: ArticleId;
  title: string;
  markdown: string;
}>;

const Ok = Schema.create(
  z.object({
    article: Article.zodType,
    body: ArticleBody.zodType,
  }),
);
type Ok = z.infer<typeof Ok.zodType>;

type Err = EditableArticleError | ArticleParseError;

export type EditArticleUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  articleResolver: ArticleResolver;
  articleWithBodyEditedStore: ArticleWithBodyEditedStore;
  renderMarkdown: (markdown: string) => Promise<string>;
}>;

const create = ({
  articleResolver,
  articleWithBodyEditedStore,
  renderMarkdown,
}: Deps): EditArticleUseCase => {
  const resolveEditableArticle = resolveEditableArticleWith(articleResolver);

  const run = async ({ userId, articleId, title, markdown }: Input): Promise<Result<Ok, Err>> => {
    const editable = await resolveEditableArticle(userId, articleId);
    if (!editable.ok) return editable;

    const now = Instant.now();
    const titleChanged = title === editable.val.title
      ? undefined
      : Article.changeArticleTitle(now)(editable.val, title);
    if (titleChanged?.ok === false) return titleChanged;

    const html = sanitizeArticleBody(await renderMarkdown(markdown));
    const bodyWritten = ArticleBody.writeArticleBody(now)({
      articleId,
      privateHtml: html,
      publicHtml: html,
      markdown,
    });
    const stored = await articleWithBodyEditedStore.store(titleChanged?.val, bodyWritten);
    if (!stored.val.edited) {
      return RA.err(ArticleInvalidStatusError.create(articleId, 'published', ['draft', 'unpublished']));
    }
    return RA.ok({
      article: titleChanged?.val.aggregateState ?? editable.val,
      body: bodyWritten.aggregateState,
    });
  };

  return { run };
};

export const EditArticleUseCase = {
  create,
} as const;
