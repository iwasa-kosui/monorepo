import { RA } from '@iwasa-kosui/result';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { insertBlueskyAccountSwitch } from '../adaptor/d1/__tests__/blueskyAccountSwitchFixture.ts';
import { createSqliteD1Fixture } from '../adaptor/d1/__tests__/sqliteFixture.ts';
import { createD1BlueskyAccountSwitchResolver } from '../adaptor/d1/blueskyAccountSwitch/blueskyAccountSwitchResolver.ts';
import {
  createD1BlueskyStoredCredentialResolver,
  createD1BlueskyStoredCredentialSavedStore,
} from '../adaptor/d1/blueskyCredential/blueskyCredentialStore.ts';
import {
  createD1BlueskySessionResolver,
  createD1BlueskySessionSavedStore,
} from '../adaptor/d1/blueskyCrosspost/blueskySessionStore.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { BlueskyClientError, BlueskyCredentials } from '../ports/blueskyClient.ts';
import type { BlueskyCredentialVerifier } from '../ports/blueskyCredentialVerifier.ts';
import { createBlueskyCredentialRemovedStore } from '../runtime/blueskyCredential.ts';
import { DeleteBlueskyCredentialUseCase } from './deleteBlueskyCredential.ts';
import { GetBlueskyCredentialUseCase } from './getBlueskyCredential.ts';
import { ResolveBlueskyCredentialUseCase } from './resolveBlueskyCredential.ts';

const NOW = Instant.orThrow(1_800_000_000_000);
const ENV_CREDENTIALS: BlueskyCredentials = { identifier: 'env.example.com', appPassword: 'env-app-password' };
const loginError: BlueskyClientError = { type: 'BlueskyClientError', kind: 'auth', message: 'failed', status: 401 };

const envSession = (did: string) => ({
  did,
  handle: 'env.example.com',
  pdsUrl: 'https://pds.example',
  accessJwt: 'env-access',
  refreshJwt: 'env-refresh',
  updatedAt: NOW,
});

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

const setup = async (options: { env?: BlueskyCredentials; login?: BlueskyCredentialVerifier['login'] } = {}) => {
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  const { db, sqlite } = fixture;
  await createD1BlueskyStoredCredentialSavedStore(db).save({
    identifier: 'next.bsky.social',
    did: 'did:plc:next',
    handle: 'next.bsky.social',
    appPasswordCiphertext: 'Y2lwaGVy',
    appPasswordIv: 'aXY=',
    keyVersion: 1,
    chatPermitted: true,
    verifiedAt: NOW,
    updatedAt: NOW,
  });
  await createD1BlueskySessionSavedStore(db).save({ ...envSession('did:plc:next'), accessJwt: 'access' });
  const verifier: BlueskyCredentialVerifier = {
    login: vi.fn(options.login ?? (async () => RA.ok(envSession('did:plc:next')))),
    probeChat: vi.fn(async () => true),
    logout: vi.fn(async () => undefined),
  };
  const storedResolver = createD1BlueskyStoredCredentialResolver(db);
  const sessionResolver = createD1BlueskySessionResolver(db);
  const useCase = DeleteBlueskyCredentialUseCase.create({
    removedStore: createBlueskyCredentialRemovedStore(db),
    getCredential: GetBlueskyCredentialUseCase.create({
      resolveCredential: ResolveBlueskyCredentialUseCase.create({
        storedResolver,
        cipherFor: undefined,
        envCredentials: options.env,
        onDecryptFailed: () => undefined,
      }),
      sessionResolver,
      registrable: true,
    }),
    accountSwitchResolver: createD1BlueskyAccountSwitchResolver(db),
    storedResolver,
    envCredentials: options.env,
    verifier,
  });
  const rows = () => ({
    credentials: sqlite.prepare('SELECT * FROM bluesky_credentials').all(),
    sessions: sqlite.prepare('SELECT * FROM bluesky_sessions').all(),
  });
  return { useCase, verifier, rows, sqlite };
};

describe('DeleteBlueskyCredentialUseCase', () => {
  it('env の DID が保存済みの DID と同じなら、env のセッションを logout して削除する', async () => {
    const t = await setup({ env: ENV_CREDENTIALS });

    const result = await t.useCase.run();

    expect(result).toMatchObject({ ok: true, val: { source: 'secret' } });
    expect(t.verifier.login).toHaveBeenCalledWith(ENV_CREDENTIALS);
    expect(t.verifier.logout).toHaveBeenCalledOnce();
    expect(t.rows()).toEqual({ credentials: [], sessions: [] });
  });

  it('env の DID が保存済みの DID と違えば、何も変えずに BlueskyEnvAccountDiffers にする', async () => {
    const t = await setup({ env: ENV_CREDENTIALS, login: async () => RA.ok(envSession('did:plc:prev')) });
    const before = t.rows();

    const result = await t.useCase.run();

    expect(result).toMatchObject({ ok: false, err: { type: 'BlueskyEnvAccountDiffers' } });
    expect(t.verifier.logout).toHaveBeenCalledOnce();
    expect(t.rows()).toEqual(before);
  });

  it('env でのログインに失敗したら、従来どおり削除する', async () => {
    const t = await setup({ env: ENV_CREDENTIALS, login: async () => RA.err(loginError) });

    const result = await t.useCase.run();

    expect(result).toMatchObject({ ok: true });
    expect(t.verifier.logout).not.toHaveBeenCalled();
    expect(t.rows()).toEqual({ credentials: [], sessions: [] });
  });

  it('切り替え中は BlueskyAccountSwitchInProgress にし、env でログインせず何も変えない', async () => {
    const t = await setup({ env: ENV_CREDENTIALS });
    insertBlueskyAccountSwitch(t.sqlite);
    const before = t.rows();

    const result = await t.useCase.run();

    expect(result).toMatchObject({ ok: false, err: { type: 'BlueskyAccountSwitchInProgress' } });
    expect(t.verifier.login).not.toHaveBeenCalled();
    expect(t.rows()).toEqual(before);
  });
});
