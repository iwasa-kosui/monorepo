import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { PushSubscriptionResolverByEndpoint } from '../../../domain/pushSubscription/pushSubscription.ts';
import { PushSubscriptionId } from '../../../domain/pushSubscription/pushSubscriptionId.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import type { IoriD1Db } from '../client.ts';
import { pushSubscriptionsTable } from '../schema.ts';

export const createD1PushSubscriptionResolverByEndpoint = (
  db: IoriD1Db,
): PushSubscriptionResolverByEndpoint => ({
  resolve: async (endpoint) => {
    const [row] = await db.select().from(pushSubscriptionsTable)
      .where(eq(pushSubscriptionsTable.endpoint, endpoint)).limit(1);
    return RA.ok(
      row === undefined ? undefined : {
        subscriptionId: PushSubscriptionId.orThrow(row.subscriptionId),
        userId: row.userId as UserId,
        endpoint: row.endpoint,
        p256dhKey: row.p256dhKey,
        authKey: row.authKey,
      },
    );
  },
});
