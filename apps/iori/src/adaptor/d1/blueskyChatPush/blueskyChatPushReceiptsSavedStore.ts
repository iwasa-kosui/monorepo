import { RA } from '@iwasa-kosui/result';
import { sql } from 'drizzle-orm';

import type { BlueskyChatPushReceiptsSavedStore } from '../../../domain/blueskyChatPush/blueskyChatPush.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import type { IoriD1Db } from '../client.ts';
import { runBatch } from '../runBatch.ts';
import { blueskyChatPushReceiptsTable } from '../schema.ts';

// D1 のバインド数の上限（100）に収まるよう、1 行 4 列で 24 行ずつ入れる
const CHUNK = 24;

export const createD1BlueskyChatPushReceiptsSavedStore = (db: IoriD1Db, userId: UserId): BlueskyChatPushReceiptsSavedStore => ({
  store: async (...receipts) => {
    const chunks = Array.from(
      { length: Math.ceil(receipts.length / CHUNK) },
      (_, index) => receipts.slice(index * CHUNK, (index + 1) * CHUNK),
    );
    await runBatch(
      db,
      chunks.map((chunk) =>
        db.insert(blueskyChatPushReceiptsTable)
          .values(chunk.map((receipt) => ({
            userId,
            convoId: receipt.convoId,
            lastMessageId: receipt.lastMessageId,
            notifiedAt: new Date(receipt.notifiedAt),
          })))
          .onConflictDoUpdate({
            target: [blueskyChatPushReceiptsTable.userId, blueskyChatPushReceiptsTable.convoId],
            set: {
              lastMessageId: sql`excluded.${sql.identifier('lastMessageId')}`,
              notifiedAt: sql`excluded.${sql.identifier('notifiedAt')}`,
            },
          })
      ),
    );
    return RA.ok(undefined);
  },
});
