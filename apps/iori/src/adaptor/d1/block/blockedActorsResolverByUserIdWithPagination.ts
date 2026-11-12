import { RA } from '@iwasa-kosui/result';
import { and, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';

import { ActorId } from '../../../domain/actor/actorId.ts';
import type { BlockedActorsResolverByUserIdWithPagination } from '../../../domain/block/block.ts';
import { BlockId } from '../../../domain/block/blockId.ts';
import type { IoriD1Db } from '../client.ts';
import { pageConditions, pageOrderBy } from '../pageCondition.ts';
import { blocksTable } from '../schema.ts';

const cursorBlock = alias(blocksTable, 'cursor_block');

export const createD1BlockedActorsResolverByUserIdWithPagination = (
  db: IoriD1Db,
): BlockedActorsResolverByUserIdWithPagination => ({
  resolve: async ({ userId, page }) => {
    const columns = { createdAt: blocksTable.createdAt, id: blocksTable.blockId };
    const cursorOf = (id: string) =>
      sql`select ${cursorBlock.createdAt}, ${cursorBlock.blockId} from ${blocksTable} ${cursorBlock}
        where ${cursorBlock.blockId} = ${id} and ${cursorBlock.userId} = ${userId}`;
    const rows = await db.select({ blockId: blocksTable.blockId, blockedActorId: blocksTable.blockedActorId })
      .from(blocksTable)
      .where(and(eq(blocksTable.userId, userId), ...pageConditions(page, columns, cursorOf)))
      .orderBy(...pageOrderBy(page, columns))
      .limit(page.limit);
    return RA.ok(
      rows.map((row) => ({
        blockId: BlockId.orThrow(row.blockId),
        blockedActorId: ActorId.orThrow(row.blockedActorId),
      })),
    );
  },
});
