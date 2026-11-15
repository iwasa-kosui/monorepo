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
  createD1BlueskyCredentialUserIdResolverByDid,
  createD1BlueskyLinkedUserIdsResolver,
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
import type { UserId } from '../domain/user/userId.ts';
import { Username } from '../domain/user/username.ts';
import type { BlueskyCredentials } from '../ports/blueskyClient.ts';
import { DAILY_DIGEST_USERNAME } from '../scheduled/digestTasks.ts';
import { DeleteBlueskyCredentialUseCase } from '../useCase/deleteBlueskyCredential.ts';
import { GetBlueskyAccountSwitchUseCase } from '../useCase/getBlueskyAccountSwitch.ts';
import { GetBlueskyCredentialUseCase } from '../useCase/getBlueskyCredential.ts';
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

/**
 * 1 人のユーザーの Bluesky のアカウントを動かすための設定。
 * 環境変数の資格情報（BLUESKY_IDENTIFIER）は、ユーザーごとの設定ができる前からあるオーナーのものなので、オーナーにだけ渡す
 */
export type BlueskyAccountConfig = Readonly<{
  userId: UserId;
  envCredentials: BlueskyCredentials | undefined;
  credentialKey: string | undefined;
}>;

const resolveOwnerUserId = async (db: IoriD1Db): Promise<UserId | undefined> => {
  const owner = await createD1UserResolverByUsername(db).resolve(Username.parseOrThrow(DAILY_DIGEST_USERNAME));
  return owner.ok ? owner.val?.id : undefined;
};

export type BlueskyAccounts = Readonly<{
  /** そのユーザーのアカウントの設定 */
  configFor: (userId: UserId) => Promise<BlueskyAccountConfig>;
  /** そのユーザーが Bluesky のアカウントをつないでいるか */
  isLinked: (userId: UserId) => Promise<boolean>;
  /** Bluesky のアカウントをつないでいるユーザー全員の設定。定期実行で使う */
  linkedConfigs: () => Promise<readonly BlueskyAccountConfig[]>;
}>;

export const createBlueskyAccounts = (config: BlueskyRuntimeConfig, db: IoriD1Db): BlueskyAccounts => {
  let owner: Promise<UserId | undefined> | undefined;
  const ownerUserId = () => owner ??= resolveOwnerUserId(db);
  const configFor = async (userId: UserId): Promise<BlueskyAccountConfig> => ({
    userId,
    envCredentials: config.envCredentials !== undefined && await ownerUserId() === userId
      ? config.envCredentials
      : undefined,
    credentialKey: config.credentialKey,
  });
  return {
    configFor,
    isLinked: async (userId) => {
      if ((await configFor(userId)).envCredentials !== undefined) return true;
      const stored = await createD1BlueskyStoredCredentialResolver(db, userId).resolve();
      return stored.ok && stored.val !== undefined;
    },
    linkedConfigs: async () => {
      const userIds = new Set(await createD1BlueskyLinkedUserIdsResolver(db).resolve());
      const owner = config.envCredentials === undefined ? undefined : await ownerUserId();
      if (owner !== undefined) userIds.add(owner);
      return Promise.all([...userIds].map(configFor));
    },
  };
};

export const createBlueskyCredentialRegisteredStore = (
  db: IoriD1Db,
  userId: UserId,
  loginFailureScope: string,
): BlueskyCredentialRegisteredStore => ({
  store: async ({ credential, session }) => {
    const guard = blueskyAccountSwitchAbsent(db, userId);
    const [credentialChanges] = await runBatchChanges(db, [
      blueskyStoredCredentialSaveQuery(db, userId, credential, guard),
      blueskySessionSaveQuery(db, userId, session, guard),
      blueskyLoginFailureDeleteQuery(db, userId, loginFailureScope, guard),
    ]);
    return credentialChanges === 0 ? RA.err(BlueskyAccountSwitchInProgress.create()) : RA.ok(undefined);
  },
});

export const createBlueskyCredentialRemovedStore = (db: IoriD1Db, userId: UserId): BlueskyCredentialRemovedStore => ({
  delete: async () => {
    const guard = blueskyAccountSwitchAbsent(db, userId);
    const changes = await runBatchChanges(db, [
      blueskyStoredCredentialDeleteQuery(db, userId, guard),
      blueskySessionDeleteQuery(db, userId, guard),
    ]);
    if (changes.some((count) => count > 0)) return RA.ok(undefined);
    const switching = await createD1BlueskyAccountSwitchResolver(db, userId).resolve();
    return switching.ok && switching.val !== undefined
      ? RA.err(BlueskyAccountSwitchInProgress.create())
      : RA.ok(undefined);
  },
});

