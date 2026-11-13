import type { RA } from '@iwasa-kosui/result';

import type { BlueskyClientError } from '../ports/blueskyClient.ts';
import type { BlueskyProfile, BlueskyProfileReader } from '../ports/blueskyProfileReader.ts';
import type { UseCase } from './useCase.ts';

export type GetOwnBlueskyProfileUseCase = UseCase<void, BlueskyProfile, BlueskyClientError>;

type Deps = Readonly<{
  reader: Pick<BlueskyProfileReader, 'getProfile'>;
  viewerDid: () => RA<string, BlueskyClientError>;
}>;

const create = ({ reader, viewerDid }: Deps): GetOwnBlueskyProfileUseCase => {
  const run = async (): RA<BlueskyProfile, BlueskyClientError> => {
    const did = await viewerDid();
    if (!did.ok) return did;
    return reader.getProfile(did.val);
  };

  return { run };
};

export const GetOwnBlueskyProfileUseCase = {
  create,
} as const;
