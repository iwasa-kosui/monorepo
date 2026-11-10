import { RA } from '@iwasa-kosui/result';
import { and, count, eq, isNull, max, min, or } from 'drizzle-orm';

import type { AccountStatsResolverByActorId } from '../../../domain/actor/accountStats.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import type { IoriD1Db } from '../client.ts';
import { domainEventsTable, followsTable, postsTable } from '../schema.ts';

const toInstant = (value: Date | number | null | undefined): Instant | null => {
  if (value === null || value === undefined) {
    return null;
  }
  return Instant.orThrow(value instanceof Date ? value.getTime() : value);
};

export const createD1AccountStatsResolverByActorId = (db: IoriD1Db): AccountStatsResolverByActorId => ({
  resolve: async (actorId) => {
    const [followers] = await db.select({ count: count() }).from(followsTable)
      .where(eq(followsTable.followingId, actorId));
    const [following] = await db.select({ count: count() }).from(followsTable)
      .where(eq(followsTable.followerId, actorId));
    const [statuses] = await db.select({
      count: count(),
      createdAt: min(postsTable.createdAt),
      lastAt: max(postsTable.createdAt),
    })
      .from(postsTable)
      .where(and(eq(postsTable.actorId, actorId), isNull(postsTable.deletedAt)));
    const [event] = await db.select({ occurredAt: min(domainEventsTable.occurredAt) }).from(domainEventsTable)
      .where(
        or(eq(domainEventsTable.aggregateId, actorId), eq(domainEventsTable.aggregateId, JSON.stringify(actorId))),
      );
    return RA.ok({
      followersCount: Number(followers?.count ?? 0),
      followingCount: Number(following?.count ?? 0),
      statusesCount: Number(statuses?.count ?? 0),
      createdAt: toInstant(event?.occurredAt) ?? toInstant(statuses?.createdAt) ?? Instant.orThrow(0),
      lastStatusAt: toInstant(statuses?.lastAt),
    });
  },
});
