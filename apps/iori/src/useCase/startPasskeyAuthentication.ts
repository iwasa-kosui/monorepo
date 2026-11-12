import { RA } from '@iwasa-kosui/result';
import { generateAuthenticationOptions, type PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/server';

import { Instant } from '../domain/instant/instant.ts';
import { WebAuthnChallenge, type WebAuthnChallengeIssuedStore } from '../domain/passkey/webAuthnChallenge.ts';
import type { WebAuthnChallengeId } from '../domain/passkey/webAuthnChallengeId.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<Record<string, never>>;

type Ok = Readonly<{
  options: PublicKeyCredentialRequestOptionsJSON;
  challengeId: WebAuthnChallengeId;
}>;

export type StartPasskeyAuthenticationUseCase = UseCase<Input, Ok, never>;

export type StartPasskeyAuthenticationDeps = Readonly<{
  webAuthnChallengeIssuedStore: WebAuthnChallengeIssuedStore;
  rpId: string;
}>;

const create = ({
  webAuthnChallengeIssuedStore,
  rpId,
}: StartPasskeyAuthenticationDeps): StartPasskeyAuthenticationUseCase => {
  const run = async (_input: Input) => {
    const now = Instant.now();
    return RA.flow(
      RA.ok({}),
      RA.bind('options', () => generateAuthenticationOptions({ rpID: rpId, userVerification: 'required' })),
      RA.bind(
        'issued',
        ({ options }) =>
          WebAuthnChallenge.issue(now)({ challenge: options.challenge, purpose: 'authentication', userId: null }),
      ),
      RA.andThrough(({ issued }) => webAuthnChallengeIssuedStore.store(issued)),
      RA.map(({ options, issued }) => ({ options, challengeId: issued.aggregateState.challengeId })),
    );
  };

  return { run };
};

export const StartPasskeyAuthenticationUseCase = {
  create,
} as const;
