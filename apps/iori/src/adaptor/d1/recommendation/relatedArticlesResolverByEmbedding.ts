import { RA } from '@iwasa-kosui/result';
import { and, asc, eq, gt, gte, inArray, isNotNull } from 'drizzle-orm';

import { normalizeDigestUrl } from '../../../domain/digest/digestUrl.ts';
import { FeedEntryId } from '../../../domain/feedEntry/feedEntryId.ts';
import { FeedSourceId } from '../../../domain/feedSource/feedSourceId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { Embedding } from '../../../domain/interestSource/embedding.ts';
import {
  type RecommendableArticle,
  type RecommendableFeedSourceKind,
  Recommendation,
  type RelatedArticlesResolverByEmbedding,
} from '../../../domain/recommendation/recommendation.ts';
import type { IoriD1Db } from '../client.ts';
import { feedEntriesTable, feedSourcesTable } from '../schema.ts';

const PAGE_SIZE = 300;
const RECOMMENDABLE_KINDS: ReadonlyArray<RecommendableFeedSourceKind> = ['rss', 'hatena_hotentry', 'hatena_entrylist'];

type Scored = Readonly<{ article: RecommendableArticle; score: number }>;

const byScoreThenId = (a: Scored, b: Scored): number =>
  b.score - a.score || (a.article.feedEntryId < b.article.feedEntryId ? -1 : 1);

export const createD1RelatedArticlesResolverByEmbedding = (db: IoriD1Db): RelatedArticlesResolverByEmbedding => ({
  resolve: async ({ embedding, fetchedSince, excludingUrl, limit }) => {
    const excluded = normalizeDigestUrl(excludingUrl);
    let top: ReadonlyArray<Scored> = [];
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
        fetchedAt: feedEntriesTable.fetchedAt,
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
      const scored: Scored[] = [];
      for (const row of rows) {
        if (row.embedding === null || !Embedding.validate(row.embedding).ok) continue;
        if (normalizeDigestUrl(row.url) === excluded) continue;
        scored.push({
          article: {
            feedEntryId: FeedEntryId.orThrow(row.feedEntryId),
            feedSourceId: FeedSourceId.orThrow(row.feedSourceId),
            sourceKind: row.sourceKind as RecommendableFeedSourceKind,
            url: row.url,
            title: row.title,
            description: row.description,
            hatenaBookmarkCount: row.hatenaBookmarkCount,
            fetchedAt: Instant.orThrow(row.fetchedAt.getTime()),
            embedding: row.embedding,
          },
          score: Recommendation.cosineSimilarity(embedding, row.embedding),
        });
      }
      top = [...top, ...scored].sort(byScoreThenId).slice(0, limit);
      const last = rows.at(-1);
      if (rows.length < PAGE_SIZE || last === undefined) break;
      after = last.feedEntryId;
    }
    return RA.ok(top.map(({ article }) => article));
  },
});
