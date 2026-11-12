import { RA, Result } from '@iwasa-kosui/result';

import type { BlueskyBlockDeletedStore } from '../domain/blueskyModeration/blueskyModeration.ts';
import type { Instant } from '../domain/instant/instant.ts';
import type { BlueskyClient, BlueskyClientError } from '../ports/blueskyClient.ts';
import type { BlueskyModerationReader } from '../ports/blueskyModerationReader.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ did: string; blockUri?: string }>;

type Ok = Readonly<{ blockUri: null }>;

export type UnblockBlueskyActorUseCase = UseCase<Input, Ok, BlueskyClientError>;

type Deps = Readonly<{
  client: Pick<BlueskyClient, 'deleteBlock'>;
  reader: BlueskyModerationReader;
  deletedStore: BlueskyBlockDeletedStore;
  now: () => Instant;
}>;

const create = ({ client, reader, deletedStore, now }: Deps): UnblockBlueskyActorUseCase => {
  const run = async ({ did, blockUri }: Input): RA<Ok, BlueskyClientError> => {
    let target = blockUri;
    if (target === undefined) {
      const state = await reader.resolveViewerState(did);
      if (!state.ok) return RA.err(state.err);
      target = state.val.blockUri ?? undefined;
    }
    if (target !== undefined) {
      const deleted = await client.deleteBlock(target);
      if (!deleted.ok) return RA.err(deleted.err);
    }
    Result.unsafeUnwrap(await deletedStore.delete(did, now()));
    return RA.ok({ blockUri: null });
  };

  return { run };
};

export const UnblockBlueskyActorUseCase = {
  create,
} as const;
