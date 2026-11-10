import { RA, Result } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import {
  BLUESKY_CROSSPOST_PENDING_GRACE_MS,
  BLUESKY_CROSSPOST_RETRY_LIMIT,
  type BlueskyCrosspostDeletedStore,
  type BlueskyCrosspostSavedStore,
  type BlueskyCrosspostsResolverByRetryable,
  MAX_BLUESKY_CROSSPOST_ATTEMPTS,
  MAX_BLUESKY_DELETE_ATTEMPTS,
} from '../domain/blueskyCrosspost/blueskyCrosspost.ts';
import type { BlueskyTimelineItemsDeletedStore } from '../domain/blueskyTimeline/blueskyTimelineItem.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { BlueskyClient } from '../ports/blueskyClient.ts';
import { deleteBlueskyRecordWith } from './helper/deleteBlueskyRecord.ts';
import type { SendBlueskyCrosspostOutcome, SendBlueskyCrosspostUseCase } from './sendBlueskyCrosspost.ts';
import type { UseCase } from './useCase.ts';

export type RetryBlueskyCrosspostsOutcome = SendBlueskyCrosspostOutcome | 'deleted' | 'deleteFailed';

export type RetryBlueskyCrosspostsSummary = Readonly<Record<RetryBlueskyCrosspostsOutcome, number>>;

export type RetryBlueskyCrosspostsUseCase = UseCase<void, RetryBlueskyCrosspostsSummary, never>;

type Deps = Readonly<{
  crosspostsResolverByRetryable: BlueskyCrosspostsResolverByRetryable;
  crosspostSavedStore: BlueskyCrosspostSavedStore;
  crosspostDeletedStore: BlueskyCrosspostDeletedStore;
  timelineItemsDeletedStore: BlueskyTimelineItemsDeletedStore;
  client: BlueskyClient;
  send: SendBlueskyCrosspostUseCase;
  now: () => Instant;
}>;

const create = (deps: Deps): RetryBlueskyCrosspostsUseCase => {
  const deleteRemote = deleteBlueskyRecordWith(deps);

  return {
    run: async () => {
      const crossposts = Result.unsafeUnwrap(
        await deps.crosspostsResolverByRetryable.resolve({
          pendingCreatedBefore: Instant.orThrow(deps.now() - BLUESKY_CROSSPOST_PENDING_GRACE_MS),
          maxAttempts: MAX_BLUESKY_CROSSPOST_ATTEMPTS,
          maxDeleteAttempts: MAX_BLUESKY_DELETE_ATTEMPTS,
          limit: BLUESKY_CROSSPOST_RETRY_LIMIT,
        }),
      );
      const summary: Record<RetryBlueskyCrosspostsOutcome, number> = {
        sent: 0,
        failed: 0,
        skipped: 0,
        gone: 0,
        noop: 0,
        deleted: 0,
        deleteFailed: 0,
      };
      for (const crosspost of crossposts) {
        if (crosspost.status === 'deleting') {
          try {
            const outcome = await deleteRemote(crosspost);
            summary[outcome === 'deleted' ? 'deleted' : 'deleteFailed'] += 1;
          } catch (error) {
            getLogger().error(`Bluesky record deletion failed unexpectedly: ${crosspost.postId}`, {
              errorName: error instanceof Error ? error.name : typeof error,
            });
            summary.deleteFailed += 1;
          }
          continue;
        }
        const outcome = Result.unsafeUnwrap(await deps.send.run({ postId: crosspost.postId }));
        summary[outcome] += 1;
      }
      return RA.ok(summary);
    },
  };
};

export const RetryBlueskyCrosspostsUseCase = { create } as const;
