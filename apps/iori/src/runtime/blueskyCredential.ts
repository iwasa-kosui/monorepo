import { RA } from '@iwasa-kosui/result';

import { createBlueskyCredentialVerifier } from '../adaptor/bluesky/blueskyClient.ts';
import { createAesGcmCipherFactory, decodeAesGcmKey } from '../adaptor/crypto/aesGcmCipher.ts';
import { blueskyAccountSwitchAbsent } from '../adaptor/d1/blueskyAccountSwitch/blueskyAccountSwitchGuard.ts';
import { createD1BlueskyAccountSwitchPreviewResolver } from '../adaptor/d1/blueskyAccountSwitch/blueskyAccountSwitchPreviewResolver.ts';
import { createD1BlueskyAccountSwitchResolver } from '../adaptor/d1/blueskyAccountSwitch/blueskyAccountSwitchResolver.ts';
import { createD1BlueskyAccountSwitchStartedStore } from '../adaptor/d1/blueskyAccountSwitch/blueskyAccountSwitchStartedStore.ts';
import {
  blueskyStoredCredentialDeleteQuery,
  blueskyStoredCredentialSaveQuery,
  createD1BlueskyStoredCredentialResolver,
} from '../adaptor/d1/blueskyCredential/blueskyCredentialStore.ts';
import { blueskyLoginFailureDeleteQuery } from '../adaptor/d1/blueskyCrosspost/blueskyLoginFailureStore.ts';
import {
  blueskySessionDeleteQuery,
  blueskySessionSaveQuery,
  createD1BlueskySessionResolver,
} from '../adaptor/d1/blueskyCrosspost/blueskySessionStore.ts';
import type { IoriD1Db } from '../adaptor/d1/client.ts';
import { runBatchChanges } from '../adaptor/d1/runBatch.ts';
import { createD1UserResolverByUsername } from '../adaptor/d1/user/userResolverByUsername.ts';
import { createD1UserPasswordResolver } from '../adaptor/d1/userPassword/userPasswordResolver.ts';
import { BlueskyAccountSwitchInProgress } from '../domain/blueskyAccountSwitch/blueskyAccountSwitch.ts';
import {
  blueskyCredentialAad,
  type BlueskyCredentialRegisteredStore,
  type BlueskyCredentialRemovedStore,
} from '../domain/blueskyCredential/blueskyCredential.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { Argon2idDerive } from '../domain/password/argon2idDerive.ts';
import type { BlueskyCredentials } from '../ports/blueskyClient.ts';
import { DeleteBlueskyCredentialUseCase } from '../useCase/deleteBlueskyCredential.ts';
import { GetBlueskyAccountSwitchUseCase } from '../useCase/getBlueskyAccountSwitch.ts';
import { GetBlueskyCredentialUseCase } from '../useCase/getBlueskyCredential.ts';
import { IsDigestOwner } from '../useCase/isDigestOwner.ts';
import { PreviewBlueskyAccountSwitchUseCase } from '../useCase/previewBlueskyAccountSwitch.ts';
import { RegisterBlueskyCredentialUseCase } from '../useCase/registerBlueskyCredential.ts';
import { ResolveBlueskyCredentialUseCase } from '../useCase/resolveBlueskyCredential.ts';
import { SwitchBlueskyAccountUseCase } from '../useCase/switchBlueskyAccount.ts';
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
  const rawKey = env.BLUESKY_CREDENTIAL_KEY;
  const credentialKey = decodeAesGcmKey(rawKey) === undefined ? undefined : rawKey;
  if (credentialKey === undefined && (rawKey?.trim() ?? '') !== '') {
    console.warn(JSON.stringify({ event: 'bluesky_credential_key_invalid' }));
  }
  return envCredentials === undefined && credentialKey === undefined ? undefined : { envCredentials, credentialKey };
};

const createCipherFor = (credentialKey: string | undefined) =>
  createAesGcmCipherFactory({ key: credentialKey, aadOf: blueskyCredentialAad });

export const createBlueskyCredentialRegisteredStore = (
  db: IoriD1Db,
  loginFailureScope: string,
): BlueskyCredentialRegisteredStore => ({
  store: async ({ credential, session }) => {
    const guard = blueskyAccountSwitchAbsent(db);
    const [credentialChanges] = await runBatchChanges(db, [
      blueskyStoredCredentialSaveQuery(db, credential, guard),
      blueskySessionSaveQuery(db, session, guard),
      blueskyLoginFailureDeleteQuery(db, loginFailureScope, guard),
    ]);
    return credentialChanges === 0 ? RA.err(BlueskyAccountSwitchInProgress.create()) : RA.ok(undefined);
  },
});

