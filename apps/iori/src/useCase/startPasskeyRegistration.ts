import { RA } from '@iwasa-kosui/result';
import { generateRegistrationOptions, type PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/server';

import { Instant } from '../domain/instant/instant.ts';
import type { PasskeyCredentialsResolverByUserId } from '../domain/passkey/passkeyCredential.ts';
import { WebAuthnChallenge, type WebAuthnChallengeIssuedStore } from '../domain/passkey/webAuthnChallenge.ts';
import type { WebAuthnChallengeId } from '../domain/passkey/webAuthnChallengeId.ts';
import type { Argon2idDerive } from '../domain/password/argon2idDerive.ts';
import { Password } from '../domain/password/password.ts';
import type { UserPasswordResolver } from '../domain/password/userPassword.ts';
import type { UserResolver } from '../domain/user/user.ts';
import type { UserNotFoundError } from '../domain/user/user.ts';
import type { UserId } from '../domain/user/userId.ts';
import { resolveUserWith } from './helper/resolve.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  userId: UserId;
  password: Password;
}>;

type Ok = Readonly<{
  options: PublicKeyCredentialCreationOptionsJSON;
  challengeId: WebAuthnChallengeId;
}>;

export type InvalidPassword = Readonly<{
  type: 'InvalidPassword';
  message: string;
  detail: {
    userId: UserId;
  };
}>;

export const InvalidPassword = {
  create: (userId: UserId): InvalidPassword => ({
    type: 'InvalidPassword',
    message: 'Password is invalid.',
    detail: { userId },
  }),
} as const;

export type StartPasskeyRegistrationUseCase = UseCase<Input, Ok, InvalidPassword | UserNotFoundError>;

export type StartPasskeyRegistrationDeps = Readonly<{
  userResolver: UserResolver;
  userPasswordResolver: UserPasswordResolver;
  passkeyCredentialsResolverByUserId: PasskeyCredentialsResolverByUserId;
  webAuthnChallengeIssuedStore: WebAuthnChallengeIssuedStore;
  argon2idDerive: Argon2idDerive;
  rpId: string;
}>;

const RP_NAME = 'iori';

const create = ({
  userResolver,
  userPasswordResolver,
  passkeyCredentialsResolverByUserId,
  webAuthnChallengeIssuedStore,
  argon2idDerive,
  rpId,
}: StartPasskeyRegistrationDeps): StartPasskeyRegistrationUseCase => {
  const run = async (input: Input) => {
    const now = Instant.now();
    return RA.flow(
      RA.ok(input),
      RA.andBind('user', ({ userId }) => resolveUserWith(userResolver)(userId)),
      RA.andBind('userPassword', ({ userId }) => userPasswordResolver.resolve(userId)),
      RA.andThrough(async ({ userId, userPassword, password }) => {
        const isPasswordValid = userPassword !== undefined
          && await Password.verifyPassword(argon2idDerive)(userPassword.hashedPassword, password);
        return isPasswordValid ? RA.ok(undefined) : RA.err(InvalidPassword.create(userId));
      }),
      RA.andBind('credentials', ({ userId }) => passkeyCredentialsResolverByUserId.resolve(userId)),
      RA.bind('options', ({ user, credentials }) =>
        generateRegistrationOptions({
          rpName: RP_NAME,
          rpID: rpId,
          userName: user.username,
          userID: new TextEncoder().encode(user.id),
          attestationType: 'none',
          excludeCredentials: credentials.map(({ credentialId, transports }) => ({
            id: credentialId,
            transports: [...transports],
          })),
          authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
        })),
      RA.bind(
        'issued',
        ({ userId, options }) =>
          WebAuthnChallenge.issue(now)({ challenge: options.challenge, purpose: 'registration', userId }),
      ),
      RA.andThrough(({ issued }) => webAuthnChallengeIssuedStore.store(issued)),
      RA.map(({ options, issued }) => ({ options, challengeId: issued.aggregateState.challengeId })),
    );
  };

  return { run };
};

export const StartPasskeyRegistrationUseCase = {
  create,
} as const;
