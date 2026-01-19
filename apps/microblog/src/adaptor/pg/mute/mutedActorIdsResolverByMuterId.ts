import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import { ActorId } from '../../../domain/actor/actorId.ts';
import type { MutedActorIdsResolverByMuterId } from '../../../domain/mute/mute.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { mutesTable } from '../schema.ts';

const getInstance = singleton((): MutedActorIdsResolverByMuterId => ({
  resolve: async (condition: { muterId: UserId }) => {
    const rows = await DB.getInstance()
      .select({ mutedActorId: mutesTable.mutedActorId })
      .from(mutesTable)
      .where(eq(mutesTable.muterId, condition.muterId))
      .execute();
    return RA.ok(rows.map((row) => ActorId.orThrow(row.mutedActorId)));
  },
}));

export const PgMutedActorIdsResolverByMuterId = {
  getInstance,
} as const;
