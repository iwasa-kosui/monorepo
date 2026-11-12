import { RA } from '@iwasa-kosui/result';
import { type AuthenticationResponseJSON, verifyAuthenticationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';

import { Instant } from '../domain/instant/instant.ts';
import {
  PasskeyCredential,
  PasskeyCredentialNotFoundError,
  type PasskeyCredentialResolverByCredentialId,
  type PasskeyUsedStore,
  PasskeyVerificationFailedError,
} from '../domain/passkey/passkeyCredential.ts';
import { PasskeyCredentialId } from '../domain/passkey/passkeyCredentialId.ts';
import type { WebAuthnChallengeConsumer, WebAuthnChallengeInvalidError } from '../domain/passkey/webAuthnChallenge.ts';
import type { WebAuthnChallengeId } from '../domain/passkey/webAuthnChallengeId.ts';
import { Session, type SessionStartedStore } from '../domain/session/session.ts';
import type { SessionId } from '../domain/session/sessionId.ts';
import type { UserId } from '../domain/user/userId.ts';
import { consumeWebAuthnChallengeWith } from './helper/consumeWebAuthnChallenge.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  challengeId: WebAuthnChallengeId;
  response: AuthenticationResponseJSON;
}>;

type Ok = Readonly<{
  sessionId: SessionId;
}>;

export type PasskeyUserHandleMismatchError = Readonly<{
  type: 'PasskeyUserHandleMismatchError';
  message: string;
  detail: {
    userId: UserId;
  };
}>;

export const PasskeyUserHandleMismatchError = {
  create: (userId: UserId): PasskeyUserHandleMismatchError => ({
    type: 'PasskeyUserHandleMismatchError',
    message: 'The user handle in the response does not match the owner of the passkey.',
    detail: { userId },
  }),
} as const;

export type FinishPasskeyAuthenticationError =
  | WebAuthnChallengeInvalidError
  | PasskeyCredentialNotFoundError
  | PasskeyUserHandleMismatchError
  | PasskeyVerificationFailedError;

export type FinishPasskeyAuthenticationUseCase = UseCase<Input, Ok, FinishPasskeyAuthenticationError>;

export type FinishPasskeyAuthenticationDeps = Readonly<{
  webAuthnChallengeConsumer: WebAuthnChallengeConsumer;
  passkeyCredentialResolverByCredentialId: PasskeyCredentialResolverByCredentialId;
  passkeyUsedStore: PasskeyUsedStore;
  sessionStartedStore: SessionStartedStore;
  rpId: string;
  origin: string;
}>;

const create = ({
  webAuthnChallengeConsumer,
  passkeyCredentialResolverByCredentialId,
  passkeyUsedStore,
  sessionStartedStore,
  rpId,
  origin,
}: FinishPasskeyAuthenticationDeps): FinishPasskeyAuthenticationUseCase => {
  const resolveCredential = (id: string): RA<PasskeyCredential, PasskeyCredentialNotFoundError> => {
    const credentialId = PasskeyCredentialId.parse(id);
    if (!credentialId.ok) {
      return RA.err(PasskeyCredentialNotFoundError.create(id));
    }
    return RA.flow(
      passkeyCredentialResolverByCredentialId.resolve(credentialId.val),
      RA.andThen((credential) =>
        credential === undefined ? RA.err(PasskeyCredentialNotFoundError.create(id)) : RA.ok(credential)
      ),
    );
  };

  const run = async (input: Input) => {
    const now = Instant.now();
    return RA.flow(
      consumeWebAuthnChallengeWith(webAuthnChallengeConsumer, now)(input.challengeId, {
        purpose: 'authentication',
        userId: null,
      }),
      RA.map((challenge) => ({ challenge })),
      RA.andBind('credential', () => resolveCredential(input.response.id)),
      RA.andThrough(({ credential }) => {
        const { userHandle } = input.response.response;
        return userHandle === undefined || isoBase64URL.toUTF8String(userHandle) === credential.userId
          ? RA.ok(undefined)
          : RA.err(PasskeyUserHandleMismatchError.create(credential.userId));
      }),
      RA.andBind('authenticationInfo', async ({ challenge, credential }) => {
        try {
          const verification = await verifyAuthenticationResponse({
            response: input.response,
            expectedChallenge: challenge.challenge,
            expectedOrigin: origin,
            expectedRPID: rpId,
            credential: {
              id: credential.credentialId,
              publicKey: isoBase64URL.toBuffer(credential.publicKey),
              counter: credential.counter,
              transports: [...credential.transports],
            },
            requireUserVerification: true,
          });
          return verification.verified
            ? RA.ok(verification.authenticationInfo)
            : RA.err(PasskeyVerificationFailedError.create('The authentication response was not verified.'));
        } catch (error) {
          return RA.err(
            PasskeyVerificationFailedError.create(error instanceof Error ? error.message : String(error)),
          );
        }
      }),
      RA.bind(
        'used',
        ({ credential, authenticationInfo }) => PasskeyCredential.use(now)(credential, authenticationInfo.newCounter),
      ),
      RA.andThrough(({ used }) => passkeyUsedStore.store(used)),
      RA.bind('sessionStarted', ({ credential }) =>
        Session.startSession(now)({
          userId: credential.userId,
          expires: Instant.addDuration(now, 1000 * 60 * 60 * 24 * 7), // 7 days
        })),
      RA.andThrough(({ sessionStarted }) => sessionStartedStore.store(sessionStarted)),
      RA.bind('sessionId', ({ sessionStarted }) => sessionStarted.aggregateState.sessionId),
      RA.map(({ sessionId }) => ({ sessionId })),
    );
  };

  return { run };
};

export const FinishPasskeyAuthenticationUseCase = {
  create,
} as const;
