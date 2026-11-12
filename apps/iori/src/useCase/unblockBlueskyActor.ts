import { RA, Result } from '@iwasa-kosui/result';

import type {
  BlueskyBlockDeletedStore,
  BlueskyModeratedActorsResolver,
} from '../domain/blueskyModeration/blueskyModeration.ts';
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
  resolver: Pick<BlueskyModeratedActorsResolver, 'resolveState'>;
  deletedStore: BlueskyBlockDeletedStore;
  now: () => Instant;
}>;

const create = ({ client, reader, resolver, deletedStore, now }: Deps): UnblockBlueskyActorUseCase => {
  const run = async ({ did, blockUri }: Input): RA<Ok, BlueskyClientError> => {
    const state = await reader.resolveViewerState(did);
    if (!state.ok) return RA.err(state.err);
    const stored = Result.unsafeUnwrap(await resolver.resolveState(did));
    const targets = new Set([blockUri, state.val.blockUri, stored.blockUri].filter((uri) => uri != null));
    let failure: BlueskyClientError | undefined;
    for (const target of targets) {
      const deleted = await client.deleteBlock(target);
      if (!deleted.ok) failure ??= deleted.err;
    }
    if (failure !== undefined) return RA.err(failure);
    Result.unsafeUnwrap(await deletedStore.delete(did, now()));
    return RA.ok({ blockUri: null });
  };

  return { run };
};

export const UnblockBlueskyActorUseCase = {
  create,
} as const;
