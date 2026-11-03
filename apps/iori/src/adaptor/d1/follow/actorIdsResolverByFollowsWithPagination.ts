import { RA } from '@iwasa-kosui/result';
import { and, asc, desc, eq, gt, lt, type SQL } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';

import type {
  ActorIdsResolverByFollowerIdWithPagination,
  ActorIdsResolverByFollowingIdWithPagination,
} from '../../../domain/actor/accountProfile.ts';
import { ActorId } from '../../../domain/actor/actorId.ts';
import type { PageRequest } from '../../../domain/page/page.ts';
import type { IoriD1Db } from '../client.ts';
import { followsTable } from '../schema.ts';

const pagedBy = (page: PageRequest, owner: SQL, column: SQLiteColumn) => ({
  where: and(
    owner,
    page.olderThanId === undefined ? undefined : lt(column, page.olderThanId),
    page.newerThanId === undefined ? undefined : gt(column, page.newerThanId),
  ),
  orderBy: page.order === 'newestFirst' ? desc(column) : asc(column),
});

export const createD1ActorIdsResolverByFollowerIdWithPagination = (
  db: IoriD1Db,
): ActorIdsResolverByFollowerIdWithPagination => ({
  resolve: async ({ actorId, page }) => {
    const { where, orderBy } = pagedBy(page, eq(followsTable.followerId, actorId), followsTable.followingId);
    const rows = await db.select({ actorId: followsTable.followingId }).from(followsTable)
      .where(where).orderBy(orderBy).limit(page.limit);
    return RA.ok(rows.map((row) => ActorId.orThrow(row.actorId)));
  },
});

export const createD1ActorIdsResolverByFollowingIdWithPagination = (
  db: IoriD1Db,
): ActorIdsResolverByFollowingIdWithPagination => ({
  resolve: async ({ actorId, page }) => {
    const { where, orderBy } = pagedBy(page, eq(followsTable.followingId, actorId), followsTable.followerId);
    const rows = await db.select({ actorId: followsTable.followerId }).from(followsTable)
      .where(where).orderBy(orderBy).limit(page.limit);
    return RA.ok(rows.map((row) => ActorId.orThrow(row.actorId)));
  },
});
