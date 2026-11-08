import { RA, Result } from '@iwasa-kosui/result';

import {
  BLUESKY_TIMELINE_RETENTION_DAYS,
  type BlueskyTimelineItemsExpiredStore,
} from '../domain/blueskyTimeline/blueskyTimelineItem.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { UseCase } from './useCase.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

export type ExpireBlueskyTimelineUseCase = UseCase<void, void, never>;

type Deps = Readonly<{
  expiredStore: BlueskyTimelineItemsExpiredStore;
  now: () => Instant;
}>;

const create = ({ expiredStore, now }: Deps): ExpireBlueskyTimelineUseCase => ({
  run: async () => {
    const retentionStart = Instant.addDuration(now(), -BLUESKY_TIMELINE_RETENTION_DAYS * DAY_MS);
    Result.unsafeUnwrap(await expiredStore.expire(retentionStart));
    return RA.ok(undefined);
  },
});

export const ExpireBlueskyTimelineUseCase = {
  create,
} as const;
