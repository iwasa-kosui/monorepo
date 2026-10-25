import { RA } from '@iwasa-kosui/result';
import { and, eq } from 'drizzle-orm';

import { Mute, type MuteResolver } from '../../../domain/mute/mute.ts';
import { MuteId } from '../../../domain/mute/muteId.ts';
import type { IoriD1Db } from '../client.ts';
import { mutesTable } from '../schema.ts';

const reconstructMute = (row: typeof mutesTable.$inferSelect) =>
  Mute.orThrow({
    muteId: MuteId.orThrow(row.muteId),
    userId: row.userId,
    mutedActorId: row.mutedActorId,
  });

export const createD1MuteResolver = (db: IoriD1Db): MuteResolver => ({
  resolve: async ({ userId, mutedActorId }) => {
    const [row, ...rest] = await db.select().from(mutesTable)
      .where(and(eq(mutesTable.userId, userId), eq(mutesTable.mutedActorId, mutedActorId)));
    if (row === undefined) return RA.ok(undefined);
    if (rest.length > 0) throw new Error('Inconsistent state: multiple mute records found');
    return RA.ok(reconstructMute(row));
  },
});

export { reconstructMute };
