import { RA } from '@iwasa-kosui/result';
import { and, eq } from 'drizzle-orm';

import type { ActorId } from '../../../domain/actor/actorId.ts';
import { Mute } from '../../../domain/mute/mute.ts';
import { MuteId } from '../../../domain/mute/muteId.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { mutesTable } from '../schema.ts';

const getInstance = singleton(() => ({
  resolve: async (agg: { userId: UserId; mutedActorId: ActorId }) => {
    const [row, ...rest] = await DB.getInstance()
      .select()
      .from(mutesTable)
      .where(
        and(
          eq(mutesTable.userId, agg.userId),
          eq(mutesTable.mutedActorId, agg.mutedActorId),
        ),
      )
      .execute();
    if (!row) {
      return RA.ok(undefined);
    }
    if (rest.length > 0) {
      throw new Error('Inconsistent state: multiple mute records found');
    }
    return RA.ok(
      Mute.orThrow({
        muteId: MuteId.orThrow(row.muteId),
        userId: row.userId,
        mutedActorId: row.mutedActorId,
      }),
    );
  },
}));

export const PgMuteResolver = {
  getInstance,
} as const;
