import { RA } from '@iwasa-kosui/result';

import type {
  PasskeyCredential,
  PasskeyCredentialResolverByCredentialId,
  PasskeyCredentialsResolverByUserId,
  PasskeyDeletedStore,
  PasskeyRegisteredStore,
  PasskeyUsedStore,
} from '../../../domain/passkey/passkeyCredential.ts';
import type {
  WebAuthnChallenge,
  WebAuthnChallengeConsumer,
  WebAuthnChallengeIssuedStore,
} from '../../../domain/passkey/webAuthnChallenge.ts';

export const createPasskeyInMemory = () => {
  const credentials = new Map<string, PasskeyCredential>();
  const challenges = new Map<string, WebAuthnChallenge>();

  const passkeyCredentialResolverByCredentialId: PasskeyCredentialResolverByCredentialId = {
    resolve: (credentialId) => RA.ok(credentials.get(credentialId)),
  };
  const passkeyCredentialsResolverByUserId: PasskeyCredentialsResolverByUserId = {
    resolve: (userId) => RA.ok([...credentials.values()].filter((credential) => credential.userId === userId)),
  };
  const passkeyRegisteredStore: PasskeyRegisteredStore = {
    store: async (event) => {
      credentials.set(event.aggregateState.credentialId, event.aggregateState);
      return RA.ok(undefined);
    },
  };
  const passkeyUsedStore: PasskeyUsedStore = {
    store: async (event) => {
      credentials.set(event.aggregateState.credentialId, event.aggregateState);
      return RA.ok(undefined);
    },
  };
  const passkeyDeletedStore: PasskeyDeletedStore = {
    store: async (event) => {
      credentials.delete(event.eventPayload.credentialId);
      return RA.ok(undefined);
    },
  };
  const webAuthnChallengeIssuedStore: WebAuthnChallengeIssuedStore = {
    store: async (event) => {
      for (const [challengeId, challenge] of challenges) {
        if (challenge.expires < event.occurredAt) challenges.delete(challengeId);
      }
      challenges.set(event.aggregateState.challengeId, event.aggregateState);
      return RA.ok(undefined);
    },
  };
  const webAuthnChallengeConsumer: WebAuthnChallengeConsumer = {
    consume: async (challengeId) => {
      const challenge = challenges.get(challengeId);
      challenges.delete(challengeId);
      return RA.ok(challenge);
    },
  };

  return {
    credentials,
    challenges,
    passkeyCredentialResolverByCredentialId,
    passkeyCredentialsResolverByUserId,
    passkeyRegisteredStore,
    passkeyUsedStore,
    passkeyDeletedStore,
    webAuthnChallengeIssuedStore,
    webAuthnChallengeConsumer,
  };
};
