import { RA } from '@iwasa-kosui/result';

import type { BlueskyClientError } from '../ports/blueskyClient.ts';
import {
  type BlueskyProfile,
  type BlueskyProfileNotFound,
  type BlueskyProfileReader,
  isBlueskyProfileNotFound,
} from '../ports/blueskyProfileReader.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ actor: string }>;

type Err = BlueskyClientError | BlueskyProfileNotFound;

export type GetBlueskyProfileUseCase = UseCase<Input, BlueskyProfile, Err>;

type Deps = Readonly<{ reader: Pick<BlueskyProfileReader, 'getProfile'> }>;

const create = ({ reader }: Deps): GetBlueskyProfileUseCase => {
  const run = async ({ actor }: Input): RA<BlueskyProfile, Err> => {
    const profile = await reader.getProfile(actor);
    if (profile.ok) return profile;
    return RA.err(isBlueskyProfileNotFound(profile.err) ? { type: 'BlueskyProfileNotFound' } : profile.err);
  };

  return { run };
};

export const GetBlueskyProfileUseCase = {
  create,
} as const;
