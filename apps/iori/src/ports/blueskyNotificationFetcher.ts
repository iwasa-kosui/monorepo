import type { RA } from '@iwasa-kosui/result';

import type { BlueskyFetchedNotification } from '../domain/blueskyNotification/blueskyNotification.ts';
import type { BlueskyClientError } from './blueskyClient.ts';

export type BlueskyNotificationPage = Readonly<{
  items: readonly BlueskyFetchedNotification[];
  dropped: number;
  cursor: string | undefined;
}>;

export type BlueskyNotificationFetcher = Readonly<{
  fetch: (
    input: Readonly<{ limit: number; cursor: string | undefined }>,
  ) => RA<BlueskyNotificationPage, BlueskyClientError>;
}>;
