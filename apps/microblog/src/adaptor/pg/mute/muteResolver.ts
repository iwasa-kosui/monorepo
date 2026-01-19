import { RA } from '@iwasa-kosui/result';
import { and, eq } from 'drizzle-orm';

import type { ActorId } from '../../../domain/actor/actorId.ts';
import { Mute, type MuteResolver } from '../../../domain/mute/mute.ts';
import { MuteId } from '../../../domain/mute/muteId.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { mutesTable } from '../schema.ts';

const getInstance = singleton((): MuteResolver => ({
  resolve: async (condition: { muterId: UserId; mutedActorId: ActorId }) => {
    const [row, ...rest] = await DB.getInstance().select().from(mutesTable).where(
      and(
        eq(mutesTable.muterId, condition.muterId),
        eq(mutesTable.mutedActorId, condition.mutedActorId),
      ),
    ).execute();
    if (!row) {
      return RA.ok(undefined);
    }
    if (rest.length > 0) {
      throw new Error('Inconsistent state: multiple mute records found');
    }
    return RA.ok(Mute.orThrow({
      muteId: MuteId.orThrow(row.muteId),
      muterId: condition.muterId,
      mutedActorId: condition.mutedActorId,
    }));
  },
}));

export const PgMuteResolver = {
  getInstance,
} as const;
