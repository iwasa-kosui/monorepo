import { RA, Result } from '@iwasa-kosui/result';

import type { BlueskyMuteSavedStore } from '../domain/blueskyModeration/blueskyModeration.ts';
import type { Instant } from '../domain/instant/instant.ts';
import type { BlueskyClient, BlueskyClientError } from '../ports/blueskyClient.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ did: string }>;

type Ok = Readonly<{ muted: true }>;

export type MuteBlueskyActorUseCase = UseCase<Input, Ok, BlueskyClientError>;

type Deps = Readonly<{
  client: Pick<BlueskyClient, 'muteActor'>;
  savedStore: BlueskyMuteSavedStore;
  now: () => Instant;
}>;

const create = ({ client, savedStore, now }: Deps): MuteBlueskyActorUseCase => {
  const run = async ({ did }: Input): RA<Ok, BlueskyClientError> => {
    const muted = await client.muteActor(did);
    if (!muted.ok) return RA.err(muted.err);
    Result.unsafeUnwrap(await savedStore.save(did, now()));
    return RA.ok({ muted: true });
  };

  return { run };
};

export const MuteBlueskyActorUseCase = {
  create,
} as const;
