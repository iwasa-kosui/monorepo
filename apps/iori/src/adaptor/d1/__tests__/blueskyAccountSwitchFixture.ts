import type { DatabaseSync } from 'node:sqlite';

import { BlueskyAccountSwitch } from '../../../domain/blueskyAccountSwitch/blueskyAccountSwitch.ts';

/** userId は users に存在するユーザー（外部キー）。 */
export const insertBlueskyAccountSwitch = (
  sqlite: DatabaseSync,
  userId: string,
  overrides: Partial<{
    switchId: string;
    fromDid: string;
    toDid: string;
    startedAt: number;
    attempts: number;
    lastError: string | null;
  }> = {},
) => {
  const row = {
    switchId: crypto.randomUUID(),
    fromDid: 'did:plc:old',
    toDid: 'did:plc:alice',
    startedAt: 1_800_000_000_000,
    attempts: 0,
    lastError: null,
    ...overrides,
  };
  sqlite.prepare(
    'INSERT INTO bluesky_account_switch(userId,switchId,fromDid,toDid,startedAt,attempts,lastError,deletedCounts,updatedAt) VALUES (?,?,?,?,?,?,?,?,?)',
  ).run(
    userId,
    row.switchId,
    row.fromDid,
    row.toDid,
    row.startedAt,
    row.attempts,
    row.lastError,
    JSON.stringify(BlueskyAccountSwitch.emptyCounts),
    row.startedAt,
  );
  return row;
};

export type BlueskyDataSizes = Readonly<{
  syncStatus?: number;
  crossposts?: number;
  timelineItems?: number;
  likes?: number;
  reposts?: number;
  bookmarks?: number;
  moderatedActors?: number;
  notificationReceipts?: number;
  notificationSyncState?: number;
  chatPushReceipts?: number;
}>;

const AT = 1_000_000_000_000;

export const BLUESKY_DATA_TABLES = {
  syncStatus: 'bluesky_sync_status',
  crossposts: 'bluesky_crossposts',
  timelineItems: 'bluesky_timeline_items',
  likes: 'bluesky_likes',
  reposts: 'bluesky_reposts',
  bookmarks: 'bluesky_bookmarks',
  moderatedActors: 'bluesky_moderated_actors',
  notificationReceipts: 'bluesky_notification_receipts',
  notificationSyncState: 'bluesky_notification_sync_state',
  chatPushReceipts: 'bluesky_chat_push_receipts',
} as const;

// 各 SQL の先頭の列は userId。
const inserts: Readonly<Record<keyof typeof BLUESKY_DATA_TABLES, { sql: string; values: (i: number) => unknown[] }>> = {
  syncStatus: {
    sql: 'INSERT INTO bluesky_sync_status(userId,scope) VALUES (?,?)',
    values: (i) => [`scope-${i}`],
  },
  crossposts: {
    sql: 'INSERT INTO bluesky_crossposts(userId,postId,status,createdAt,updatedAt) VALUES (?,?,?,?,?)',
    values: (i) => [`post-${i}`, i % 2 === 0 ? 'pending' : 'sent', AT, AT],
  },
  timelineItems: {
    sql:
      'INSERT INTO bluesky_timeline_items(userId,feedItemId,uri,cid,authorDid,authorHandle,text,facets,postedAt,indexedAt,fetchedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    values: (
      i,
    ) => [
      `item-${i}`,
      `at://did:plc:x/app.bsky.feed.post/${i}`,
      'cid',
      'did:plc:x',
      'x.test',
      'text',
      '[]',
      AT,
      AT,
      AT,
    ],
  },
  likes: {
    sql: 'INSERT INTO bluesky_likes(userId,subjectUri,likeUri,createdAt) VALUES (?,?,?,?)',
    values: (i) => [`at://subject/${i}`, `at://like/${i}`, AT],
  },
  reposts: {
    sql: 'INSERT INTO bluesky_reposts(userId,subjectUri,repostUri,createdAt) VALUES (?,?,?,?)',
    values: (i) => [`at://subject/${i}`, `at://repost/${i}`, AT],
  },
  bookmarks: {
    sql: 'INSERT INTO bluesky_bookmarks(userId,subjectUri,createdAt) VALUES (?,?,?)',
    values: (i) => [`at://subject/${i}`, AT],
  },
  moderatedActors: {
    sql: 'INSERT INTO bluesky_moderated_actors(userId,did,muted,updatedAt) VALUES (?,?,?,?)',
    values: (i) => [`did:plc:actor${i}`, 1, AT],
  },
  notificationReceipts: {
    sql: 'INSERT INTO bluesky_notification_receipts(userId,uri,indexedAt,receivedAt) VALUES (?,?,?,?)',
    values: (i) => [`at://receipt/${i}`, AT, AT],
  },
  notificationSyncState: {
    // ユーザーごとに 1 行しかないので、size は 0 か 1 として扱う。
    sql: 'INSERT OR IGNORE INTO bluesky_notification_sync_state(userId,initialSyncCompletedAt) VALUES (?,?)',
    values: () => [AT],
  },
  chatPushReceipts: {
    sql: 'INSERT INTO bluesky_chat_push_receipts(userId,convoId,lastMessageId,notifiedAt) VALUES (?,?,?,?)',
    values: (i) => [`convo-${i}`, `message-${i}`, AT],
  },
};

