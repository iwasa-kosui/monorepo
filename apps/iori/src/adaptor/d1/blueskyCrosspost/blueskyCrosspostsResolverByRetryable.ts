import { RA } from '@iwasa-kosui/result';
import { and, asc, eq, isNotNull, lt, notExists, or, sql } from 'drizzle-orm';

import type { BlueskyCrosspostsResolverByRetryable } from '../../../domain/blueskyCrosspost/blueskyCrosspost.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyAccountSwitchTable, blueskyCrosspostsTable } from '../schema.ts';
import { toBlueskyCrosspost } from './blueskyCrosspostRow.ts';

export const createD1BlueskyCrosspostsResolverByRetryable = (
  db: IoriD1Db,
): BlueskyCrosspostsResolverByRetryable => ({
  resolve: async ({ pendingCreatedBefore, maxAttempts, maxDeleteAttempts, limit }) => {
    const rows = await db.select().from(blueskyCrosspostsTable)
      .where(and(
        // アカウントを切り替えている途中の人のクロスポストは、古いアカウントの後始末を終えるまで送らない。
        // ほかの人のクロスポストは待たせない
        notExists(
          db.select({ n: sql`1` }).from(blueskyAccountSwitchTable)
            .where(eq(blueskyAccountSwitchTable.userId, blueskyCrosspostsTable.userId)),
        ),
        or(
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
        ),
      ))
      .orderBy(asc(blueskyCrosspostsTable.createdAt))
      .limit(limit);
    return RA.ok(rows.map(toBlueskyCrosspost));
  },
});
