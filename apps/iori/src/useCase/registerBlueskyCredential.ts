import { RA } from '@iwasa-kosui/result';

import {
  BLUESKY_CREDENTIAL_KEY_VERSION,
  type BlueskyCredentialRegisteredStore,
  type BlueskyCredentialView,
  type BlueskyStoredCredentialResolver,
} from '../domain/blueskyCredential/blueskyCredential.ts';
import type { BlueskySession, BlueskySessionResolver } from '../domain/blueskyCrosspost/blueskyCrosspost.ts';
import type { Instant } from '../domain/instant/instant.ts';
import type { UserId } from '../domain/user/userId.ts';
import type { BlueskyClientError, BlueskyCredentials } from '../ports/blueskyClient.ts';
import type { BlueskyCredentialCipherFactory } from '../ports/blueskyCredentialCipher.ts';
import type { BlueskyCredentialVerifier } from '../ports/blueskyCredentialVerifier.ts';
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
  cipherFor: BlueskyCredentialCipherFactory | undefined;
  envCredentials: BlueskyCredentials | undefined;
  verifyCurrentPassword: VerifyCurrentPasswordUseCase;
  verifier: BlueskyCredentialVerifier;
  storedResolver: BlueskyStoredCredentialResolver;
  sessionResolver: BlueskySessionResolver;
  registeredStore: BlueskyCredentialRegisteredStore;
  now: () => Instant;
}>;

const create = ({
  cipherFor,
  envCredentials,
  verifyCurrentPassword,
  verifier,
  storedResolver,
  sessionResolver,
  registeredStore,
  now,
}: Deps): RegisterBlueskyCredentialUseCase => {
  const discard = async (session: BlueskySession | undefined): Promise<void> => {
    if (session !== undefined) await verifier.logout(session).catch(() => undefined);
  };

  const run = async (input: Input): RA<BlueskyCredentialView, RegisterBlueskyCredentialError> => {
    if (cipherFor === undefined) {
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
    const knownDid = stored.ok && stored.val !== undefined
      ? stored.val.did
      : currentSession.ok
      ? currentSession.val?.did
      : undefined;
    const envLogin = knownDid === undefined && envCredentials !== undefined
      ? await verifier.login(envCredentials)
      : undefined;
    const envSession = envLogin?.ok ? envLogin.val : undefined;
    const currentDid = knownDid ?? envSession?.did;
    if (currentDid !== undefined && currentDid !== session.did) {
      await Promise.all([discard(session), discard(envSession)]);
      return RA.err({ type: 'BlueskyDidMismatch', message: 'The account differs from the connected one.' });
    }
    await discard(envSession);

    const chatPermitted = await verifier.probeChat(session);
    const encrypted = await cipherFor(session.did).encrypt(input.appPassword);
    const at = now();
    await registeredStore.store({
      credential: {
        identifier,
        did: session.did,
        handle: session.handle,
        appPasswordCiphertext: encrypted.ciphertext,
        appPasswordIv: encrypted.iv,
        keyVersion: BLUESKY_CREDENTIAL_KEY_VERSION,
        chatPermitted,
        verifiedAt: at,
        updatedAt: at,
      },
      session,
    });
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
