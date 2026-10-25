import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import { ActorId } from '../../../domain/actor/actorId.ts';
import type { MutedActorIdsResolverByUserId } from '../../../domain/mute/mute.ts';
import type { IoriD1Db } from '../client.ts';
import { mutesTable } from '../schema.ts';

export const createD1MutedActorIdsResolverByUserId = (
  db: IoriD1Db,
): MutedActorIdsResolverByUserId => ({
  resolve: async (userId) => {
    const rows = await db.select({ mutedActorId: mutesTable.mutedActorId })
      .from(mutesTable)
      .where(eq(mutesTable.userId, userId));
    return RA.ok(rows.map((row) => ActorId.orThrow(row.mutedActorId)));
  },
});
