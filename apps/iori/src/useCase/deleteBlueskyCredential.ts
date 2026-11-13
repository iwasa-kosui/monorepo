import { RA } from '@iwasa-kosui/result';

import {
  BlueskyAccountSwitchInProgress,
  type BlueskyAccountSwitchResolver,
} from '../domain/blueskyAccountSwitch/blueskyAccountSwitch.ts';
import type {
  BlueskyCredentialRemovedStore,
  BlueskyCredentialView,
  BlueskyStoredCredentialResolver,
} from '../domain/blueskyCredential/blueskyCredential.ts';
import type { BlueskyCredentials } from '../ports/blueskyClient.ts';
import type { BlueskyCredentialVerifier } from '../ports/blueskyCredentialVerifier.ts';
import type { GetBlueskyCredentialUseCase } from './getBlueskyCredential.ts';
import type { UseCase } from './useCase.ts';

export type BlueskyEnvAccountDiffers = Readonly<{
  type: 'BlueskyEnvAccountDiffers';
  message: string;
}>;

export type DeleteBlueskyCredentialError = BlueskyAccountSwitchInProgress | BlueskyEnvAccountDiffers;

export type DeleteBlueskyCredentialUseCase = UseCase<void, BlueskyCredentialView, DeleteBlueskyCredentialError>;

type Deps = Readonly<{
  removedStore: BlueskyCredentialRemovedStore;
  getCredential: GetBlueskyCredentialUseCase;
  accountSwitchResolver: BlueskyAccountSwitchResolver;
  storedResolver: BlueskyStoredCredentialResolver;
  envCredentials: BlueskyCredentials | undefined;
  verifier: BlueskyCredentialVerifier;
}>;

const create = (
  { removedStore, getCredential, accountSwitchResolver, storedResolver, envCredentials, verifier }: Deps,
): DeleteBlueskyCredentialUseCase => {
  const envAccountDiffers = async (): Promise<boolean> => {
    if (envCredentials === undefined) return false;
    const stored = await storedResolver.resolve();
    if (!stored.ok || stored.val === undefined) return false;
    const login = await verifier.login(envCredentials);
    if (!login.ok) return false;
    await verifier.logout(login.val).catch(() => undefined);
    return login.val.did !== stored.val.did;
  };

  const run = async (): RA<BlueskyCredentialView, DeleteBlueskyCredentialError> => {
    const switching = await accountSwitchResolver.resolve();
    if (switching.ok && switching.val !== undefined) return RA.err(BlueskyAccountSwitchInProgress.create());
    if (await envAccountDiffers()) {
      return RA.err({
        type: 'BlueskyEnvAccountDiffers',
        message: 'The account of the secret credentials differs from the connected one.',
      });
    }
    await removedStore.delete();
    return getCredential.run();
  };

  return { run };
};

export const DeleteBlueskyCredentialUseCase = { create } as const;
