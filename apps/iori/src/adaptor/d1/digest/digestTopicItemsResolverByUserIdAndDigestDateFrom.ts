import { RA } from '@iwasa-kosui/result';
import { and, asc, desc, eq, gte, ne } from 'drizzle-orm';

import {
  DigestFeedback,
  type DigestTopicItemsResolverByUserIdAndDigestDateFrom,
  SUMMARY_DIGEST_TOPIC_KEY,
} from '../../../domain/digest/digest.ts';
import { Embedding } from '../../../domain/interestSource/embedding.ts';
import type { IoriD1Db } from '../client.ts';
import { digestItemsTable, digestsTable, feedEntriesTable } from '../schema.ts';

export const createD1DigestTopicItemsResolverByUserIdAndDigestDateFrom = (
  db: IoriD1Db,
): DigestTopicItemsResolverByUserIdAndDigestDateFrom => ({
  resolve: async ({ userId, digestDateFrom, limit }) => {
    const rows = await db.select({
      digestDate: digestsTable.digestDate,
      topicKey: digestsTable.topicKey,
      rank: digestItemsTable.rank,
      title: digestItemsTable.title,
      url: digestItemsTable.url,
      feedback: digestItemsTable.feedback,
      embedding: feedEntriesTable.embedding,
    }).from(digestItemsTable)
      .innerJoin(digestsTable, eq(digestsTable.digestId, digestItemsTable.digestId))
      .leftJoin(feedEntriesTable, eq(feedEntriesTable.feedEntryId, digestItemsTable.feedEntryId))
      .where(and(
        eq(digestsTable.userId, userId),
        gte(digestsTable.digestDate, digestDateFrom),
        ne(digestsTable.topicKey, SUMMARY_DIGEST_TOPIC_KEY),
      ))
      .orderBy(desc(digestsTable.digestDate), asc(digestsTable.topicKey), asc(digestItemsTable.rank))
      .limit(limit);
    return RA.ok(rows.map((row) => ({
      digestDate: row.digestDate,
      topicKey: row.topicKey,
      rank: row.rank,
      title: row.title,
      url: row.url,
      feedback: DigestFeedback.zodType.nullable().parse(row.feedback),
      embedding: row.embedding !== null && Embedding.validate(row.embedding).ok ? row.embedding : null,
    })));
  },
});
