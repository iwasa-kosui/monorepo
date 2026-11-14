import { RA } from '@iwasa-kosui/result';
import { and, asc, desc, eq, gte, notInArray, sql } from 'drizzle-orm';

import type { PopularArticlesResolverByFetchedSince } from '../../../domain/aiAgentBot/aiAgentBotMaterial.ts';
import type { FeedSourceKind } from '../../../domain/feedSource/feedSource.ts';
import type { IoriD1Db } from '../client.ts';
import { feedEntriesTable, feedSourcesTable } from '../schema.ts';

/** X の投稿と Technology Radar は記事ではないので、人気の記事に含めない */
const NON_ARTICLE_KINDS: readonly FeedSourceKind[] = ['x_user', 'thoughtworks_radar'];

/**
 * 最近集めた記事を、はてなブックマークの多い順に読む。同じ URL の記事は 1 件にまとめる。
 * ブックマークが 1 件も無い記事は、人気とはいえないので含めない。
 */
export const createD1PopularArticlesResolverByFetchedSince = (
  db: IoriD1Db,
): PopularArticlesResolverByFetchedSince => ({
  resolve: async ({ fetchedSince, limit }) => {
    const count = sql<number>`max(coalesce(${feedEntriesTable.hatenaBookmarkCount}, 0))`;
    const rows = await db.select({
      url: feedEntriesTable.url,
      title: feedEntriesTable.title,
      sourceTitle: feedSourcesTable.title,
      count,
    })
      .from(feedEntriesTable)
      .innerJoin(feedSourcesTable, eq(feedEntriesTable.feedSourceId, feedSourcesTable.feedSourceId))
      .where(and(
        notInArray(feedSourcesTable.kind, [...NON_ARTICLE_KINDS]),
        eq(feedSourcesTable.enabled, true),
        gte(feedEntriesTable.fetchedAt, new Date(fetchedSince)),
      ))
      .groupBy(feedEntriesTable.url)
      .having(sql`${count} > 0`)
      .orderBy(desc(count), asc(feedEntriesTable.url))
      .limit(limit);
    return RA.ok(rows.map((row) => ({
      url: row.url,
      title: row.title,
      sourceTitle: row.sourceTitle,
      bookmarkCount: Number(row.count),
    })));
  },
});
