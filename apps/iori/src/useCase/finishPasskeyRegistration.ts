import { RA } from '@iwasa-kosui/result';
import { type RegistrationResponseJSON, verifyRegistrationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';

import { Instant } from '../domain/instant/instant.ts';
import {
  PasskeyCredential,
  type PasskeyCredentialResolverByCredentialId,
  type PasskeyRegisteredStore,
  PasskeyVerificationFailedError,
} from '../domain/passkey/passkeyCredential.ts';
import { PasskeyCredentialId } from '../domain/passkey/passkeyCredentialId.ts';
import type { WebAuthnChallengeConsumer, WebAuthnChallengeInvalidError } from '../domain/passkey/webAuthnChallenge.ts';
import type { WebAuthnChallengeId } from '../domain/passkey/webAuthnChallengeId.ts';
import type { UserId } from '../domain/user/userId.ts';
import { consumeWebAuthnChallengeWith } from './helper/consumeWebAuthnChallenge.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  userId: UserId;
  challengeId: WebAuthnChallengeId;
  response: RegistrationResponseJSON;
  name?: string | undefined;
}>;

type Ok = Readonly<{
  credential: PasskeyCredential;
}>;

export type PasskeyAlreadyRegisteredError = Readonly<{
  type: 'PasskeyAlreadyRegisteredError';
  message: string;
  detail: {
    credentialId: string;
  };
}>;

export const PasskeyAlreadyRegisteredError = {
  create: (credentialId: string): PasskeyAlreadyRegisteredError => ({
    type: 'PasskeyAlreadyRegisteredError',
    message: `The passkey credential "${credentialId}" is already registered.`,
    detail: { credentialId },
  }),
} as const;

export type FinishPasskeyRegistrationError =
  | WebAuthnChallengeInvalidError
  | PasskeyVerificationFailedError
  | PasskeyAlreadyRegisteredError;

export type FinishPasskeyRegistrationUseCase = UseCase<Input, Ok, FinishPasskeyRegistrationError>;

export type FinishPasskeyRegistrationDeps = Readonly<{
  webAuthnChallengeConsumer: WebAuthnChallengeConsumer;
  passkeyCredentialResolverByCredentialId: PasskeyCredentialResolverByCredentialId;
  passkeyRegisteredStore: PasskeyRegisteredStore;
  rpId: string;
  origin: string;
}>;

const create = ({
  webAuthnChallengeConsumer,
  passkeyCredentialResolverByCredentialId,
  passkeyRegisteredStore,
  rpId,
  origin,
}: FinishPasskeyRegistrationDeps): FinishPasskeyRegistrationUseCase => {
  const run = async (input: Input) => {
    const now = Instant.now();
    return RA.flow(
      consumeWebAuthnChallengeWith(webAuthnChallengeConsumer, now)(input.challengeId, {
        purpose: 'registration',
        userId: input.userId,
      }),
      RA.andThen(async (challenge) => {
        try {
          const verification = await verifyRegistrationResponse({
            response: input.response,
            expectedChallenge: challenge.challenge,
            expectedOrigin: origin,
            expectedRPID: rpId,
            requireUserVerification: true,
          });
          return verification.verified
            ? RA.ok(verification.registrationInfo)
            : RA.err(PasskeyVerificationFailedError.create('The registration response was not verified.'));
        } catch (error) {
          return RA.err(
            PasskeyVerificationFailedError.create(error instanceof Error ? error.message : String(error)),
          );
        }
      }),
      RA.map((info) => ({ info })),
      RA.andBind('credentialId', ({ info }) => {
        const credentialId = PasskeyCredentialId.parse(info.credential.id);
        return credentialId.ok
          ? RA.ok(credentialId.val)
          : RA.err(PasskeyVerificationFailedError.create('The credential ID is malformed.'));
      }),
      RA.andThrough(async ({ credentialId }) => {
        const existing = await passkeyCredentialResolverByCredentialId.resolve(credentialId);
        return existing.ok && existing.val !== undefined
          ? RA.err(PasskeyAlreadyRegisteredError.create(credentialId))
          : RA.ok(undefined);
      }),
      RA.bind('registered', ({ info, credentialId }) =>
        PasskeyCredential.register(now)({
          credentialId,
          userId: input.userId,
          publicKey: isoBase64URL.fromBuffer(info.credential.publicKey),
          counter: info.credential.counter,
          transports: info.credential.transports ?? [],
          deviceType: info.credentialDeviceType,
          backedUp: info.credentialBackedUp,
          name: input.name ?? new Date(now).toISOString(),
        })),
      RA.andThrough(({ registered }) => passkeyRegisteredStore.store(registered)),
      RA.map(({ registered }) => ({ credential: registered.aggregateState })),
    );
  };

  return { run };
};

export const FinishPasskeyRegistrationUseCase = {
  create,
} as const;
