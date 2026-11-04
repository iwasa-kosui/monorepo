import { RA } from '@iwasa-kosui/result';
import { and, eq, lt, lte, sql } from 'drizzle-orm';

import { secondsUntilNextJstDay } from '../../../domain/aiSummary/usageLimit.ts';
import {
  DIGEST_REQUEST_DAILY_LIMIT,
  DIGEST_REQUEST_MIN_INTERVAL_MS,
  type DigestRequestUsageRecorder,
} from '../../../domain/digest/digestRequestLimit.ts';
import type { IoriD1Db } from '../client.ts';
import { digestRequestUsagesTable } from '../schema.ts';

export const createD1DigestRequestUsageRecorder = (db: IoriD1Db): DigestRequestUsageRecorder => ({
  reserve: async ({ userId, day, now }) => {
    const [reserved] = await db.insert(digestRequestUsagesTable)
      .values({ userId, day, count: 1, lastRequestedAt: new Date(now) })
      .onConflictDoUpdate({
        target: [digestRequestUsagesTable.userId, digestRequestUsagesTable.day],
        set: {
          count: sql`${digestRequestUsagesTable.count} + 1`,
          lastRequestedAt: sql`excluded.lastRequestedAt`,
        },
        setWhere: and(
          lt(digestRequestUsagesTable.count, DIGEST_REQUEST_DAILY_LIMIT),
          lte(digestRequestUsagesTable.lastRequestedAt, new Date(now - DIGEST_REQUEST_MIN_INTERVAL_MS)),
        ),
      })
      .returning({ count: digestRequestUsagesTable.count });
    if (reserved !== undefined) return RA.ok({ allowed: true });
    const [row] = await db.select({
      count: digestRequestUsagesTable.count,
      lastRequestedAt: digestRequestUsagesTable.lastRequestedAt,
    })
      .from(digestRequestUsagesTable)
      .where(and(eq(digestRequestUsagesTable.userId, userId), eq(digestRequestUsagesTable.day, day)));
    if (row !== undefined && row.count >= DIGEST_REQUEST_DAILY_LIMIT) {
      return RA.ok({ allowed: false, reason: 'daily_limit', retryAfterSeconds: secondsUntilNextJstDay(now) });
    }
    const retryAfterMs = row === undefined
      ? DIGEST_REQUEST_MIN_INTERVAL_MS
      : row.lastRequestedAt.getTime() + DIGEST_REQUEST_MIN_INTERVAL_MS - now;
    return RA.ok({
      allowed: false,
      reason: 'too_soon',
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    });
  },
});
