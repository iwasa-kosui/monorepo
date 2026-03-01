import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type {
  PushSubscription,
  PushSubscriptionResolverByEndpoint,
} from '../../../domain/pushSubscription/pushSubscription.ts';
import { PushSubscriptionId } from '../../../domain/pushSubscription/pushSubscriptionId.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { pushSubscriptionsTable } from '../schema.ts';

const getInstance = singleton((): PushSubscriptionResolverByEndpoint => {
  const resolve = async (endpoint: string): RA<PushSubscription | undefined, never> => {
    const db = DB.getInstance();

    const rows = await db
      .select()
      .from(pushSubscriptionsTable)
      .where(eq(pushSubscriptionsTable.endpoint, endpoint))
      .limit(1)
      .execute();

    if (rows.length === 0) {
      return RA.ok(undefined);
    }

    const row = rows[0];
    const subscription: PushSubscription = {
      subscriptionId: PushSubscriptionId.orThrow(row.subscriptionId),
      userId: row.userId as UserId,
      endpoint: row.endpoint,
      p256dhKey: row.p256dhKey,
      authKey: row.authKey,
    };

    return RA.ok(subscription);
  };

  return { resolve };
});

export const PgPushSubscriptionResolverByEndpoint = {
  getInstance,
} as const;
