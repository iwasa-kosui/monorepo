import { RA, Result } from '@iwasa-kosui/result';

import type {
  BlueskyBlockSavedStore,
  BlueskyModeratedActorsResolver,
} from '../domain/blueskyModeration/blueskyModeration.ts';
import type { Instant } from '../domain/instant/instant.ts';
import type { BlueskyClient, BlueskyClientError } from '../ports/blueskyClient.ts';
import type { BlueskyModerationReader } from '../ports/blueskyModerationReader.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ did: string }>;

type Ok = Readonly<{ blockUri: string }>;

export type BlockBlueskyActorUseCase = UseCase<Input, Ok, BlueskyClientError>;

type Deps = Readonly<{
  client: Pick<BlueskyClient, 'createBlock'>;
  reader: BlueskyModerationReader;
  resolver: Pick<BlueskyModeratedActorsResolver, 'resolveState'>;
  savedStore: BlueskyBlockSavedStore;
  now: () => Instant;
}>;

const create = ({ client, reader, resolver, savedStore, now }: Deps): BlockBlueskyActorUseCase => {
  const run = async ({ did }: Input): RA<Ok, BlueskyClientError> => {
    const state = await reader.resolveViewerState(did);
    if (!state.ok) return RA.err(state.err);
    const stored = Result.unsafeUnwrap(await resolver.resolveState(did));
    const candidates = new Set([stored.blockUri, state.val.blockUri].filter((uri) => uri !== null));
    for (const candidate of candidates) {
      const exists = await reader.hasBlockRecord(candidate);
      if (!exists.ok) return RA.err(exists.err);
      if (exists.val) {
        Result.unsafeUnwrap(await savedStore.save(did, candidate, now()));
        return RA.ok({ blockUri: candidate });
      }
    }
    const created = await client.createBlock(did);
    if (!created.ok) return RA.err(created.err);
    Result.unsafeUnwrap(await savedStore.save(did, created.val.uri, now()));
    return RA.ok({ blockUri: created.val.uri });
  };

  return { run };
};

export const BlockBlueskyActorUseCase = {
  create,
} as const;
