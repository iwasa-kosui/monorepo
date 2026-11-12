import { RA } from '@iwasa-kosui/result';
import { and, eq } from 'drizzle-orm';

import type { BlockedActorUriResolverByUsername } from '../../../domain/block/block.ts';
import type { IoriD1Db } from '../client.ts';
import { actorsTable, blocksTable, usersTable } from '../schema.ts';

export const createD1BlockedActorUriResolverByUsername = (
  db: IoriD1Db,
): BlockedActorUriResolverByUsername => ({
  resolve: async ({ username, actorUri }) => {
    const rows = await db.select({ blockId: blocksTable.blockId }).from(blocksTable)
      .innerJoin(usersTable, eq(usersTable.userId, blocksTable.userId))
      .innerJoin(actorsTable, eq(actorsTable.actorId, blocksTable.blockedActorId))
      .where(and(eq(usersTable.username, username), eq(actorsTable.uri, actorUri)))
      .limit(1);
    return RA.ok(rows.length > 0);
  },
});
