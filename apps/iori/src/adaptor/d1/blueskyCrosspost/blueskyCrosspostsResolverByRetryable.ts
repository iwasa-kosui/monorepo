import { RA } from '@iwasa-kosui/result';
import { and, asc, eq, isNotNull, lt, or } from 'drizzle-orm';

import type { BlueskyCrosspostsResolverByRetryable } from '../../../domain/blueskyCrosspost/blueskyCrosspost.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyCrosspostsTable } from '../schema.ts';
import { toBlueskyCrosspost } from './blueskyCrosspostRow.ts';

export const createD1BlueskyCrosspostsResolverByRetryable = (
  db: IoriD1Db,
): BlueskyCrosspostsResolverByRetryable => ({
  resolve: async ({ pendingCreatedBefore, maxAttempts, maxDeleteAttempts, limit }) => {
    const rows = await db.select().from(blueskyCrosspostsTable)
      .where(or(
        and(
          eq(blueskyCrosspostsTable.status, 'pending'),
          lt(blueskyCrosspostsTable.createdAt, new Date(pendingCreatedBefore)),
          lt(blueskyCrosspostsTable.attempts, maxAttempts),
        ),
        and(eq(blueskyCrosspostsTable.status, 'failed'), lt(blueskyCrosspostsTable.attempts, maxAttempts)),
        and(
          eq(blueskyCrosspostsTable.status, 'deleting'),
          isNotNull(blueskyCrosspostsTable.rkey),
          lt(blueskyCrosspostsTable.attempts, maxDeleteAttempts),
        ),
      ))
      .orderBy(asc(blueskyCrosspostsTable.createdAt))
      .limit(limit);
    return RA.ok(rows.map(toBlueskyCrosspost));
  },
});
