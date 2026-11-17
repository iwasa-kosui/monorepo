import type { Agg } from '../aggregate/index.ts';
import type { Instant } from '../instant/instant.ts';

/** 最近よく読まれている記事。はてなブックマークの数を人気の目安にする */
export type PopularArticle = Readonly<{
  title: string;
  url: string;
  bookmarkCount: number;
  sourceTitle: string;
}>;

export type PopularArticlesResolverByFetchedSince = Agg.Resolver<
  Readonly<{ fetchedSince: Instant; limit: number }>,
  readonly PopularArticle[]
>;

/** 人気の記事として紹介するのは、この期間に集めた記事 */
export const POPULAR_ARTICLE_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;
