import { RA } from '@iwasa-kosui/result';
import { and, desc, eq, gt, inArray, or, sql } from 'drizzle-orm';

import {
  BlueskyCrosspostStatus,
  type BlueskyCrosspostStatusReportResolver,
} from '../../../domain/blueskyCrosspost/blueskyCrosspost.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { PostId } from '../../../domain/post/postId.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyCrosspostsTable } from '../schema.ts';

export const createD1BlueskyCrosspostStatusReportResolver = (db: IoriD1Db): BlueskyCrosspostStatusReportResolver => ({
  resolve: async ({ maxAttempts, maxDeleteAttempts, failuresLimit }) => {
    const [groups, failures] = await Promise.all([
      db.select({
        status: blueskyCrosspostsTable.status,
        total: sql<number>`count(*)`.mapWith(Number),
        exhausted: sql<number>`coalesce(sum(case
          when ${blueskyCrosspostsTable.status} = 'failed' and ${blueskyCrosspostsTable.attempts} >= ${maxAttempts} then 1
          when ${blueskyCrosspostsTable.status} = 'deleting' and ${blueskyCrosspostsTable.attempts} >= ${maxDeleteAttempts} then 1
          else 0 end), 0)`.mapWith(Number),
      }).from(blueskyCrosspostsTable).groupBy(blueskyCrosspostsTable.status),
      db.select({
        postId: blueskyCrosspostsTable.postId,
        status: blueskyCrosspostsTable.status,
        attempts: blueskyCrosspostsTable.attempts,
        lastError: blueskyCrosspostsTable.lastError,
        updatedAt: blueskyCrosspostsTable.updatedAt,
      }).from(blueskyCrosspostsTable)
        .where(or(
          inArray(blueskyCrosspostsTable.status, ['failed', 'deleting']),
          and(eq(blueskyCrosspostsTable.status, 'pending'), gt(blueskyCrosspostsTable.attempts, 0)),
        ))
        .orderBy(desc(blueskyCrosspostsTable.updatedAt), desc(blueskyCrosspostsTable.postId))
        .limit(failuresLimit),
    ]);
    const counts = { pending: 0, sent: 0, failed: 0, skipped: 0, deleting: 0 };
    const exhausted = { failed: 0, deleting: 0 };
    for (const group of groups) {
      const status = BlueskyCrosspostStatus.safeParse(group.status);
      if (!status.success) continue;
      counts[status.data] = group.total;
      if (status.data === 'failed' || status.data === 'deleting') exhausted[status.data] = group.exhausted;
    }
    return RA.ok({
      counts,
      exhausted,
      recentFailures: failures.map((row) => ({
        postId: PostId.orThrow(row.postId),
        status: BlueskyCrosspostStatus.parse(row.status),
        attempts: row.attempts,
        lastError: row.lastError,
        updatedAt: Instant.orThrow(row.updatedAt.getTime()),
      })),
    });
  },
});
