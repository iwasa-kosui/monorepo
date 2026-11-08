import { RA, Result } from '@iwasa-kosui/result';

import {
  BLUESKY_CROSSPOST_PENDING_GRACE_MS,
  BLUESKY_CROSSPOST_RETRY_LIMIT,
  type BlueskyCrosspostsResolverByRetryable,
  MAX_BLUESKY_CROSSPOST_ATTEMPTS,
} from '../domain/blueskyCrosspost/blueskyCrosspost.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { SendBlueskyCrosspostOutcome, SendBlueskyCrosspostUseCase } from './sendBlueskyCrosspost.ts';
import type { UseCase } from './useCase.ts';

export type RetryBlueskyCrosspostsSummary = Readonly<Record<SendBlueskyCrosspostOutcome, number>>;

export type RetryBlueskyCrosspostsUseCase = UseCase<void, RetryBlueskyCrosspostsSummary, never>;

type Deps = Readonly<{
  crosspostsResolverByRetryable: BlueskyCrosspostsResolverByRetryable;
  send: SendBlueskyCrosspostUseCase;
  now: () => Instant;
}>;

const create = ({ crosspostsResolverByRetryable, send, now }: Deps): RetryBlueskyCrosspostsUseCase => ({
  run: async () => {
    const crossposts = Result.unsafeUnwrap(
      await crosspostsResolverByRetryable.resolve({
        pendingCreatedBefore: Instant.orThrow(now() - BLUESKY_CROSSPOST_PENDING_GRACE_MS),
        maxAttempts: MAX_BLUESKY_CROSSPOST_ATTEMPTS,
        limit: BLUESKY_CROSSPOST_RETRY_LIMIT,
      }),
    );
    const summary: Record<SendBlueskyCrosspostOutcome, number> = { sent: 0, failed: 0, skipped: 0, gone: 0, noop: 0 };
    for (const crosspost of crossposts) {
      const outcome = Result.unsafeUnwrap(await send.run({ postId: crosspost.postId }));
      summary[outcome] += 1;
    }
    return RA.ok(summary);
  },
});

export const RetryBlueskyCrosspostsUseCase = { create } as const;
