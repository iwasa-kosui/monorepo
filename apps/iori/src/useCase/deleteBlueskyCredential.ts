import { RA } from '@iwasa-kosui/result';

import type {
  BlueskyCredentialRemovedStore,
  BlueskyCredentialView,
} from '../domain/blueskyCredential/blueskyCredential.ts';
import type { GetBlueskyCredentialUseCase } from './getBlueskyCredential.ts';
import type { UseCase } from './useCase.ts';

export type DeleteBlueskyCredentialUseCase = UseCase<void, BlueskyCredentialView, never>;

type Deps = Readonly<{
  removedStore: BlueskyCredentialRemovedStore;
  getCredential: GetBlueskyCredentialUseCase;
}>;

const create = (
  { removedStore, getCredential }: Deps,
): DeleteBlueskyCredentialUseCase => {
  const run = async (): RA<BlueskyCredentialView, never> => {
    await removedStore.delete();
    return getCredential.run();
  };

  return { run };
};

export const DeleteBlueskyCredentialUseCase = { create } as const;
