import type { DatabaseSync } from 'node:sqlite';

import { BlueskyAccountSwitch } from '../../../domain/blueskyAccountSwitch/blueskyAccountSwitch.ts';

export const insertBlueskyAccountSwitch = (
  sqlite: DatabaseSync,
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
    'INSERT INTO bluesky_account_switch(id,switchId,fromDid,toDid,startedAt,attempts,lastError,deletedCounts,updatedAt) VALUES (?,?,?,?,?,?,?,?,?)',
  ).run(
    'default',
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
} as const;

const inserts: Readonly<Record<keyof typeof BLUESKY_DATA_TABLES, { sql: string; values: (i: number) => unknown[] }>> = {
  syncStatus: {
    sql: 'INSERT INTO bluesky_sync_status(scope) VALUES (?)',
    values: (i) => [`scope-${i}`],
  },
  crossposts: {
    sql: 'INSERT INTO bluesky_crossposts(postId,status,createdAt,updatedAt) VALUES (?,?,?,?)',
    values: (i) => [`post-${i}`, i % 2 === 0 ? 'pending' : 'sent', AT, AT],
  },
  timelineItems: {
    sql:
      'INSERT INTO bluesky_timeline_items(feedItemId,uri,cid,authorDid,authorHandle,text,facets,postedAt,indexedAt,fetchedAt) VALUES (?,?,?,?,?,?,?,?,?,?)',
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
    sql: 'INSERT INTO bluesky_likes(subjectUri,likeUri,createdAt) VALUES (?,?,?)',
    values: (i) => [`at://subject/${i}`, `at://like/${i}`, AT],
  },
  reposts: {
    sql: 'INSERT INTO bluesky_reposts(subjectUri,repostUri,createdAt) VALUES (?,?,?)',
    values: (i) => [`at://subject/${i}`, `at://repost/${i}`, AT],
  },
  bookmarks: {
    sql: 'INSERT INTO bluesky_bookmarks(subjectUri,createdAt) VALUES (?,?)',
    values: (i) => [`at://subject/${i}`, AT],
  },
  moderatedActors: {
    sql: 'INSERT INTO bluesky_moderated_actors(did,muted,updatedAt) VALUES (?,?,?)',
    values: (i) => [`did:plc:actor${i}`, 1, AT],
  },
  notificationReceipts: {
    sql: 'INSERT INTO bluesky_notification_receipts(uri,indexedAt,receivedAt) VALUES (?,?,?)',
    values: (i) => [`at://receipt/${i}`, AT, AT],
  },
  notificationSyncState: {
    sql: 'INSERT INTO bluesky_notification_sync_state(id,initialSyncCompletedAt) VALUES (?,?)',
    values: (i) => [`state-${i}`, AT],
  },
};

export const seedBlueskyData = (sqlite: DatabaseSync, sizes: BlueskyDataSizes) => {
  sqlite.exec('BEGIN');
  for (const [name, { sql, values }] of Object.entries(inserts)) {
    const statement = sqlite.prepare(sql);
    const size = sizes[name as keyof BlueskyDataSizes] ?? 0;
    for (let i = 0; i < size; i += 1) statement.run(...(values(i) as never[]));
  }
  sqlite.exec('COMMIT');
};

export const seedPostSwitchBlueskyData = (sqlite: DatabaseSync, createdAt: number) => {
  sqlite.prepare('INSERT INTO bluesky_crossposts(postId,status,createdAt,updatedAt) VALUES (?,?,?,?)')
    .run('post-after', 'sent', createdAt, createdAt);
  sqlite.prepare('INSERT INTO bluesky_likes(subjectUri,likeUri,createdAt) VALUES (?,?,?)')
    .run('at://subject/after', 'at://like/after', createdAt);
  sqlite.prepare('INSERT INTO bluesky_reposts(subjectUri,repostUri,createdAt) VALUES (?,?,?)')
    .run('at://subject/after', 'at://repost/after', createdAt);
  sqlite.prepare('INSERT INTO bluesky_bookmarks(subjectUri,createdAt) VALUES (?,?)')
    .run('at://subject/after', createdAt);
  sqlite.prepare('INSERT INTO bluesky_moderated_actors(did,muted,updatedAt) VALUES (?,?,?)')
    .run('did:plc:after', 1, createdAt);
};

export const countBlueskyData = (sqlite: DatabaseSync): Record<keyof typeof BLUESKY_DATA_TABLES, number> =>
  Object.fromEntries(
    Object.entries(BLUESKY_DATA_TABLES).map(([name, table]) => [
      name,
      Number((sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number | bigint }).n),
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
    'INSERT INTO notification_bluesky(notificationId,blueskyUri,reason,authorDid,authorHandle) VALUES (?,?,?,?,?)',
  );
  for (const notification of notifications) {
    parent.run(notification.id, userId, notification.type, 0, notification.createdAt);
    if (notification.type.startsWith('bluesky')) {
      child.run(notification.id, `at://notification/${notification.id}`, 'like', 'did:plc:x', 'x.test');
    }
  }
  sqlite.exec('COMMIT');
};

export const seedNotificationMarker = (sqlite: DatabaseSync, userId: string, lastReadId: string) => {
  sqlite.prepare('INSERT INTO mastodon_markers(userId,timeline,lastReadId,version,updatedAt) VALUES (?,?,?,?,?)')
    .run(userId, 'notifications', lastReadId, 1, AT);
};
