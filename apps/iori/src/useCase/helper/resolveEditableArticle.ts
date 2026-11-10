import { RA, type Result } from '@iwasa-kosui/result';

import {
  type Article,
  ArticleInvalidStatusError,
  ArticleNotEditableError,
  ArticleNotFoundError,
  type ArticleResolver,
} from '../../domain/article/article.ts';
import type { ArticleId } from '../../domain/article/articleId.ts';
import type { UserId } from '../../domain/user/userId.ts';

export type EditableArticleError = ArticleNotFoundError | ArticleNotEditableError | ArticleInvalidStatusError;

export const resolveEditableArticleWith =
  (articleResolver: ArticleResolver) =>
  async (userId: UserId, articleId: ArticleId): Promise<Result<Article, EditableArticleError>> => {
    const resolved = await articleResolver.resolve(articleId);
    if (!resolved.ok) return resolved;
    const article = resolved.val;
    if (article === undefined || article.authorUserId !== userId) {
      return RA.err(ArticleNotFoundError.create(articleId));
    }
    if (article.rootPostId !== null) {
      return RA.err(ArticleNotEditableError.create(articleId));
    }
    if (article.status === 'published') {
      return RA.err(ArticleInvalidStatusError.create(articleId, article.status, ['draft', 'unpublished']));
    }
    return RA.ok(article);
  };
