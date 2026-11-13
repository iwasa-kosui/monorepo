import { RA } from '@iwasa-kosui/result';
import { inArray, sql } from 'drizzle-orm';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';

import {
  BLUESKY_ACCOUNT_SWITCH_PURGE_BATCH_SIZE,
  type BlueskyAccountSwitchPurger,
  type BlueskyAccountSwitchPurgeTarget,
} from '../../../domain/blueskyAccountSwitch/blueskyAccountSwitch.ts';
import type { Instant } from '../../../domain/instant/instant.ts';
import type { IoriD1Db } from '../client.ts';
import { idsJson } from '../idsJson.ts';
import { moveMarkersBeforeDismissed } from '../notification/inboxNotificationAdapters.ts';
import { runBatch } from '../runBatch.ts';
import {
  blueskyBookmarksTable,
  blueskyChatPushReceiptsTable,
  blueskyCrosspostsTable,
  blueskyLikesTable,
  blueskyModeratedActorsTable,
  blueskyNotificationReceiptsTable,
  blueskyNotificationSyncStateTable,
  blueskyRepostsTable,
  blueskySyncStatusTable,
  blueskyTimelineItemsTable,
  notificationBlueskyTable,
  notificationsTable,
} from '../schema.ts';

export const BLUESKY_NOTIFICATION_TYPES = [
  'blueskyLike',
  'blueskyRepost',
  'blueskyLikeViaRepost',
  'blueskyRepostViaRepost',
  'blueskyFollow',
  'blueskyMention',
] as const;

type PurgeSource = Readonly<{ table: SQLiteTable; createdBefore?: SQLiteColumn }>;

const sources: Readonly<Record<Exclude<BlueskyAccountSwitchPurgeTarget, 'notifications'>, PurgeSource>> = {
  syncStatus: { table: blueskySyncStatusTable },
  crossposts: { table: blueskyCrosspostsTable, createdBefore: blueskyCrosspostsTable.createdAt },
  timelineItems: { table: blueskyTimelineItemsTable },
  likes: { table: blueskyLikesTable, createdBefore: blueskyLikesTable.createdAt },
  reposts: { table: blueskyRepostsTable, createdBefore: blueskyRepostsTable.createdAt },
  bookmarks: { table: blueskyBookmarksTable, createdBefore: blueskyBookmarksTable.createdAt },
  moderatedActors: { table: blueskyModeratedActorsTable, createdBefore: blueskyModeratedActorsTable.updatedAt },
  notificationReceipts: { table: blueskyNotificationReceiptsTable },
  notificationSyncState: { table: blueskyNotificationSyncStateTable },
  chatPushReceipts: { table: blueskyChatPushReceiptsTable },
};

const purgeRows = async (db: IoriD1Db, source: PurgeSource, startedAt: Instant): Promise<number> => {
  const { table, createdBefore } = source;
  const scope = createdBefore === undefined ? sql`` : sql` where ${createdBefore} < ${startedAt}`;
  const result = await db.run(
    sql`delete from ${table} where rowid in (select rowid from ${table}${scope} limit ${BLUESKY_ACCOUNT_SWITCH_PURGE_BATCH_SIZE})`,
  );
  return result.meta.changes;
};

const purgeNotifications = async (db: IoriD1Db): Promise<number> => {
  const rows = await db.select({ id: notificationsTable.notificationId }).from(notificationsTable)
    .where(inArray(notificationsTable.type, [...BLUESKY_NOTIFICATION_TYPES]))
    .limit(BLUESKY_ACCOUNT_SWITCH_PURGE_BATCH_SIZE);
  if (rows.length === 0) return 0;
  const ids = sql`(select value from json_each(${idsJson(rows.map((row) => row.id))}))`;
  const recipients = db.select({ id: notificationsTable.recipientUserId }).from(notificationsTable)
    .where(inArray(notificationsTable.notificationId, ids));
  await runBatch(db, [
    ...moveMarkersBeforeDismissed(db, recipients, ids),
    db.delete(notificationBlueskyTable).where(inArray(notificationBlueskyTable.notificationId, ids)),
    db.delete(notificationsTable).where(inArray(notificationsTable.notificationId, ids)),
  ]);
  return rows.length;
};

export const createD1BlueskyAccountSwitchPurger = (db: IoriD1Db): BlueskyAccountSwitchPurger => ({
  purge: async (target, startedAt) =>
    RA.ok(target === 'notifications' ? await purgeNotifications(db) : await purgeRows(db, sources[target], startedAt)),
});
