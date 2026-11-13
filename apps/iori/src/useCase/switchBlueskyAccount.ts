import { RA } from '@iwasa-kosui/result';

import {
  BlueskyAccountSwitch,
  BlueskyAccountSwitchInProgress,
  type BlueskyAccountSwitchResolver,
  type BlueskyAccountSwitchStartedStore,
  type BlueskyAccountSwitchView,
  BlueskyDidChanged,
} from '../domain/blueskyAccountSwitch/blueskyAccountSwitch.ts';
import {
  BLUESKY_CREDENTIAL_KEY_VERSION,
  type BlueskyStoredCredentialResolver,
} from '../domain/blueskyCredential/blueskyCredential.ts';
import type { BlueskySession, BlueskySessionResolver } from '../domain/blueskyCrosspost/blueskyCrosspost.ts';
import type { Instant } from '../domain/instant/instant.ts';
import type { UserId } from '../domain/user/userId.ts';
import type { BlueskyCredentials } from '../ports/blueskyClient.ts';
import type { BlueskyCredentialCipherFactory } from '../ports/blueskyCredentialCipher.ts';
import type { BlueskyCredentialVerifier } from '../ports/blueskyCredentialVerifier.ts';
import { resolveCurrentBlueskyAccount } from './helper/resolveCurrentBlueskyAccount.ts';
import type { BlueskyCredentialKeyMissing, BlueskyLoginFailed } from './registerBlueskyCredential.ts';
import type { UseCase } from './useCase.ts';
import type { InvalidCurrentPassword, VerifyCurrentPasswordUseCase } from './verifyCurrentPassword.ts';

type Input = Readonly<{
  userId: UserId;
  identifier: string;
  appPassword: string;
  currentPassword: string;
  fromDid: string;
  toDid: string;
}>;

export type SwitchBlueskyAccountError =
  | BlueskyCredentialKeyMissing
  | InvalidCurrentPassword
  | BlueskyLoginFailed
  | BlueskyDidChanged
  | BlueskyAccountSwitchInProgress;

export type SwitchBlueskyAccountUseCase = UseCase<Input, BlueskyAccountSwitchView, SwitchBlueskyAccountError>;

type Deps = Readonly<{
  cipherFor: BlueskyCredentialCipherFactory | undefined;
  envCredentials: BlueskyCredentials | undefined;
  verifyCurrentPassword: VerifyCurrentPasswordUseCase;
  verifier: BlueskyCredentialVerifier;
  storedResolver: BlueskyStoredCredentialResolver;
  sessionResolver: BlueskySessionResolver;
  accountSwitchResolver: BlueskyAccountSwitchResolver;
  startedStore: BlueskyAccountSwitchStartedStore;
  now: () => Instant;
}>;

const create = ({
  cipherFor,
  envCredentials,
  verifyCurrentPassword,
  verifier,
  storedResolver,
  sessionResolver,
  accountSwitchResolver,
  startedStore,
  now,
}: Deps): SwitchBlueskyAccountUseCase => {
  const discard = async (session: BlueskySession | undefined): Promise<void> => {
    if (session !== undefined) await verifier.logout(session).catch(() => undefined);
  };

  const run = async (input: Input): RA<BlueskyAccountSwitchView, SwitchBlueskyAccountError> => {
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
    await discard(envSession);
    const at = now();
    const started = current !== undefined && current.did === input.fromDid && session.did === input.toDid
      ? BlueskyAccountSwitch.start(at)({ fromDid: input.fromDid, toDid: input.toDid })
      : undefined;
    if (started === undefined || !started.ok) {
      await discard(session);
      return RA.err(BlueskyDidChanged.create());
    }

    const chatPermitted = await verifier.probeChat(session);
    const encrypted = await cipherFor(session.did).encrypt(input.appPassword);
    const event = started.val;
    const stored = await startedStore.store({
      event,
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
    }).catch(async (error: unknown) => {
      await discard(session);
      throw error;
    });
    if (!stored.ok) {
      await discard(session);
      return RA.err(stored.err);
    }
    return RA.ok(BlueskyAccountSwitch.toView(event.aggregateState));
  };

  return { run };
};

export const SwitchBlueskyAccountUseCase = { create } as const;
