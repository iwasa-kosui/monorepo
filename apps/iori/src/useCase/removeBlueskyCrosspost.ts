import { RA, Result } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import {
  BlueskyCrosspost,
  type BlueskyCrosspostDeletedStore,
  type BlueskyCrosspostResolver,
  type BlueskyCrosspostSavedStore,
} from '../domain/blueskyCrosspost/blueskyCrosspost.ts';
import type { Instant } from '../domain/instant/instant.ts';
import type { PostId } from '../domain/post/postId.ts';
import type { BlueskyClient } from '../ports/blueskyClient.ts';
import { deleteBlueskyRecordWith } from './helper/deleteBlueskyRecord.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ postId: PostId }>;

export type RemoveBlueskyCrosspostOutcome = 'noop' | 'removed' | 'deleting' | 'error';

export type RemoveBlueskyCrosspostUseCase = UseCase<Input, RemoveBlueskyCrosspostOutcome, never>;

type Deps = Readonly<{
  crosspostResolver: BlueskyCrosspostResolver;
  crosspostSavedStore: BlueskyCrosspostSavedStore;
  crosspostDeletedStore: BlueskyCrosspostDeletedStore;
  client: BlueskyClient;
  waitUntil: (promise: Promise<unknown>) => void;
  now: () => Instant;
}>;

const create = (deps: Deps): RemoveBlueskyCrosspostUseCase => {
  const deleteRemote = deleteBlueskyRecordWith(deps);

  const deleteRemoteSafely = async (crosspost: BlueskyCrosspost): Promise<void> => {
    try {
      await deleteRemote(crosspost);
    } catch (error) {
      getLogger().error(`Bluesky record deletion failed unexpectedly: ${crosspost.postId}`, {
        errorName: error instanceof Error ? error.name : typeof error,
      });
    }
  };

  const execute = async ({ postId }: Input): Promise<RemoveBlueskyCrosspostOutcome> => {
    const crosspost = Result.unsafeUnwrap(await deps.crosspostResolver.resolve(postId));
    if (crosspost === undefined) return 'noop';
    if ((crosspost.status === 'sent' || crosspost.status === 'deleting') && crosspost.rkey !== null) {
      const deleting = BlueskyCrosspost.markDeleting(crosspost, deps.now());
      Result.unsafeUnwrap(await deps.crosspostSavedStore.save(deleting));
      deps.waitUntil(deleteRemoteSafely(deleting));
      return 'deleting';
    }
    await deps.crosspostDeletedStore.delete(postId);
    return 'removed';
  };

  const run = async (input: Input) => {
    try {
      return RA.ok(await execute(input));
    } catch (error) {
      getLogger().error(`Bluesky crosspost could not be removed: ${input.postId}`, {
        errorName: error instanceof Error ? error.name : typeof error,
      });
      return RA.ok<RemoveBlueskyCrosspostOutcome>('error');
    }
  };

  return { run };
};

export const RemoveBlueskyCrosspostUseCase = { create } as const;
