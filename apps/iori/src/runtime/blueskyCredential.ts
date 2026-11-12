import { createBlueskyCredentialVerifier } from '../adaptor/bluesky/blueskyClient.ts';
import { createAesGcmCipher, decodeAesGcmKey } from '../adaptor/crypto/aesGcmCipher.ts';
import {
  createD1BlueskyStoredCredentialDeletedStore,
  createD1BlueskyStoredCredentialResolver,
  createD1BlueskyStoredCredentialSavedStore,
} from '../adaptor/d1/blueskyCredential/blueskyCredentialStore.ts';
import { createD1BlueskyLoginFailureDeletedStore } from '../adaptor/d1/blueskyCrosspost/blueskyLoginFailureStore.ts';
import {
  createD1BlueskySessionDeletedStore,
  createD1BlueskySessionResolver,
  createD1BlueskySessionSavedStore,
} from '../adaptor/d1/blueskyCrosspost/blueskySessionStore.ts';
import type { IoriD1Db } from '../adaptor/d1/client.ts';
import { createD1UserResolverByUsername } from '../adaptor/d1/user/userResolverByUsername.ts';
import { createD1UserPasswordResolver } from '../adaptor/d1/userPassword/userPasswordResolver.ts';
import { BLUESKY_CREDENTIAL_AAD } from '../domain/blueskyCredential/blueskyCredential.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { Argon2idDerive } from '../domain/password/argon2idDerive.ts';
import type { BlueskyCredentials } from '../ports/blueskyClient.ts';
import { DeleteBlueskyCredentialUseCase } from '../useCase/deleteBlueskyCredential.ts';
import { GetBlueskyCredentialUseCase } from '../useCase/getBlueskyCredential.ts';
import { IsDigestOwner } from '../useCase/isDigestOwner.ts';
import { RegisterBlueskyCredentialUseCase } from '../useCase/registerBlueskyCredential.ts';
import { ResolveBlueskyCredentialUseCase } from '../useCase/resolveBlueskyCredential.ts';
import { VerifyCurrentPasswordUseCase } from '../useCase/verifyCurrentPassword.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';

export const BLUESKY_CREDENTIAL_LOGIN_FAILURE_SCOPE = 'timeline';

export type { BlueskyCredentials };

export type BlueskyRuntimeConfig = Readonly<{
  envCredentials: BlueskyCredentials | undefined;
  credentialKey: string | undefined;
}>;

export const resolveBlueskyCredentials = (
  env: Pick<IoriWorkerEnv, 'BLUESKY_IDENTIFIER' | 'BLUESKY_APP_PASSWORD'>,
): BlueskyCredentials | undefined => {
  const identifier = env.BLUESKY_IDENTIFIER?.trim();
  const appPassword = env.BLUESKY_APP_PASSWORD?.trim();
  return identifier === undefined || identifier === '' || appPassword === undefined || appPassword === ''
    ? undefined
    : { identifier, appPassword };
};

export const resolveBlueskyRuntimeConfig = (
  env: Pick<IoriWorkerEnv, 'BLUESKY_IDENTIFIER' | 'BLUESKY_APP_PASSWORD' | 'BLUESKY_CREDENTIAL_KEY'>,
): BlueskyRuntimeConfig | undefined => {
  const envCredentials = resolveBlueskyCredentials(env);
  const credentialKey = decodeAesGcmKey(env.BLUESKY_CREDENTIAL_KEY) === undefined
    ? undefined
    : env.BLUESKY_CREDENTIAL_KEY;
  return envCredentials === undefined && credentialKey === undefined ? undefined : { envCredentials, credentialKey };
};

const createCipher = (credentialKey: string | undefined) =>
  createAesGcmCipher({ key: credentialKey, aad: BLUESKY_CREDENTIAL_AAD });

const logDecryptFailed = (): void => {
  console.warn(JSON.stringify({ event: 'bluesky_credential_decrypt_failed' }));
};

const createResolveCredential = (config: BlueskyRuntimeConfig, db: IoriD1Db) =>
  ResolveBlueskyCredentialUseCase.create({
    storedResolver: createD1BlueskyStoredCredentialResolver(db),
    cipher: createCipher(config.credentialKey),
    envCredentials: config.envCredentials,
    onDecryptFailed: logDecryptFailed,
  });

export const createBlueskyCredentialResolver = (
  config: BlueskyRuntimeConfig,
  db: IoriD1Db,
): () => Promise<BlueskyCredentials | undefined> => {
  const resolveCredential = createResolveCredential(config, db);
  return async () => (await resolveCredential.run()).credentials;
};

export type BlueskyCredentialRuntimePorts = Readonly<{
  getBlueskyCredentialUseCase: GetBlueskyCredentialUseCase;
  registerBlueskyCredentialUseCase: RegisterBlueskyCredentialUseCase;
  deleteBlueskyCredentialUseCase: DeleteBlueskyCredentialUseCase;
  isDigestOwner: IsDigestOwner;
}>;

export const createBlueskyCredentialRuntimePorts = (
  env: IoriWorkerEnv,
  db: IoriD1Db,
  deps: Readonly<{ argon2idDerive: Argon2idDerive; fetch?: typeof fetch }>,
): BlueskyCredentialRuntimePorts => {
  const config: BlueskyRuntimeConfig = {
    envCredentials: resolveBlueskyCredentials(env),
    credentialKey: env.BLUESKY_CREDENTIAL_KEY,
  };
  const cipher = createCipher(config.credentialKey);
  const sessionResolver = createD1BlueskySessionResolver(db);
  const getCredential = GetBlueskyCredentialUseCase.create({
    resolveCredential: createResolveCredential(config, db),
    sessionResolver,
    registrable: cipher !== undefined,
  });
  return {
    getBlueskyCredentialUseCase: getCredential,
    registerBlueskyCredentialUseCase: RegisterBlueskyCredentialUseCase.create({
      cipher,
      verifyCurrentPassword: VerifyCurrentPasswordUseCase.create({
        userPasswordResolver: createD1UserPasswordResolver(db),
        argon2idDerive: deps.argon2idDerive,
      }),
      verifier: createBlueskyCredentialVerifier({ fetch: deps.fetch, now: Instant.now }),
      storedResolver: createD1BlueskyStoredCredentialResolver(db),
      savedStore: createD1BlueskyStoredCredentialSavedStore(db),
      sessionResolver,
      sessionSavedStore: createD1BlueskySessionSavedStore(db),
      loginFailureDeletedStore: createD1BlueskyLoginFailureDeletedStore(db, BLUESKY_CREDENTIAL_LOGIN_FAILURE_SCOPE),
      now: Instant.now,
    }),
    deleteBlueskyCredentialUseCase: DeleteBlueskyCredentialUseCase.create({
      credentialDeletedStore: createD1BlueskyStoredCredentialDeletedStore(db),
      sessionDeletedStore: createD1BlueskySessionDeletedStore(db),
      getCredential,
    }),
    isDigestOwner: IsDigestOwner.create({ userResolverByUsername: createD1UserResolverByUsername(db) }),
  };
};
