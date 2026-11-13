import { RA } from '@iwasa-kosui/result';

import type { Instant } from '../../../domain/instant/instant.ts';
import type {
  BlueskyNotification,
  BlueskyNotificationCreatedStore,
} from '../../../domain/notification/notification.ts';
import type { IoriD1Db } from '../client.ts';
import { eventRow, notificationRow } from '../notification/inboxNotificationAdapters.ts';
import { runBatch } from '../runBatch.ts';
import {
  blueskyNotificationReceiptsTable,
  domainEventsTable,
  notificationBlueskyTable,
  notificationsTable,
} from '../schema.ts';

const reasonOf = (notification: BlueskyNotification): string => {
  switch (notification.type) {
    case 'blueskyLike':
      return 'like';
    case 'blueskyRepost':
      return 'repost';
    case 'blueskyLikeViaRepost':
      return 'like-via-repost';
    case 'blueskyRepostViaRepost':
      return 'repost-via-repost';
    case 'blueskyFollow':
      return 'follow';
    case 'blueskyMention':
      return notification.reason;
  }
};

const subtypeRow = (notification: BlueskyNotification) => ({
  notificationId: notification.notificationId,
  blueskyUri: notification.blueskyUri,
  reason: reasonOf(notification),
  authorDid: notification.author.did,
  authorHandle: notification.author.handle,
  authorDisplayName: notification.author.displayName,
  authorAvatar: notification.author.avatarUrl,
  subjectUri: notification.type === 'blueskyFollow' ? null : notification.subjectUri,
  targetPostId: notification.type === 'blueskyFollow' ? null : notification.targetPostId,
  text: notification.type === 'blueskyMention' ? notification.text : null,
});

export const createD1BlueskyNotificationCreatedStore = (
  db: IoriD1Db,
  deps: Readonly<{ now: () => Instant }>,
): BlueskyNotificationCreatedStore => ({
  store: async (...events) => {
    const receivedAt = new Date(deps.now());
    await runBatch(
      db,
      events.flatMap((event) => [
        db.insert(notificationsTable).values(notificationRow(event.aggregateState, event.occurredAt)),
        db.insert(notificationBlueskyTable).values(subtypeRow(event.aggregateState)),
        db.insert(blueskyNotificationReceiptsTable).values({
          uri: event.aggregateState.blueskyUri,
          indexedAt: new Date(event.occurredAt),
          receivedAt,
        }),
        db.insert(domainEventsTable).values(eventRow(event)),
      ]),
    );
    return RA.ok(undefined);
  },
});
