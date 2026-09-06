import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { ActorId } from '../../../domain/actor/actorId.ts';
import type { Article, ArticleResolver, ArticleStatus } from '../../../domain/article/article.ts';
import type { ArticleId } from '../../../domain/article/articleId.ts';
import type { Instant } from '../../../domain/instant/instant.ts';
import type { PostId } from '../../../domain/post/postId.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import type { IoriD1Db } from '../client.ts';
import { articlesTable } from '../schema.ts';

export const reconstructD1Article = (row: typeof articlesTable.$inferSelect): Article => ({
  articleId: row.articleId as ArticleId,
  authorActorId: row.authorActorId as ActorId,
  authorUserId: row.authorUserId as UserId,
  rootPostId: row.rootPostId as PostId,
  title: row.title,
  status: row.status as ArticleStatus,
  createdAt: row.createdAt.getTime() as Instant,
  publishedAt: row.publishedAt?.getTime() as Instant | undefined ?? null,
  unpublishedAt: row.unpublishedAt?.getTime() as Instant | undefined ?? null,
});

export const createD1ArticleResolver = (db: IoriD1Db): ArticleResolver => ({
  resolve: async (articleId) => {
    const [row] = await db.select().from(articlesTable).where(eq(articlesTable.articleId, articleId)).limit(1);
    return RA.ok(row === undefined ? undefined : reconstructD1Article(row));
  },
});
