import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import { Mute } from '../../../domain/mute/mute.ts';
import { MuteId } from '../../../domain/mute/muteId.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { mutesTable } from '../schema.ts';

const getInstance = singleton(() => ({
  resolve: async (userId: UserId) => {
    const rows = await DB.getInstance()
      .select()
      .from(mutesTable)
      .where(eq(mutesTable.userId, userId))
      .execute();
    return RA.ok(
      rows.map((row) =>
        Mute.orThrow({
          muteId: MuteId.orThrow(row.muteId),
          userId: row.userId,
          mutedActorId: row.mutedActorId,
        })
      ),
    );
  },
}));

export const PgMutesResolverByUserId = {
  getInstance,
} as const;
