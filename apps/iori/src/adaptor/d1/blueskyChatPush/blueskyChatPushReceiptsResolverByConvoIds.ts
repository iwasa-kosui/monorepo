import { RA } from '@iwasa-kosui/result';
import { and, eq, inArray, sql } from 'drizzle-orm';

import type { BlueskyChatPushReceiptsResolverByConvoIds } from '../../../domain/blueskyChatPush/blueskyChatPush.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import type { IoriD1Db } from '../client.ts';
import { idsJson } from '../idsJson.ts';
import { blueskyChatPushReceiptsTable } from '../schema.ts';

export const createD1BlueskyChatPushReceiptsResolverByConvoIds = (
  db: IoriD1Db,
  userId: UserId,
): BlueskyChatPushReceiptsResolverByConvoIds => ({
  resolve: async (convoIds) => {
    if (convoIds.length === 0) return RA.ok(new Map());
    const rows = await db.select({
      convoId: blueskyChatPushReceiptsTable.convoId,
      lastMessageId: blueskyChatPushReceiptsTable.lastMessageId,
    }).from(blueskyChatPushReceiptsTable)
      .where(and(
        eq(blueskyChatPushReceiptsTable.userId, userId),
        inArray(blueskyChatPushReceiptsTable.convoId, sql`(select value from json_each(${idsJson(convoIds)}))`),
      ));
    return RA.ok(new Map(rows.map((row) => [row.convoId, row.lastMessageId])));
  },
});
