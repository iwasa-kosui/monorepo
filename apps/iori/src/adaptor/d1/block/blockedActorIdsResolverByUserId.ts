import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import { ActorId } from '../../../domain/actor/actorId.ts';
import type { BlockedActorIdsResolverByUserId } from '../../../domain/block/block.ts';
import type { IoriD1Db } from '../client.ts';
import { blocksTable } from '../schema.ts';

export const createD1BlockedActorIdsResolverByUserId = (
  db: IoriD1Db,
): BlockedActorIdsResolverByUserId => ({
  resolve: async (userId) => {
    const rows = await db.select({ blockedActorId: blocksTable.blockedActorId })
      .from(blocksTable)
      .where(eq(blocksTable.userId, userId));
    return RA.ok(rows.map((row) => ActorId.orThrow(row.blockedActorId)));
  },
});