export const seedBlueskyData = (sqlite: DatabaseSync, userId: string, sizes: BlueskyDataSizes) => {
  sqlite.exec('BEGIN');
  for (const [name, { sql, values }] of Object.entries(inserts)) {
    const statement = sqlite.prepare(sql);
    const size = sizes[name as keyof BlueskyDataSizes] ?? 0;
    for (let i = 0; i < size; i += 1) statement.run(userId, ...(values(i) as never[]));
  }
  sqlite.exec('COMMIT');
};

export const seedPostSwitchBlueskyData = (sqlite: DatabaseSync, userId: string, createdAt: number) => {
  sqlite.prepare('INSERT INTO bluesky_crossposts(userId,postId,status,createdAt,updatedAt) VALUES (?,?,?,?,?)')
    .run(userId, 'post-after', 'sent', createdAt, createdAt);
  sqlite.prepare('INSERT INTO bluesky_likes(userId,subjectUri,likeUri,createdAt) VALUES (?,?,?,?)')
    .run(userId, 'at://subject/after', 'at://like/after', createdAt);
  sqlite.prepare('INSERT INTO bluesky_reposts(userId,subjectUri,repostUri,createdAt) VALUES (?,?,?,?)')
    .run(userId, 'at://subject/after', 'at://repost/after', createdAt);
  sqlite.prepare('INSERT INTO bluesky_bookmarks(userId,subjectUri,createdAt) VALUES (?,?,?)')
    .run(userId, 'at://subject/after', createdAt);
  sqlite.prepare('INSERT INTO bluesky_moderated_actors(userId,did,muted,updatedAt) VALUES (?,?,?,?)')
    .run(userId, 'did:plc:after', 1, createdAt);
};

/** userId を渡すとそのユーザーの行だけを数える。 */
export const countBlueskyData = (
  sqlite: DatabaseSync,
  userId?: string,
): Record<keyof typeof BLUESKY_DATA_TABLES, number> =>
  Object.fromEntries(
    Object.entries(BLUESKY_DATA_TABLES).map(([name, table]) => [
      name,
      Number(
        (
          (userId === undefined
            ? sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()
            : sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE userId = ?`).get(userId)) as {
              n: number | bigint;
            }
        ).n,
      ),
    ]),
  ) as Record<keyof typeof BLUESKY_DATA_TABLES, number>;

export type SeededNotification = Readonly<{ id: string; type: string; createdAt: number }>;

export const seedNotifications = (
  sqlite: DatabaseSync,
  userId: string,
  notifications: ReadonlyArray<SeededNotification>,
) => {
  sqlite.exec('BEGIN');
  const parent = sqlite.prepare(
    'INSERT INTO notifications(notificationId,recipientUserId,type,isRead,createdAt) VALUES (?,?,?,?,?)',
  );
  const child = sqlite.prepare(
    'INSERT INTO notification_bluesky(notificationId,recipientUserId,blueskyUri,reason,authorDid,authorHandle) VALUES (?,?,?,?,?,?)',
  );
  for (const notification of notifications) {
    parent.run(notification.id, userId, notification.type, 0, notification.createdAt);
    if (notification.type.startsWith('bluesky')) {
      child.run(notification.id, userId, `at://notification/${notification.id}`, 'like', 'did:plc:x', 'x.test');
    }
  }
  sqlite.exec('COMMIT');
};

export const seedNotificationMarker = (sqlite: DatabaseSync, userId: string, lastReadId: string) => {
  sqlite.prepare('INSERT INTO mastodon_markers(userId,timeline,lastReadId,version,updatedAt) VALUES (?,?,?,?,?)')
    .run(userId, 'notifications', lastReadId, 1, AT);
};