const logDecryptFailed = (): void => {
  console.warn(JSON.stringify({ event: 'bluesky_credential_decrypt_failed' }));
};

const createResolveCredential = (account: BlueskyAccountConfig, db: IoriD1Db) =>
  ResolveBlueskyCredentialUseCase.create({
    storedResolver: createD1BlueskyStoredCredentialResolver(db, account.userId),
    cipherFor: createCipherFor(account.credentialKey),
    envCredentials: account.envCredentials,
    onDecryptFailed: logDecryptFailed,
  });

export const createBlueskyCredentialResolver = (
  account: BlueskyAccountConfig,
  db: IoriD1Db,
): () => Promise<BlueskyCredentials | undefined> => {
  const resolveCredential = createResolveCredential(account, db);
  return async () => (await resolveCredential.run()).credentials;
};

export type BlueskyCredentialRuntimePorts = Readonly<{
  getBlueskyCredentialUseCase: GetBlueskyCredentialUseCase;
  registerBlueskyCredentialUseCase: RegisterBlueskyCredentialUseCase;
  deleteBlueskyCredentialUseCase: DeleteBlueskyCredentialUseCase;
  switchBlueskyAccountUseCase: SwitchBlueskyAccountUseCase;
  getBlueskyAccountSwitchUseCase: GetBlueskyAccountSwitchUseCase;
  previewBlueskyAccountSwitchUseCase: PreviewBlueskyAccountSwitchUseCase;
}>;

export const createBlueskyCredentialRuntimePorts = (
  account: BlueskyAccountConfig,
  db: IoriD1Db,
  deps: Readonly<{ argon2idDerive: Argon2idDerive; fetch?: typeof fetch }>,
): BlueskyCredentialRuntimePorts => {
  const { userId } = account;
  const cipherFor = createCipherFor(account.credentialKey);
  const sessionResolver = createD1BlueskySessionResolver(db, userId);
  const storedResolver = createD1BlueskyStoredCredentialResolver(db, userId);
  const linkedUserIdResolver = createD1BlueskyCredentialUserIdResolverByDid(db);
  const accountSwitchResolver = createD1BlueskyAccountSwitchResolver(db, userId);
  const verifier = createBlueskyCredentialVerifier({ fetch: deps.fetch, now: Instant.now });
  const verifyCurrentPassword = VerifyCurrentPasswordUseCase.create({
    userPasswordResolver: createD1UserPasswordResolver(db),
    argon2idDerive: deps.argon2idDerive,
  });
  const getCredential = GetBlueskyCredentialUseCase.create({
    resolveCredential: createResolveCredential(account, db),
    sessionResolver,
    registrable: cipherFor !== undefined,
  });
  return {
    getBlueskyCredentialUseCase: getCredential,
    registerBlueskyCredentialUseCase: RegisterBlueskyCredentialUseCase.create({
      cipherFor,
      envCredentials: account.envCredentials,
      verifyCurrentPassword,
      verifier,
      storedResolver,
      linkedUserIdResolver,
      sessionResolver,
      registeredStore: createBlueskyCredentialRegisteredStore(db, userId, BLUESKY_CREDENTIAL_LOGIN_FAILURE_SCOPE),
      accountSwitchResolver,
      now: Instant.now,
    }),
    deleteBlueskyCredentialUseCase: DeleteBlueskyCredentialUseCase.create({
      removedStore: createBlueskyCredentialRemovedStore(db, userId),
      getCredential,
      accountSwitchResolver,
      storedResolver,
      envCredentials: account.envCredentials,
      verifier,
    }),
    switchBlueskyAccountUseCase: SwitchBlueskyAccountUseCase.create({
      cipherFor,
      envCredentials: account.envCredentials,
      verifyCurrentPassword,
      verifier,
      storedResolver,
      linkedUserIdResolver,
      sessionResolver,
      accountSwitchResolver,
      startedStore: createD1BlueskyAccountSwitchStartedStore(db, userId, BLUESKY_CREDENTIAL_LOGIN_FAILURE_SCOPE),
      now: Instant.now,
    }),
    getBlueskyAccountSwitchUseCase: GetBlueskyAccountSwitchUseCase.create({ accountSwitchResolver }),
    previewBlueskyAccountSwitchUseCase: PreviewBlueskyAccountSwitchUseCase.create({
      previewResolver: createD1BlueskyAccountSwitchPreviewResolver(db, userId),
    }),
  };
};
