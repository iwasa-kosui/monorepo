import { RA } from '@iwasa-kosui/result';
import { and, asc, eq, gt, gte, inArray, isNotNull } from 'drizzle-orm';

import { FeedEntryId } from '../../../domain/feedEntry/feedEntryId.ts';
import { FeedSourceId } from '../../../domain/feedSource/feedSourceId.ts';
import { Embedding } from '../../../domain/interestSource/embedding.ts';
import type {
  RecommendableArticle,
  RecommendableArticlesResolverByFetchedSince,
  RecommendableFeedSourceKind,
} from '../../../domain/recommendation/recommendation.ts';
import type { IoriD1Db } from '../client.ts';
import { feedEntriesTable, feedSourcesTable } from '../schema.ts';

const PAGE_SIZE = 300;
const RECOMMENDABLE_KINDS: ReadonlyArray<RecommendableFeedSourceKind> = ['rss', 'hatena_hotentry', 'hatena_entrylist'];

export const createD1RecommendableArticlesResolverByFetchedSince = (
  db: IoriD1Db,
): RecommendableArticlesResolverByFetchedSince => ({
  resolve: async ({ fetchedSince }) => {
    const articles: RecommendableArticle[] = [];
    let after: string | undefined;
    for (;;) {
      const rows = await db.select({
        feedEntryId: feedEntriesTable.feedEntryId,
        feedSourceId: feedEntriesTable.feedSourceId,
        sourceKind: feedSourcesTable.kind,
        url: feedEntriesTable.url,
        title: feedEntriesTable.title,
        description: feedEntriesTable.description,
        hatenaBookmarkCount: feedEntriesTable.hatenaBookmarkCount,
        embedding: feedEntriesTable.embedding,
      }).from(feedEntriesTable)
        .innerJoin(feedSourcesTable, eq(feedEntriesTable.feedSourceId, feedSourcesTable.feedSourceId))
        .where(and(
          inArray(feedSourcesTable.kind, [...RECOMMENDABLE_KINDS]),
          eq(feedSourcesTable.enabled, true),
          isNotNull(feedEntriesTable.embeddedAt),
          isNotNull(feedEntriesTable.embedding),
          gte(feedEntriesTable.fetchedAt, new Date(fetchedSince)),
          after === undefined ? undefined : gt(feedEntriesTable.feedEntryId, after),
        ))
        .orderBy(asc(feedEntriesTable.feedEntryId))
        .limit(PAGE_SIZE);
      for (const row of rows) {
        if (row.embedding === null || !Embedding.validate(row.embedding).ok) continue;
        articles.push({
          feedEntryId: FeedEntryId.orThrow(row.feedEntryId),
          feedSourceId: FeedSourceId.orThrow(row.feedSourceId),
          sourceKind: row.sourceKind as RecommendableFeedSourceKind,
          url: row.url,
          title: row.title,
          description: row.description,
          hatenaBookmarkCount: row.hatenaBookmarkCount,
          embedding: row.embedding,
        });
      }
      const last = rows.at(-1);
      if (rows.length < PAGE_SIZE || last === undefined) break;
      after = last.feedEntryId;
    }
    return RA.ok(articles);
  },
});
