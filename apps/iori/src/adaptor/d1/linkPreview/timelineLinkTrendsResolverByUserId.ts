import { RA } from '@iwasa-kosui/result';
import { and, asc, desc, eq, gte, inArray, isNull, notInArray, or, sql } from 'drizzle-orm';

import type { TimelineLinkTrendsResolverByUserId } from '../../../domain/digest/digestMaterial.ts';
import type { IoriD1Db } from '../client.ts';
import {
  blocksTable,
  followsTable,
  linkPreviewsTable,
  localActorsTable,
  mutesTable,
  postsTable,
  remotePostsTable,
} from '../schema.ts';

export const createD1TimelineLinkTrendsResolverByUserId = (
  db: IoriD1Db,
): TimelineLinkTrendsResolverByUserId => ({
  resolve: async ({ userId, createdSince, limit }) => {
    const ownActorIds = db.select({ actorId: localActorsTable.actorId }).from(localActorsTable)
      .where(eq(localActorsTable.userId, userId));
    const followingActorIds = db.select({ actorId: followsTable.followingId }).from(followsTable)
      .where(inArray(followsTable.followerId, ownActorIds));
    const mutedActorIds = db.select({ actorId: mutesTable.mutedActorId }).from(mutesTable)
      .where(eq(mutesTable.userId, userId));
    const blockedActorIds = db.select({ actorId: blocksTable.blockedActorId }).from(blocksTable)
      .where(eq(blocksTable.userId, userId));
    const sharedBy = sql<number>`count(distinct ${postsTable.actorId})`;
    const rows = await db.select({
      url: linkPreviewsTable.url,
      title: sql<string>`coalesce(nullif(max(${linkPreviewsTable.title}), ''), ${linkPreviewsTable.url})`,
      count: sharedBy,
    })
      .from(linkPreviewsTable)
      .innerJoin(postsTable, eq(linkPreviewsTable.postId, postsTable.postId))
      .leftJoin(remotePostsTable, eq(remotePostsTable.postId, postsTable.postId))
      .where(and(
        gte(linkPreviewsTable.createdAt, new Date(createdSince)),
        isNull(postsTable.deletedAt),
        or(isNull(remotePostsTable.visibility), notInArray(remotePostsTable.visibility, ['private', 'direct'])),
        or(inArray(postsTable.actorId, ownActorIds), inArray(postsTable.actorId, followingActorIds)),
        notInArray(postsTable.actorId, mutedActorIds),
        notInArray(postsTable.actorId, blockedActorIds),
      ))
      .groupBy(linkPreviewsTable.url)
      .orderBy(desc(sharedBy), asc(linkPreviewsTable.url))
      .limit(limit);
    return RA.ok(rows.map((row) => ({ url: row.url, title: row.title, count: Number(row.count) })));
  },
});
