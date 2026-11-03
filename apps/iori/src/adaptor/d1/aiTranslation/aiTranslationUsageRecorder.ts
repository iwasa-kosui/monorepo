import { RA } from '@iwasa-kosui/result';
import { and, eq, lt, sql } from 'drizzle-orm';

import type { AiTranslationUsageRecorder } from '../../../domain/aiTranslation/usageLimit.ts';
import type { IoriD1Db } from '../client.ts';
import { aiTranslationUsagesTable } from '../schema.ts';

export const createD1AiTranslationUsageRecorder = (db: IoriD1Db): AiTranslationUsageRecorder => ({
  reserve: async ({ userId, day, limit }) => {
    const [row] = await db.insert(aiTranslationUsagesTable)
      .values({ userId, day, count: 1 })
      .onConflictDoUpdate({
        target: [aiTranslationUsagesTable.userId, aiTranslationUsagesTable.day],
        set: { count: sql`${aiTranslationUsagesTable.count} + 1` },
        setWhere: lt(aiTranslationUsagesTable.count, limit),
      })
      .returning({ count: aiTranslationUsagesTable.count });
    return RA.ok(row === undefined ? { allowed: false, count: limit } : { allowed: true, count: row.count });
  },
  read: async ({ userId, day }) => {
    const [row] = await db.select({ count: aiTranslationUsagesTable.count })
      .from(aiTranslationUsagesTable)
      .where(and(eq(aiTranslationUsagesTable.userId, userId), eq(aiTranslationUsagesTable.day, day)));
    return RA.ok(row?.count ?? 0);
  },
});
