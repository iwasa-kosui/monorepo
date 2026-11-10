import { RA } from '@iwasa-kosui/result';
import { desc, eq } from 'drizzle-orm';

import type { PublishedArticlesWithAuthorResolver } from '../../../domain/article/article.ts';
import { Username } from '../../../domain/user/username.ts';
import type { IoriD1Db } from '../client.ts';
import { articlesTable, usersTable } from '../schema.ts';
import { reconstructD1Article } from './articleResolver.ts';

export const createD1PublishedArticlesWithAuthorResolver = (
  db: IoriD1Db,
): PublishedArticlesWithAuthorResolver => ({
  resolve: async () => {
    const rows = await db.select({ article: articlesTable, username: usersTable.username })
      .from(articlesTable)
      .innerJoin(usersTable, eq(articlesTable.authorUserId, usersTable.userId))
      .where(eq(articlesTable.status, 'published'))
      .orderBy(desc(articlesTable.publishedAt));
    return RA.ok({
      articles: rows.map((row) => reconstructD1Article(row.article)),
      authorUsername: rows[0] === undefined ? null : Username.orThrow(rows[0].username),
    });
  },
});
