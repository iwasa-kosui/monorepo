import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { ArticleId } from '../../../domain/article/articleId.ts';
import type { ArticleBody, ArticleBodyResolver } from '../../../domain/articleBody/articleBody.ts';
import type { Instant } from '../../../domain/instant/instant.ts';
import type { IoriD1Db } from '../client.ts';
import { articleBodiesTable } from '../schema.ts';

export const reconstructD1ArticleBody = (row: typeof articleBodiesTable.$inferSelect): ArticleBody => ({
  articleId: row.articleId as ArticleId,
  privateHtml: row.privateHtml,
  publicHtml: row.publicHtml,
  markdown: row.markdown,
  updatedAt: row.updatedAt.getTime() as Instant,
});

export const createD1ArticleBodyResolver = (db: IoriD1Db): ArticleBodyResolver => ({
  resolve: async (articleId) => {
    const [row] = await db.select().from(articleBodiesTable).where(eq(articleBodiesTable.articleId, articleId))
      .limit(1);
    return RA.ok(row === undefined ? undefined : reconstructD1ArticleBody(row));
  },
});
