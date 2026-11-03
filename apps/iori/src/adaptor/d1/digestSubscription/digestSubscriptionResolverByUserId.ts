import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { DigestSubscriptionResolverByUserId } from '../../../domain/digestSubscription/digestSubscription.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import type { IoriD1Db } from '../client.ts';
import { digestSubscriptionsTable } from '../schema.ts';

export const createD1DigestSubscriptionResolverByUserId = (
  db: IoriD1Db,
): DigestSubscriptionResolverByUserId => ({
  resolve: async (userId) => {
    const [row] = await db.select().from(digestSubscriptionsTable)
      .where(eq(digestSubscriptionsTable.userId, userId))
      .limit(1);
    return RA.ok(
      row === undefined ? undefined : {
        userId,
        enabled: row.enabled,
        createdAt: Instant.orThrow(row.createdAt.getTime()),
        updatedAt: Instant.orThrow(row.updatedAt.getTime()),
      },
    );
  },
});
