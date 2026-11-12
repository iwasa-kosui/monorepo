import { and, eq, inArray, or, sql } from 'drizzle-orm';

import type { DirectMessageNotificationsReadMarker } from '../../../domain/fediverseConversation/fediverseConversation.ts';
import type { IoriD1Db } from '../client.ts';
import { idsJson } from '../idsJson.ts';
import { notificationMentionsTable, notificationRepliesTable, notificationsTable } from '../schema.ts';

export const createD1DirectMessageNotificationsReadMarker = (db: IoriD1Db): DirectMessageNotificationsReadMarker => ({
  markRead: async ({ userId, postIds }) => {
    if (postIds.length === 0) return;
    const postIdSelection = sql`(select value from json_each(${idsJson(postIds)}))`;
    await db.update(notificationsTable)
      .set({ isRead: 1 })
      .where(and(
        eq(notificationsTable.recipientUserId, userId),
        eq(notificationsTable.isRead, 0),
        or(
          inArray(
            notificationsTable.notificationId,
            db.select({ id: notificationMentionsTable.notificationId }).from(notificationMentionsTable)
              .where(inArray(notificationMentionsTable.mentionPostId, postIdSelection)),
          ),
          inArray(
            notificationsTable.notificationId,
            db.select({ id: notificationRepliesTable.notificationId }).from(notificationRepliesTable)
              .where(inArray(notificationRepliesTable.replyPostId, postIdSelection)),
          ),
        ),
      ));
  },
});
