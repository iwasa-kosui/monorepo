import { RA } from '@iwasa-kosui/result';
import { and, eq, lt, sql } from 'drizzle-orm';

import type { AiSummaryUsageRecorder } from '../../../domain/aiSummary/usageLimit.ts';
import type { IoriD1Db } from '../client.ts';
import { aiSummaryUsagesTable } from '../schema.ts';

export const createD1AiSummaryUsageRecorder = (db: IoriD1Db): AiSummaryUsageRecorder => ({
  reserve: async ({ userId, day, limit }) => {
    const [row] = await db.insert(aiSummaryUsagesTable)
      .values({ userId, day, count: 1 })
      .onConflictDoUpdate({
        target: [aiSummaryUsagesTable.userId, aiSummaryUsagesTable.day],
        set: { count: sql`${aiSummaryUsagesTable.count} + 1` },
        setWhere: lt(aiSummaryUsagesTable.count, limit),
      })
      .returning({ count: aiSummaryUsagesTable.count });
    return RA.ok(row === undefined ? { allowed: false, count: limit } : { allowed: true, count: row.count });
  },
  read: async ({ userId, day }) => {
    const [row] = await db.select({ count: aiSummaryUsagesTable.count })
      .from(aiSummaryUsagesTable)
      .where(and(eq(aiSummaryUsagesTable.userId, userId), eq(aiSummaryUsagesTable.day, day)));
    return RA.ok(row?.count ?? 0);
  },
});
