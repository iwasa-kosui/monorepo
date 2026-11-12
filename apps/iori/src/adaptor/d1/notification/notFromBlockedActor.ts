import { type AnyColumn, sql } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';

import {
  blocksTable,
  notificationEmojiReactsTable,
  notificationFollowsTable,
  notificationLikesTable,
  notificationMentionsTable,
  notificationRepliesTable,
  notificationRepostsTable,
  notificationsTable,
} from '../schema.ts';

const notBlockedIn = (child: SQLiteTable, notificationId: AnyColumn, actorId: AnyColumn) =>
  sql`not exists (
    select 1 from ${child}
      join ${blocksTable} on ${blocksTable.blockedActorId} = ${actorId}
      where ${notificationId} = ${notificationsTable.notificationId}
        and ${blocksTable.userId} = ${notificationsTable.recipientUserId}
  )`;

export const notFromBlockedActor = sql`(${
  sql.join([
    notBlockedIn(
      notificationLikesTable,
      notificationLikesTable.notificationId,
      notificationLikesTable.likerActorId,
    ),
    notBlockedIn(
      notificationFollowsTable,
      notificationFollowsTable.notificationId,
      notificationFollowsTable.followerActorId,
    ),
    notBlockedIn(
      notificationEmojiReactsTable,
      notificationEmojiReactsTable.notificationId,
      notificationEmojiReactsTable.reactorActorId,
    ),
    notBlockedIn(
      notificationRepliesTable,
      notificationRepliesTable.notificationId,
      notificationRepliesTable.replierActorId,
    ),
    notBlockedIn(
      notificationRepostsTable,
      notificationRepostsTable.notificationId,
      notificationRepostsTable.reposterActorId,
    ),
    notBlockedIn(
      notificationMentionsTable,
      notificationMentionsTable.notificationId,
      notificationMentionsTable.mentionerActorId,
    ),
  ], sql` and `)
})`;
