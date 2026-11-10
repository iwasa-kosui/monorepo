import { RA } from '@iwasa-kosui/result';
import { and, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';

import { ActorId } from '../../../domain/actor/actorId.ts';
import type { MutedActorsResolverByUserIdWithPagination } from '../../../domain/mute/mute.ts';
import { MuteId } from '../../../domain/mute/muteId.ts';
import type { IoriD1Db } from '../client.ts';
import { pageConditions, pageOrderBy } from '../pageCondition.ts';
import { mutesTable } from '../schema.ts';

const cursorMute = alias(mutesTable, 'cursor_mute');

export const createD1MutedActorsResolverByUserIdWithPagination = (
  db: IoriD1Db,
): MutedActorsResolverByUserIdWithPagination => ({
  resolve: async ({ userId, page }) => {
    const columns = { createdAt: mutesTable.createdAt, id: mutesTable.muteId };
    // 他のユーザーの mute の ID を位置に使っても、その行の時刻を引かない
    const cursorOf = (id: string) =>
      sql`select ${cursorMute.createdAt}, ${cursorMute.muteId} from ${mutesTable} ${cursorMute}
        where ${cursorMute.muteId} = ${id} and ${cursorMute.userId} = ${userId}`;
    const rows = await db.select({ muteId: mutesTable.muteId, mutedActorId: mutesTable.mutedActorId })
      .from(mutesTable)
      .where(and(eq(mutesTable.userId, userId), ...pageConditions(page, columns, cursorOf)))
      .orderBy(...pageOrderBy(page, columns))
      .limit(page.limit);
    return RA.ok(
      rows.map((row) => ({ muteId: MuteId.orThrow(row.muteId), mutedActorId: ActorId.orThrow(row.mutedActorId) })),
    );
  },
});
