import { RA, Result } from '@iwasa-kosui/result';

import {
  BLUESKY_NOTIFICATION_RETENTION_DAYS,
  type BlueskyNotificationReceiptsExpiredStore,
} from '../domain/blueskyNotification/blueskyNotification.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { UseCase } from './useCase.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

export type ExpireBlueskyNotificationReceiptsUseCase = UseCase<void, void, never>;

type Deps = Readonly<{
  expiredStore: BlueskyNotificationReceiptsExpiredStore;
  now: () => Instant;
}>;

const create = ({ expiredStore, now }: Deps): ExpireBlueskyNotificationReceiptsUseCase => ({
  run: async () => {
    const retentionStart = Instant.addDuration(now(), -(BLUESKY_NOTIFICATION_RETENTION_DAYS + 1) * DAY_MS);
    Result.unsafeUnwrap(await expiredStore.expire(retentionStart));
    return RA.ok(undefined);
  },
});

export const ExpireBlueskyNotificationReceiptsUseCase = {
  create,
} as const;
