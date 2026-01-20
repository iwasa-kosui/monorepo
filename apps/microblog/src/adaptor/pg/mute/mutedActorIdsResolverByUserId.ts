import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { ActorId } from '../../../domain/actor/actorId.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { mutesTable } from '../schema.ts';

const getInstance = singleton(() => ({
  resolve: async (userId: UserId) => {
    const rows = await DB.getInstance()
      .select({ mutedActorId: mutesTable.mutedActorId })
      .from(mutesTable)
      .where(eq(mutesTable.userId, userId))
      .execute();
    return RA.ok(rows.map((row) => row.mutedActorId as ActorId));
  },
}));

export const PgMutedActorIdsResolverByUserId = {
  getInstance,
} as const;
