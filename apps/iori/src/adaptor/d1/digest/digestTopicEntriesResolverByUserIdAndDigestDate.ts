import { RA } from '@iwasa-kosui/result';
import { and, eq, ne, sql } from 'drizzle-orm';

import { ArticleId } from '../../../domain/article/articleId.ts';
import {
  type DigestTopicEntriesResolverByUserIdAndDigestDate,
  SUMMARY_DIGEST_TOPIC_KEY,
} from '../../../domain/digest/digest.ts';
import type { IoriD1Db } from '../client.ts';
import { digestItemsTable, digestsTable, digestTopicsTable } from '../schema.ts';

export const createD1DigestTopicEntriesResolverByUserIdAndDigestDate = (
  db: IoriD1Db,
): DigestTopicEntriesResolverByUserIdAndDigestDate => ({
  resolve: async ({ userId, digestDate }) => {
    const rows = await db.select({
      topicKey: digestsTable.topicKey,
      name: digestTopicsTable.name,
      articleId: digestsTable.articleId,
      sortOrder: digestTopicsTable.sortOrder,
      itemCount: sql<number>`count(${digestItemsTable.digestItemId})`,
    }).from(digestsTable)
      .leftJoin(
        digestTopicsTable,
        and(eq(digestTopicsTable.userId, digestsTable.userId), eq(digestTopicsTable.topicKey, digestsTable.topicKey)),
      )
      .leftJoin(digestItemsTable, eq(digestItemsTable.digestId, digestsTable.digestId))
      .where(and(
        eq(digestsTable.userId, userId),
        eq(digestsTable.digestDate, digestDate),
        ne(digestsTable.topicKey, SUMMARY_DIGEST_TOPIC_KEY),
      ))
      .groupBy(digestsTable.digestId);
    return RA.ok(
      rows
        .sort((a, b) =>
          b.itemCount - a.itemCount
          || (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER)
          || (a.topicKey < b.topicKey ? -1 : a.topicKey > b.topicKey ? 1 : 0)
        )
        .map((row) => ({
          topicKey: row.topicKey,
          name: row.name ?? row.topicKey,
          articleId: ArticleId.orThrow(row.articleId),
          itemCount: Number(row.itemCount),
        })),
    );
  },
});
