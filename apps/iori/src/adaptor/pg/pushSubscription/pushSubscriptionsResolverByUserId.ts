import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type {
  PushSubscription,
  PushSubscriptionsResolverByUserId,
} from '../../../domain/pushSubscription/pushSubscription.ts';
import { PushSubscriptionId } from '../../../domain/pushSubscription/pushSubscriptionId.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { pushSubscriptionsTable } from '../schema.ts';

const getInstance = singleton((): PushSubscriptionsResolverByUserId => {
  const resolve = async (userId: UserId): RA<PushSubscription[], never> => {
    const db = DB.getInstance();

    const rows = await db
      .select()
      .from(pushSubscriptionsTable)
      .where(eq(pushSubscriptionsTable.userId, userId))
      .execute();

    const subscriptions: PushSubscription[] = rows.map((row) => ({
      subscriptionId: PushSubscriptionId.orThrow(row.subscriptionId),
      userId: row.userId as UserId,
      endpoint: row.endpoint,
      p256dhKey: row.p256dhKey,
      authKey: row.authKey,
    }));

    return RA.ok(subscriptions);
  };

  return { resolve };
});

export const PgPushSubscriptionsResolverByUserId = {
  getInstance,
} as const;
