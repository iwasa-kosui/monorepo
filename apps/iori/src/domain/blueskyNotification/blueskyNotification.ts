import type { RA } from '@iwasa-kosui/result';
import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { Instant } from '../instant/instant.ts';
import { BlueskyNotificationAuthor } from '../notification/notification.ts';
import type { PostId } from '../post/postId.ts';

export const BLUESKY_NOTIFICATION_PAGE_LIMIT = 100;
export const BLUESKY_NOTIFICATION_MAX_PAGES = 5;
export const BLUESKY_NOTIFICATION_RETENTION_DAYS = 30;
export const BLUESKY_NOTIFICATION_PUSH_MAX_PER_RUN = 5;
export const BLUESKY_NOTIFICATION_PUSH_FRESH_WINDOW_MS = 15 * 60 * 1000;
export const BLUESKY_NOTIFICATION_SAVE_CHUNK = 20;

const fetchedBaseShape = {
  uri: z.string().min(1),
  author: BlueskyNotificationAuthor.zodType,
  indexedAt: Instant.zodType,
};

const blueskyFetchedNotificationZodType = z.discriminatedUnion('reason', [
  z.object({ ...fetchedBaseShape, reason: z.literal('like'), subjectUri: z.string().min(1) }),
  z.object({ ...fetchedBaseShape, reason: z.literal('repost'), subjectUri: z.string().min(1) }),
  z.object({ ...fetchedBaseShape, reason: z.literal('follow') }),
  z.object({
    ...fetchedBaseShape,
    reason: z.enum(['mention', 'reply', 'quote']),
    subjectUri: z.string().min(1).nullable(),
    text: z.string(),
  }),
]);

export type BlueskyFetchedNotification = z.infer<typeof blueskyFetchedNotificationZodType>;
export const BlueskyFetchedNotification = Schema.create(blueskyFetchedNotificationZodType);

export const subjectUriOf = (notification: BlueskyFetchedNotification): string | null =>
  'subjectUri' in notification ? notification.subjectUri : null;

export type BlueskyNotificationExistingUrisResolver = Readonly<{
  resolve: (uris: readonly string[]) => RA<readonly string[], never>;
}>;
export type BlueskyNotificationSyncStateResolver = Readonly<{
  resolve: () => RA<Readonly<{ initialSyncCompletedAt: Instant }> | undefined, never>;
}>;
export type BlueskyNotificationInitialSyncCompletedStore = Readonly<{
  store: (completedAt: Instant) => RA<void, never>;
}>;
export type PostIdsResolverByBlueskyUris = Readonly<{
  resolve: (uris: readonly string[]) => RA<ReadonlyMap<string, PostId>, never>;
}>;
export type BlueskyNotificationReceiptsExpiredStore = Readonly<{
  expire: (indexedBefore: Instant) => RA<void, never>;
}>;
