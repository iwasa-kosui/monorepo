import { RA } from '@iwasa-kosui/result';
import { and, eq, isNull, lte, or } from 'drizzle-orm';

import {
  type FeedSourceFetchReserver,
  X_MANUAL_FETCH_COOLDOWN_SECONDS,
} from '../../../domain/feedSource/feedSource.ts';
import type { IoriD1Db } from '../client.ts';
import { feedSourcesTable } from '../schema.ts';

export const createD1FeedSourceFetchReserver = (db: IoriD1Db): FeedSourceFetchReserver => ({
  reserve: async ({ feedSourceId, now }) => {
    const reserved = await db.update(feedSourcesTable)
      .set({ lastFetchedAt: new Date(now) })
      .where(and(
        eq(feedSourcesTable.feedSourceId, feedSourceId),
        or(
          isNull(feedSourcesTable.lastFetchedAt),
          lte(feedSourcesTable.lastFetchedAt, new Date(now - X_MANUAL_FETCH_COOLDOWN_SECONDS * 1000)),
        ),
      ))
      .returning({ feedSourceId: feedSourcesTable.feedSourceId });
    return RA.ok(reserved.length > 0);
  },
});
