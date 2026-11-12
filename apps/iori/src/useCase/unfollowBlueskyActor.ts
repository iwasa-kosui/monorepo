import { RA } from '@iwasa-kosui/result';

import type { BlueskyClient, BlueskyClientError } from '../ports/blueskyClient.ts';
import {
  type BlueskyProfileNotFound,
  type BlueskyProfileReader,
  isBlueskyProfileNotFound,
} from '../ports/blueskyProfileReader.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ did: string }>;

type Ok = Readonly<{ following: false }>;

type Err = BlueskyClientError | BlueskyProfileNotFound;

export type UnfollowBlueskyActorUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  reader: Pick<BlueskyProfileReader, 'getProfile'>;
  client: Pick<BlueskyClient, 'deleteFollow'>;
}>;

const create = ({ reader, client }: Deps): UnfollowBlueskyActorUseCase => {
  const run = async ({ did }: Input): RA<Ok, Err> => {
    const profile = await reader.getProfile(did);
    if (!profile.ok) {
      return RA.err(isBlueskyProfileNotFound(profile.err) ? { type: 'BlueskyProfileNotFound' } : profile.err);
    }
    if (profile.val.viewerFollowingUri === undefined) return RA.ok({ following: false });
    const deleted = await client.deleteFollow(profile.val.viewerFollowingUri);
    return deleted.ok ? RA.ok({ following: false }) : RA.err(deleted.err);
  };

  return { run };
};

export const UnfollowBlueskyActorUseCase = {
  create,
} as const;
