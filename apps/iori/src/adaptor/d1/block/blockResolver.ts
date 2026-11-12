import { RA } from '@iwasa-kosui/result';
import { and, eq } from 'drizzle-orm';

import { Block, type BlockResolver } from '../../../domain/block/block.ts';
import { BlockId } from '../../../domain/block/blockId.ts';
import type { IoriD1Db } from '../client.ts';
import { blocksTable } from '../schema.ts';

const reconstructBlock = (row: typeof blocksTable.$inferSelect) =>
  Block.orThrow({
    blockId: BlockId.orThrow(row.blockId),
    userId: row.userId,
    blockedActorId: row.blockedActorId,
  });

export const createD1BlockResolver = (db: IoriD1Db): BlockResolver => ({
  resolve: async ({ userId, blockedActorId }) => {
    const [row, ...rest] = await db.select().from(blocksTable)
      .where(and(eq(blocksTable.userId, userId), eq(blocksTable.blockedActorId, blockedActorId)));
    if (row === undefined) return RA.ok(undefined);
    if (rest.length > 0) throw new Error('Inconsistent state: multiple block records found');
    return RA.ok(reconstructBlock(row));
  },
});