export const createBlueskyCredentialRemovedStore = (db: IoriD1Db): BlueskyCredentialRemovedStore => ({
  delete: async () => {
    const guard = blueskyAccountSwitchAbsent(db);
    const changes = await runBatchChanges(db, [
      blueskyStoredCredentialDeleteQuery(db, guard),
      blueskySessionDeleteQuery(db, guard),
    ]);
    if (changes.some((count) => count > 0)) return RA.ok(undefined);
    const switching = await createD1BlueskyAccountSwitchResolver(db).resolve();
    return switching.ok && switching.val !== undefined
      ? RA.err(BlueskyAccountSwitchInProgress.create())
      : RA.ok(undefined);
  },
});

const logDecryptFailed = (): void => {
  console.warn(JSON.stringify({ event: 'bluesky_credential_decrypt_failed' }));
};

const createResolveCredential = (config: BlueskyRuntimeConfig, db: IoriD1Db) =>
  ResolveBlueskyCredentialUseCase.create({
    storedResolver: createD1BlueskyStoredCredentialResolver(db),
    cipherFor: createCipherFor(config.credentialKey),
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
  switchBlueskyAccountUseCase: SwitchBlueskyAccountUseCase;
  getBlueskyAccountSwitchUseCase: GetBlueskyAccountSwitchUseCase;
  previewBlueskyAccountSwitchUseCase: PreviewBlueskyAccountSwitchUseCase;
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
  const cipherFor = createCipherFor(config.credentialKey);
  const sessionResolver = createD1BlueskySessionResolver(db);
  const storedResolver = createD1BlueskyStoredCredentialResolver(db);
  const accountSwitchResolver = createD1BlueskyAccountSwitchResolver(db);
  const verifier = createBlueskyCredentialVerifier({ fetch: deps.fetch, now: Instant.now });
  const verifyCurrentPassword = VerifyCurrentPasswordUseCase.create({
    userPasswordResolver: createD1UserPasswordResolver(db),
    argon2idDerive: deps.argon2idDerive,
  });
  const getCredential = GetBlueskyCredentialUseCase.create({
    resolveCredential: createResolveCredential(config, db),
    sessionResolver,
    registrable: cipherFor !== undefined,
  });
  return {
    getBlueskyCredentialUseCase: getCredential,
    registerBlueskyCredentialUseCase: RegisterBlueskyCredentialUseCase.create({
      cipherFor,
      envCredentials: config.envCredentials,
      verifyCurrentPassword,
      verifier,
      storedResolver,
      sessionResolver,
      registeredStore: createBlueskyCredentialRegisteredStore(db, BLUESKY_CREDENTIAL_LOGIN_FAILURE_SCOPE),
      accountSwitchResolver,
      now: Instant.now,
    }),
    deleteBlueskyCredentialUseCase: DeleteBlueskyCredentialUseCase.create({
      removedStore: createBlueskyCredentialRemovedStore(db),
      getCredential,
      accountSwitchResolver,
      storedResolver,
      envCredentials: config.envCredentials,
      verifier,
    }),
    switchBlueskyAccountUseCase: SwitchBlueskyAccountUseCase.create({
      cipherFor,
      envCredentials: config.envCredentials,
      verifyCurrentPassword,
      verifier,
      storedResolver,
      sessionResolver,
      accountSwitchResolver,
      startedStore: createD1BlueskyAccountSwitchStartedStore(db, BLUESKY_CREDENTIAL_LOGIN_FAILURE_SCOPE),
      now: Instant.now,
    }),
    getBlueskyAccountSwitchUseCase: GetBlueskyAccountSwitchUseCase.create({ accountSwitchResolver }),
    previewBlueskyAccountSwitchUseCase: PreviewBlueskyAccountSwitchUseCase.create({
      previewResolver: createD1BlueskyAccountSwitchPreviewResolver(db),
    }),
    isDigestOwner: IsDigestOwner.create({ userResolverByUsername: createD1UserResolverByUsername(db) }),
  };
};
