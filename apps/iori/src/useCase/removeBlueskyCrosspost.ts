import { RA, Result } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import type {
  BlueskyCrosspostDeletedStore,
  BlueskyCrosspostResolver,
} from '../domain/blueskyCrosspost/blueskyCrosspost.ts';
import type { PostId } from '../domain/post/postId.ts';
import type { BlueskyClient } from '../ports/blueskyClient.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ postId: PostId }>;

export type RemoveBlueskyCrosspostOutcome = 'noop' | 'removed' | 'deleting' | 'error';

export type RemoveBlueskyCrosspostUseCase = UseCase<Input, RemoveBlueskyCrosspostOutcome, never>;

type Deps = Readonly<{
  crosspostResolver: BlueskyCrosspostResolver;
  crosspostDeletedStore: BlueskyCrosspostDeletedStore;
  client: BlueskyClient;
  waitUntil: (promise: Promise<unknown>) => void;
}>;

const create = (deps: Deps): RemoveBlueskyCrosspostUseCase => {
  const deleteRemote = async (postId: PostId, rkey: string): Promise<void> => {
    try {
      const deleted = await deps.client.deleteRecord(rkey);
      if (!deleted.ok) {
        getLogger().warn(`Bluesky record could not be deleted: ${postId}`, { reason: deleted.err.message });
        return;
      }
      await deps.crosspostDeletedStore.delete(postId);
    } catch (error) {
      getLogger().error(`Bluesky record deletion failed unexpectedly: ${postId}`, {
        errorName: error instanceof Error ? error.name : typeof error,
      });
    }
  };

  const execute = async ({ postId }: Input): Promise<RemoveBlueskyCrosspostOutcome> => {
    const crosspost = Result.unsafeUnwrap(await deps.crosspostResolver.resolve(postId));
    if (crosspost === undefined) return 'noop';
    if (crosspost.status === 'sent' && crosspost.rkey !== null) {
      deps.waitUntil(deleteRemote(postId, crosspost.rkey));
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
