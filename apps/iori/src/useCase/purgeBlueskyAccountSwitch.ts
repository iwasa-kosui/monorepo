import { RA, Result } from '@iwasa-kosui/result';

import {
  BLUESKY_ACCOUNT_SWITCH_PURGE_BATCH_SIZE,
  BLUESKY_ACCOUNT_SWITCH_PURGE_TARGETS,
  BLUESKY_ACCOUNT_SWITCH_PURGE_TIME_BUDGET_MS,
  BlueskyAccountSwitch,
  type BlueskyAccountSwitchCompletedStore,
  type BlueskyAccountSwitchDeletedCounts,
  type BlueskyAccountSwitchFailedStore,
  type BlueskyAccountSwitchProgressStore,
  type BlueskyAccountSwitchPurger,
  type BlueskyAccountSwitchResolver,
} from '../domain/blueskyAccountSwitch/blueskyAccountSwitch.ts';
import type { Instant } from '../domain/instant/instant.ts';
import type { UseCase } from './useCase.ts';

export type PurgeBlueskyAccountSwitchSummary =
  | Readonly<{ status: 'idle' }>
  | Readonly<{ status: 'waiting' }>
  | Readonly<{ status: 'timeBudget'; deletedCounts: BlueskyAccountSwitchDeletedCounts }>
  | Readonly<{ status: 'failed'; attempts: number; stalled: boolean; message: string }>
  | Readonly<{
    status: 'completed';
    fromDid: string;
    toDid: string;
    deletedCounts: BlueskyAccountSwitchDeletedCounts;
  }>;

export type PurgeBlueskyAccountSwitchUseCase = UseCase<void, PurgeBlueskyAccountSwitchSummary, never>;

type Deps = Readonly<{
  accountSwitchResolver: BlueskyAccountSwitchResolver;
  purger: BlueskyAccountSwitchPurger;
  progressStore: BlueskyAccountSwitchProgressStore;
  failedStore: BlueskyAccountSwitchFailedStore;
  completedStore: BlueskyAccountSwitchCompletedStore;
  now: () => Instant;
}>;

const create = ({
  accountSwitchResolver,
  purger,
  progressStore,
  failedStore,
  completedStore,
  now,
}: Deps): PurgeBlueskyAccountSwitchUseCase => {
  const run = async (): RA<PurgeBlueskyAccountSwitchSummary, never> => {
    const resolved = Result.unsafeUnwrap(await accountSwitchResolver.resolve());
    if (resolved === undefined) return RA.ok({ status: 'idle' });
    if (!BlueskyAccountSwitch.isPurgeable(resolved, now())) return RA.ok({ status: 'waiting' });

    let state = resolved;
    const deadline = now() + BLUESKY_ACCOUNT_SWITCH_PURGE_TIME_BUDGET_MS;
    try {
      for (const target of BLUESKY_ACCOUNT_SWITCH_PURGE_TARGETS) {
        for (;;) {
          if (now() >= deadline) return RA.ok({ status: 'timeBudget', deletedCounts: state.deletedCounts });
          const deleted = Result.unsafeUnwrap(await purger.purge(target, state.startedAt));
          if (deleted > 0) {
            Result.unsafeUnwrap(await progressStore.record(state.switchId, target, deleted, now()));
            state = BlueskyAccountSwitch.recordDeleted(state, target, deleted, now());
          }
          if (deleted < BLUESKY_ACCOUNT_SWITCH_PURGE_BATCH_SIZE) break;
        }
      }
    } catch (error) {
      const failed = BlueskyAccountSwitch.fail(
        state,
        error instanceof Error ? `${error.name}: ${error.message}` : 'non-Error value',
        now(),
      );
      Result.unsafeUnwrap(await failedStore.store(failed));
      return RA.ok({
        status: 'failed',
        attempts: failed.attempts,
        stalled: BlueskyAccountSwitch.isStalled(failed),
        message: failed.lastError ?? '',
      });
    }
    Result.unsafeUnwrap(await completedStore.store(BlueskyAccountSwitch.complete(now())(state), state.switchId));
    return RA.ok({
      status: 'completed',
      fromDid: state.fromDid,
      toDid: state.toDid,
      deletedCounts: state.deletedCounts,
    });
  };

  return { run };
};

export const PurgeBlueskyAccountSwitchUseCase = { create } as const;
