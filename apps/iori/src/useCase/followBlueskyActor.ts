import { RA } from '@iwasa-kosui/result';

import type { BlueskyClient, BlueskyClientError } from '../ports/blueskyClient.ts';
import {
  type BlueskyProfileNotFound,
  type BlueskyProfileReader,
  isBlueskyProfileNotFound,
} from '../ports/blueskyProfileReader.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ did: string }>;

type Ok = Readonly<{ following: true; followUri: string }>;

type Err = BlueskyClientError | BlueskyProfileNotFound;

export type FollowBlueskyActorUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  reader: Pick<BlueskyProfileReader, 'getProfile'>;
  client: Pick<BlueskyClient, 'createFollow'>;
}>;

const create = ({ reader, client }: Deps): FollowBlueskyActorUseCase => {
  const run = async ({ did }: Input): RA<Ok, Err> => {
    const profile = await reader.getProfile(did);
    if (!profile.ok) {
      return RA.err(isBlueskyProfileNotFound(profile.err) ? { type: 'BlueskyProfileNotFound' } : profile.err);
    }
    if (profile.val.viewerFollowingUri !== undefined) {
      return RA.ok({ following: true, followUri: profile.val.viewerFollowingUri });
    }
    const created = await client.createFollow(did);
    return created.ok ? RA.ok({ following: true, followUri: created.val.uri }) : RA.err(created.err);
  };

  return { run };
};

export const FollowBlueskyActorUseCase = {
  create,
} as const;
