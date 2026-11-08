import { RA } from '@iwasa-kosui/result';
import { and, asc, eq } from 'drizzle-orm';

import type { DigestXPost, DigestXPostsResolverByArticleId } from '../../../domain/digest/digest.ts';
import { XUsername } from '../../../domain/feedSource/xUsername.ts';
import type { IoriD1Db } from '../client.ts';
import { digestsTable, digestXPostsTable, feedEntriesTable, feedSourcesTable } from '../schema.ts';

export const createD1DigestXPostsResolverByArticleId = (db: IoriD1Db): DigestXPostsResolverByArticleId => ({
  resolve: async (articleId) => {
    const rows = await db.select({
      sourceUrl: feedSourcesTable.url,
      url: feedEntriesTable.url,
      title: feedEntriesTable.title,
    }).from(digestXPostsTable)
      .innerJoin(digestsTable, eq(digestXPostsTable.digestId, digestsTable.digestId))
      .innerJoin(feedEntriesTable, eq(digestXPostsTable.feedEntryId, feedEntriesTable.feedEntryId))
      .innerJoin(feedSourcesTable, eq(feedEntriesTable.feedSourceId, feedSourcesTable.feedSourceId))
      .where(and(
        eq(digestsTable.articleId, articleId),
        eq(feedSourcesTable.kind, 'x_user'),
        eq(feedSourcesTable.enabled, true),
      ))
      .orderBy(asc(digestXPostsTable.rank));
    const posts: DigestXPost[] = [];
    for (const row of rows) {
      const username = XUsername.fromProfileUrl(row.sourceUrl);
      if (username === undefined) continue;
      posts.push({ username, url: row.url, title: row.title });
    }
    return RA.ok(posts);
  },
});
