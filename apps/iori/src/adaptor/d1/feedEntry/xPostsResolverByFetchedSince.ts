import { RA } from '@iwasa-kosui/result';
import { and, desc, eq, gte } from 'drizzle-orm';

import type { XPost, XPostsResolverByFetchedSince } from '../../../domain/digest/digestMaterial.ts';
import { FeedEntryId } from '../../../domain/feedEntry/feedEntryId.ts';
import { XUsername } from '../../../domain/feedSource/xUsername.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { Embedding } from '../../../domain/interestSource/embedding.ts';
import type { IoriD1Db } from '../client.ts';
import { feedEntriesTable, feedSourcesTable } from '../schema.ts';

export const createD1XPostsResolverByFetchedSince = (db: IoriD1Db): XPostsResolverByFetchedSince => ({
  resolve: async ({ fetchedSince, limit }) => {
    const rows = await db.select({
      feedEntryId: feedEntriesTable.feedEntryId,
      sourceUrl: feedSourcesTable.url,
      url: feedEntriesTable.url,
      title: feedEntriesTable.title,
      publishedAt: feedEntriesTable.publishedAt,
      fetchedAt: feedEntriesTable.fetchedAt,
      embedding: feedEntriesTable.embedding,
    }).from(feedEntriesTable)
      .innerJoin(feedSourcesTable, eq(feedEntriesTable.feedSourceId, feedSourcesTable.feedSourceId))
      .where(and(
        eq(feedSourcesTable.kind, 'x_user'),
        eq(feedSourcesTable.enabled, true),
        gte(feedEntriesTable.fetchedAt, new Date(fetchedSince)),
      ))
      .orderBy(desc(feedEntriesTable.fetchedAt), desc(feedEntriesTable.feedEntryId))
      .limit(limit);
    const posts: XPost[] = [];
    for (const row of rows) {
      const username = XUsername.fromProfileUrl(row.sourceUrl);
      if (username === undefined) continue;
      posts.push({
        feedEntryId: FeedEntryId.orThrow(row.feedEntryId),
        username,
        url: row.url,
        title: row.title,
        postedAt: Instant.orThrow((row.publishedAt ?? row.fetchedAt).getTime()),
        embedding: row.embedding !== null && Embedding.validate(row.embedding).ok ? row.embedding : null,
      });
    }
    return RA.ok(posts);
  },
});
