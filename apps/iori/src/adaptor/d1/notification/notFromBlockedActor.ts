import { sql } from 'drizzle-orm';

import {
  blocksTable,
  notificationEmojiReactsTable,
  notificationFollowsTable,
  notificationLikesTable,
  notificationRepliesTable,
  notificationRepostsTable,
  notificationsTable,
} from '../schema.ts';

export const notFromBlockedActor = sql`not exists (
  select 1 from ${blocksTable}
  where ${blocksTable.userId} = ${notificationsTable.recipientUserId}
    and ${blocksTable.blockedActorId} in (
      select ${notificationLikesTable.likerActorId} from ${notificationLikesTable}
        where ${notificationLikesTable.notificationId} = ${notificationsTable.notificationId}
      union all
      select ${notificationFollowsTable.followerActorId} from ${notificationFollowsTable}
        where ${notificationFollowsTable.notificationId} = ${notificationsTable.notificationId}
      union all
      select ${notificationEmojiReactsTable.reactorActorId} from ${notificationEmojiReactsTable}
        where ${notificationEmojiReactsTable.notificationId} = ${notificationsTable.notificationId}
      union all
      select ${notificationRepliesTable.replierActorId} from ${notificationRepliesTable}
        where ${notificationRepliesTable.notificationId} = ${notificationsTable.notificationId}
      union all
      select ${notificationRepostsTable.reposterActorId} from ${notificationRepostsTable}
        where ${notificationRepostsTable.notificationId} = ${notificationsTable.notificationId}
    )
)`;
