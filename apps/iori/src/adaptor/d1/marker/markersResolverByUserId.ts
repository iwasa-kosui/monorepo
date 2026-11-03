import { RA } from '@iwasa-kosui/result';
import { and, eq, inArray } from 'drizzle-orm';

import { Marker, type MarkersResolverByUserId } from '../../../domain/marker/marker.ts';
import type { IoriD1Db } from '../client.ts';
import { mastodonMarkersTable } from '../schema.ts';

export const createD1MarkersResolverByUserId = (db: IoriD1Db): MarkersResolverByUserId => ({
  resolve: async ({ userId, timelines }) => {
    if (timelines.length === 0) return RA.ok([]);
    const rows = await db.select().from(mastodonMarkersTable)
      .where(and(eq(mastodonMarkersTable.userId, userId), inArray(mastodonMarkersTable.timeline, [...timelines])));
    return RA.ok(rows.map((row) => Marker.orThrow({ ...row, updatedAt: row.updatedAt.getTime() })));
  },
});
