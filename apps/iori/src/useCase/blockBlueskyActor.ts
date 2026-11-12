import { RA, Result } from '@iwasa-kosui/result';

import type { BlueskyBlockSavedStore } from '../domain/blueskyModeration/blueskyModeration.ts';
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
  savedStore: BlueskyBlockSavedStore;
  now: () => Instant;
}>;

const create = ({ client, reader, savedStore, now }: Deps): BlockBlueskyActorUseCase => {
  const run = async ({ did }: Input): RA<Ok, BlueskyClientError> => {
    const state = await reader.resolveViewerState(did);
    if (!state.ok) return RA.err(state.err);
    if (state.val.blockUri !== null) {
      const exists = await reader.hasBlockRecord(state.val.blockUri);
      if (!exists.ok) return RA.err(exists.err);
      if (exists.val) {
        Result.unsafeUnwrap(await savedStore.save(did, state.val.blockUri, now()));
        return RA.ok({ blockUri: state.val.blockUri });
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
