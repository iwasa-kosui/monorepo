import type { RA } from '@iwasa-kosui/result';

import type { BlueskyClientError } from '../ports/blueskyClient.ts';
import type { BlueskyActorLikesPage, BlueskyProfileReader } from '../ports/blueskyProfileReader.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ cursor: string | undefined }>;

export type ListBlueskyActorLikesUseCase = UseCase<Input, BlueskyActorLikesPage, BlueskyClientError>;

type Deps = Readonly<{
  reader: Pick<BlueskyProfileReader, 'getActorLikes'>;
  viewerDid: () => RA<string, BlueskyClientError>;
}>;

const create = ({ reader, viewerDid }: Deps): ListBlueskyActorLikesUseCase => {
  const run = async ({ cursor }: Input): RA<BlueskyActorLikesPage, BlueskyClientError> => {
    const did = await viewerDid();
    if (!did.ok) return did;
    return reader.getActorLikes({ actor: did.val, cursor });
  };

  return { run };
};

export const ListBlueskyActorLikesUseCase = {
  create,
} as const;
