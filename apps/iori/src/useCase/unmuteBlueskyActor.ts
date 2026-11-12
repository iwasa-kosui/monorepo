import { RA, Result } from '@iwasa-kosui/result';

import type { BlueskyMuteDeletedStore } from '../domain/blueskyModeration/blueskyModeration.ts';
import type { Instant } from '../domain/instant/instant.ts';
import type { BlueskyClient, BlueskyClientError } from '../ports/blueskyClient.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ did: string }>;

type Ok = Readonly<{ muted: false }>;

export type UnmuteBlueskyActorUseCase = UseCase<Input, Ok, BlueskyClientError>;

type Deps = Readonly<{
  client: Pick<BlueskyClient, 'unmuteActor'>;
  deletedStore: BlueskyMuteDeletedStore;
  now: () => Instant;
}>;

const create = ({ client, deletedStore, now }: Deps): UnmuteBlueskyActorUseCase => {
  const run = async ({ did }: Input): RA<Ok, BlueskyClientError> => {
    const unmuted = await client.unmuteActor(did);
    if (!unmuted.ok) return RA.err(unmuted.err);
    Result.unsafeUnwrap(await deletedStore.delete(did, now()));
    return RA.ok({ muted: false });
  };

  return { run };
};

export const UnmuteBlueskyActorUseCase = {
  create,
} as const;
