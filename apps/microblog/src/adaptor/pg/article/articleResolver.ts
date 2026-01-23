import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { ActorId } from '../../../domain/actor/actorId.ts';
import type { Article, ArticleResolver } from '../../../domain/article/article.ts';
import type { ArticleStatus } from '../../../domain/article/article.ts';
import type { ArticleId } from '../../../domain/article/articleId.ts';
import type { Instant } from '../../../domain/instant/instant.ts';
import type { PostId } from '../../../domain/post/postId.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { articlesTable } from '../schema.ts';

type ArticleRow = typeof articlesTable.$inferSelect;

const reconstructArticle = (row: ArticleRow): Article => ({
  articleId: row.articleId as ArticleId,
  authorActorId: row.authorActorId as ActorId,
  authorUserId: row.authorUserId as UserId,
  rootPostId: row.rootPostId as PostId,
  title: row.title,
  status: row.status as ArticleStatus,
  createdAt: row.createdAt.getTime() as Instant,
  publishedAt: row.publishedAt ? (row.publishedAt.getTime() as Instant) : null,
  unpublishedAt: row.unpublishedAt ? (row.unpublishedAt.getTime() as Instant) : null,
});

const getInstance = singleton((): ArticleResolver => {
  const resolve = async (articleId: ArticleId) => {
    const [row, ...rest] = await DB.getInstance().select()
      .from(articlesTable)
      .where(eq(articlesTable.articleId, articleId))
      .execute();

    if (!row) {
      return RA.ok(undefined);
    }
    if (rest.length > 0) {
      throw new Error(`Multiple articles found with the same ID: ${articleId}`);
    }

    return RA.ok(reconstructArticle(row));
  };
  return { resolve };
});

export const PgArticleResolver = {
  getInstance,
  reconstructArticle,
} as const;
