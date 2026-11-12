import { RA } from '@iwasa-kosui/result';

import type {
  BlueskyCredentialView,
  BlueskyStoredCredentialDeletedStore,
} from '../domain/blueskyCredential/blueskyCredential.ts';
import type { BlueskySessionDeletedStore } from '../domain/blueskyCrosspost/blueskyCrosspost.ts';
import type { GetBlueskyCredentialUseCase } from './getBlueskyCredential.ts';
import type { UseCase } from './useCase.ts';

export type DeleteBlueskyCredentialUseCase = UseCase<void, BlueskyCredentialView, never>;

type Deps = Readonly<{
  credentialDeletedStore: BlueskyStoredCredentialDeletedStore;
  sessionDeletedStore: BlueskySessionDeletedStore;
  getCredential: GetBlueskyCredentialUseCase;
}>;

const create = (
  { credentialDeletedStore, sessionDeletedStore, getCredential }: Deps,
): DeleteBlueskyCredentialUseCase => {
  const run = async (): RA<BlueskyCredentialView, never> => {
    await credentialDeletedStore.delete();
    await sessionDeletedStore.delete();
    return getCredential.run();
  };

  return { run };
};

export const DeleteBlueskyCredentialUseCase = { create } as const;
