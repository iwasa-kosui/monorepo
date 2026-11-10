import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { ArticleResolverByRootPostId } from '../../../domain/article/article.ts';
import type { IoriD1Db } from '../client.ts';
import { articlesTable } from '../schema.ts';
import { reconstructD1Article } from './articleResolver.ts';

export const createD1ArticleResolverByRootPostId = (
  db: IoriD1Db,
): ArticleResolverByRootPostId => ({
  resolve: async ({ rootPostId }) => {
    const [row, ...rest] = await db.select().from(articlesTable)
      .where(eq(articlesTable.rootPostId, rootPostId));
    if (row === undefined) return RA.ok(undefined);
    if (rest.length > 0) throw new Error(`Multiple articles found with the same rootPostId: ${rootPostId}`);
    return RA.ok(reconstructD1Article(row));
  },
});
