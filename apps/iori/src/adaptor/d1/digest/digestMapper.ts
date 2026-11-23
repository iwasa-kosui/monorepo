import { asc, eq } from 'drizzle-orm';

import { Digest, type DigestHeader } from '../../../domain/digest/digest.ts';
import type { IoriD1Db } from '../client.ts';
import { digestItemsTable, digestTrendsTable, digestXPostsTable } from '../schema.ts';

export const reconstructDigest = async (db: IoriD1Db, header: DigestHeader): Promise<Digest> => {
  const [items, trends, xPosts] = await Promise.all([
    db.select({
      digestItemId: digestItemsTable.digestItemId,
      feedEntryId: digestItemsTable.feedEntryId,
      url: digestItemsTable.url,
      title: digestItemsTable.title,
      rank: digestItemsTable.rank,
      score: digestItemsTable.score,
      summary: digestItemsTable.summary,
      reasonInterestSourceId: digestItemsTable.reasonInterestSourceId,
    }).from(digestItemsTable)
      .where(eq(digestItemsTable.digestId, header.digestId))
      .orderBy(asc(digestItemsTable.rank)),
    db.select().from(digestTrendsTable)
      .where(eq(digestTrendsTable.digestId, header.digestId))
      .orderBy(asc(digestTrendsTable.kind), asc(digestTrendsTable.rank)),
    db.select().from(digestXPostsTable)
      .where(eq(digestXPostsTable.digestId, header.digestId))
      .orderBy(asc(digestXPostsTable.rank)),
  ]);
  return Digest.parseOrThrow({
    ...header,
    items,
    trends: trends.map(({ digestId: _digestId, ...trend }) => trend),
    xPostFeedEntryIds: xPosts.map((post) => post.feedEntryId),
  });
};
