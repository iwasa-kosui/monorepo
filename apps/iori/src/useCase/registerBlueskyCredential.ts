import { RA } from '@iwasa-kosui/result';

import {
  BLUESKY_CREDENTIAL_KEY_VERSION,
  type BlueskyCredentialView,
  type BlueskyStoredCredentialResolver,
  type BlueskyStoredCredentialSavedStore,
} from '../domain/blueskyCredential/blueskyCredential.ts';
import type {
  BlueskyLoginFailureDeletedStore,
  BlueskySessionResolver,
  BlueskySessionSavedStore,
} from '../domain/blueskyCrosspost/blueskyCrosspost.ts';
import type { Instant } from '../domain/instant/instant.ts';
import type { UserId } from '../domain/user/userId.ts';
import type { BlueskyClientError } from '../ports/blueskyClient.ts';
import type { BlueskyCredentialVerifier } from '../ports/blueskyCredentialVerifier.ts';
import type { SecretCipher } from '../ports/secretCipher.ts';
import type { UseCase } from './useCase.ts';
import type { InvalidCurrentPassword, VerifyCurrentPasswordUseCase } from './verifyCurrentPassword.ts';

type Input = Readonly<{
  userId: UserId;
  identifier: string;
  appPassword: string;
  currentPassword: string;
}>;

export type BlueskyCredentialKeyMissing = Readonly<{
  type: 'BlueskyCredentialKeyMissing';
  message: string;
}>;

export type BlueskyLoginFailed = Readonly<{
  type: 'BlueskyLoginFailed';
  message: string;
  cause: BlueskyClientError;
}>;

export type BlueskyDidMismatch = Readonly<{
  type: 'BlueskyDidMismatch';
  message: string;
}>;

export type RegisterBlueskyCredentialError =
  | BlueskyCredentialKeyMissing
  | InvalidCurrentPassword
  | BlueskyLoginFailed
  | BlueskyDidMismatch;

export type RegisterBlueskyCredentialUseCase = UseCase<Input, BlueskyCredentialView, RegisterBlueskyCredentialError>;

type Deps = Readonly<{
  cipher: SecretCipher | undefined;
  verifyCurrentPassword: VerifyCurrentPasswordUseCase;
  verifier: BlueskyCredentialVerifier;
  storedResolver: BlueskyStoredCredentialResolver;
  savedStore: BlueskyStoredCredentialSavedStore;
  sessionResolver: BlueskySessionResolver;
  sessionSavedStore: BlueskySessionSavedStore;
  loginFailureDeletedStore: BlueskyLoginFailureDeletedStore;
  now: () => Instant;
}>;

const create = ({
  cipher,
  verifyCurrentPassword,
  verifier,
  storedResolver,
  savedStore,
  sessionResolver,
  sessionSavedStore,
  loginFailureDeletedStore,
  now,
}: Deps): RegisterBlueskyCredentialUseCase => {
  const run = async (input: Input): RA<BlueskyCredentialView, RegisterBlueskyCredentialError> => {
    if (cipher === undefined) {
      return RA.err({ type: 'BlueskyCredentialKeyMissing', message: 'Credential key is not configured.' });
    }
    const verified = await verifyCurrentPassword.run({ userId: input.userId, password: input.currentPassword });
    if (!verified.ok) return RA.err(verified.err);

    const identifier = input.identifier.trim();
    const login = await verifier.login({ identifier, appPassword: input.appPassword });
    if (!login.ok) {
      return RA.err({ type: 'BlueskyLoginFailed', message: 'Bluesky login failed.', cause: login.err });
    }
    const session = login.val;

    const stored = await storedResolver.resolve();
    const currentSession = await sessionResolver.resolve();
    const currentDid = stored.ok && stored.val !== undefined
      ? stored.val.did
      : currentSession.ok
      ? currentSession.val?.did
      : undefined;
    if (currentDid !== undefined && currentDid !== session.did) {
      return RA.err({ type: 'BlueskyDidMismatch', message: 'The account differs from the connected one.' });
    }

    const chatPermitted = await verifier.probeChat(session);
    const encrypted = await cipher.encrypt(input.appPassword);
    const at = now();
    await savedStore.save({
      identifier,
      did: session.did,
      handle: session.handle,
      appPasswordCiphertext: encrypted.ciphertext,
      appPasswordIv: encrypted.iv,
      keyVersion: BLUESKY_CREDENTIAL_KEY_VERSION,
      chatPermitted,
      verifiedAt: at,
      updatedAt: at,
    });
    await sessionSavedStore.save(session);
    await loginFailureDeletedStore.delete();
    return RA.ok({
      source: 'settings',
      handle: session.handle,
      did: session.did,
      chatPermitted,
      verifiedAt: at,
      registrable: true,
    });
  };

  return { run };
};

export const RegisterBlueskyCredentialUseCase = { create } as const;
