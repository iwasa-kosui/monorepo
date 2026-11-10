import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { PushSubscriptionsResolverByUserId } from '../../../domain/pushSubscription/pushSubscription.ts';
import { PushSubscriptionId } from '../../../domain/pushSubscription/pushSubscriptionId.ts';
import type { IoriD1Db } from '../client.ts';
import { pushSubscriptionsTable } from '../schema.ts';

export const createD1PushSubscriptionsResolverByUserId = (db: IoriD1Db): PushSubscriptionsResolverByUserId => ({
  resolve: async (userId) =>
    RA.ok((await db.select().from(pushSubscriptionsTable)
      .where(eq(pushSubscriptionsTable.userId, userId))).map((row) => ({
        subscriptionId: PushSubscriptionId.orThrow(row.subscriptionId),
        userId,
        endpoint: row.endpoint,
        p256dhKey: row.p256dhKey,
        authKey: row.authKey,
      }))),
});
