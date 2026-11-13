import { RA } from '@iwasa-kosui/result';

import {
  BlueskyAccountSwitchInProgress,
  type BlueskyAccountSwitchResolver,
} from '../domain/blueskyAccountSwitch/blueskyAccountSwitch.ts';
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
import { resolveCurrentBlueskyAccount } from './helper/resolveCurrentBlueskyAccount.ts';
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
  current: Readonly<{ did: string; handle: string | null }>;
  next: Readonly<{ did: string; handle: string }>;
}>;

export type RegisterBlueskyCredentialError =
  | BlueskyCredentialKeyMissing
  | InvalidCurrentPassword
  | BlueskyLoginFailed
  | BlueskyDidMismatch
  | BlueskyAccountSwitchInProgress;

export type RegisterBlueskyCredentialUseCase = UseCase<Input, BlueskyCredentialView, RegisterBlueskyCredentialError>;

type Deps = Readonly<{
  cipherFor: BlueskyCredentialCipherFactory | undefined;
  envCredentials: BlueskyCredentials | undefined;
  verifyCurrentPassword: VerifyCurrentPasswordUseCase;
  verifier: BlueskyCredentialVerifier;
  storedResolver: BlueskyStoredCredentialResolver;
  sessionResolver: BlueskySessionResolver;
  registeredStore: BlueskyCredentialRegisteredStore;
  accountSwitchResolver: BlueskyAccountSwitchResolver;
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
  accountSwitchResolver,
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
    const switching = await accountSwitchResolver.resolve();
    if (switching.ok && switching.val !== undefined) return RA.err(BlueskyAccountSwitchInProgress.create());

    const identifier = input.identifier.trim();
    const login = await verifier.login({ identifier, appPassword: input.appPassword });
    if (!login.ok) {
      return RA.err({ type: 'BlueskyLoginFailed', message: 'Bluesky login failed.', cause: login.err });
    }
    const session = login.val;

    const { current, envSession } = await resolveCurrentBlueskyAccount({
      storedResolver,
      sessionResolver,
      envCredentials,
      verifier,
    });
    if (current !== undefined && current.did !== session.did) {
      await Promise.all([discard(session), discard(envSession)]);
      return RA.err({
        type: 'BlueskyDidMismatch',
        message: 'The account differs from the connected one.',
        current,
        next: { did: session.did, handle: session.handle },
      });
    }
    await discard(envSession);

    const chatPermitted = await verifier.probeChat(session);
    const encrypted = await cipherFor(session.did).encrypt(input.appPassword);
    const at = now();
    const stored = await registeredStore.store({
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
    if (!stored.ok) {
      await discard(session);
      return RA.err(stored.err);
    }
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
