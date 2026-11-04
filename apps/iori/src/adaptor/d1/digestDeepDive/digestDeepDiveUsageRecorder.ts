import { RA } from '@iwasa-kosui/result';
import { and, eq, lt, sql } from 'drizzle-orm';

import { secondsUntilNextJstDay } from '../../../domain/aiSummary/usageLimit.ts';
import {
  DIGEST_DEEP_DIVE_DAILY_LIMIT,
  type DigestDeepDiveUsageRecorder,
} from '../../../domain/digestDeepDive/digestDeepDiveLimit.ts';
import type { IoriD1Db } from '../client.ts';
import { digestDeepDiveUsagesTable } from '../schema.ts';

export const createD1DigestDeepDiveUsageRecorder = (db: IoriD1Db): DigestDeepDiveUsageRecorder => ({
  reserve: async ({ userId, day, now }) => {
    const [reserved] = await db.insert(digestDeepDiveUsagesTable)
      .values({ userId, day, count: 1 })
      .onConflictDoUpdate({
        target: [digestDeepDiveUsagesTable.userId, digestDeepDiveUsagesTable.day],
        set: { count: sql`${digestDeepDiveUsagesTable.count} + 1` },
        setWhere: lt(digestDeepDiveUsagesTable.count, DIGEST_DEEP_DIVE_DAILY_LIMIT),
      })
      .returning({ count: digestDeepDiveUsagesTable.count });
    if (reserved !== undefined) {
      return RA.ok({ allowed: true, remaining: Math.max(0, DIGEST_DEEP_DIVE_DAILY_LIMIT - reserved.count) });
    }
    return RA.ok({ allowed: false, retryAfterSeconds: secondsUntilNextJstDay(now) });
  },
  remaining: async ({ userId, day }) => {
    const [row] = await db.select({ count: digestDeepDiveUsagesTable.count })
      .from(digestDeepDiveUsagesTable)
      .where(and(eq(digestDeepDiveUsagesTable.userId, userId), eq(digestDeepDiveUsagesTable.day, day)));
    return RA.ok(Math.max(0, DIGEST_DEEP_DIVE_DAILY_LIMIT - (row?.count ?? 0)));
  },
});
