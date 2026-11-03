import type { ArticleWithDependentsDeletedStore } from '../../../domain/article/article.ts';
import { singleton } from '../../../helper/singleton.ts';
import { PgArticleDeletedStore } from './articleDeletedStore.ts';

const getInstance = singleton((): ArticleWithDependentsDeletedStore => ({
  store: (articleDeleted) => PgArticleDeletedStore.getInstance().store(articleDeleted),
}));

export const PgArticleWithDependentsDeletedStore = {
  getInstance,
} as const;
