import { and, eq, isNotNull, notExists, or, sql } from 'drizzle-orm';

import type { IoriD1Db } from '../client.ts';
import { blueskyModeratedActorsTable, notificationBlueskyTable, notificationsTable } from '../schema.ts';

export const notFromModeratedBlueskyActor = (db: IoriD1Db) =>
  notExists(
    db.select({ one: sql`1` }).from(notificationBlueskyTable)
      .innerJoin(blueskyModeratedActorsTable, eq(blueskyModeratedActorsTable.did, notificationBlueskyTable.authorDid))
      .where(and(
        eq(notificationBlueskyTable.notificationId, notificationsTable.notificationId),
        or(eq(blueskyModeratedActorsTable.muted, 1), isNotNull(blueskyModeratedActorsTable.blockUri)),
      )),
  );
