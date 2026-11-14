import { afterEach, describe, expect, it } from 'vitest';

import { Instant } from '../../../domain/instant/instant.ts';
import { AccessToken } from '../../../domain/oauth/accessToken.ts';
import { AuthorizationCode } from '../../../domain/oauth/authorizationCode.ts';
import { ClientId } from '../../../domain/oauth/ids.ts';
import { OAuthApplication } from '../../../domain/oauth/oauthApplication.ts';
import { RedirectUri } from '../../../domain/oauth/redirectUri.ts';
import { Scope } from '../../../domain/oauth/scope.ts';
import { Secret } from '../../../domain/oauth/secret.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { ExchangeTokenUseCase } from '../../../useCase/exchangeToken.ts';
import { RegisterOAuthApplicationUseCase } from '../../../useCase/registerOAuthApplication.ts';
import { createD1AccessTokenIssuedStore } from '../oauth/accessTokenIssuedStore.ts';
import {
  createD1AccessTokenResolverByTokenHash,
  createD1AccessTokensResolverByAuthorizationCodeHash,
} from '../oauth/accessTokenResolvers.ts';
import { createD1AccessTokenRevokedStore } from '../oauth/accessTokenRevokedStore.ts';
import { createD1AuthorizationCodeConsumedStore } from '../oauth/authorizationCodeConsumedStore.ts';
import { createD1AuthorizationCodeIssuedStore } from '../oauth/authorizationCodeIssuedStore.ts';
import { createD1AuthorizationCodeResolverByCodeHash } from '../oauth/authorizationCodeResolverByCodeHash.ts';
import { createD1OAuthApplicationRegisteredStore } from '../oauth/oauthApplicationRegisteredStore.ts';
import {
  createD1OAuthApplicationResolver,
  createD1OAuthApplicationResolverByClientId,
} from '../oauth/oauthApplicationResolvers.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

const setup = () => {
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  const userId = UserId.generate();
  fixture.sqlite.prepare('INSERT INTO users(userId,username) VALUES (?,?)').run(userId, 'kosui');
  return { ...fixture, userId, now: Instant.now() };
};

const registerApplication = async (ctx: ReturnType<typeof setup>) => {
  const secretHash = await Secret.hash(Secret.generate());
  const registered = OAuthApplication.register(ctx.now)({
    clientId: ClientId.generate(),
    clientSecretHash: secretHash,
    name: 'Test App',
    website: 'https://app.example',
    redirectUris: [RedirectUri.orThrow('https://app.example/cb'), RedirectUri.orThrow('ivory://cb')],
    scopes: [Scope.orThrow('read'), Scope.orThrow('write')],
  });
  if (!registered.ok) throw new Error('register failed');
  await createD1OAuthApplicationRegisteredStore(ctx.db).store(registered.val);
  return registered.val;
};

describe('D1 OAuth application adapters', () => {
  it('アプリと domain_events を 1 回のバッチで書き、clientId と id で引く', async () => {
    const ctx = setup();
    const registered = await registerApplication(ctx);
    const application = registered.aggregateState;

    const byClientId = await createD1OAuthApplicationResolverByClientId(ctx.db).resolve(application.clientId);
    const byId = await createD1OAuthApplicationResolver(ctx.db).resolve(application.id);

    expect(byClientId).toMatchObject({ ok: true, val: application });
    expect(byId).toMatchObject({ ok: true, val: application });
    const event = ctx.sqlite.prepare('SELECT * FROM domain_events WHERE eventId = ?').get(registered.eventId) as Record<
      string,
      unknown
    >;
    expect(event).toMatchObject({ aggregateName: 'oauthApplication', eventName: 'oauthApplication.registered' });
    const row = ctx.sqlite.prepare('SELECT redirectUris, scopes FROM oauth_applications').get() as Record<
      string,
      string
    >;
    expect(JSON.parse(row['redirectUris']!)).toEqual(['https://app.example/cb', 'ivory://cb']);
    expect(row['scopes']).toBe('read write');
  });

  it('clientId の重複を一意制約で拒む', async () => {
    const ctx = setup();
    const registered = await registerApplication(ctx);
    const duplicate = OAuthApplication.register(ctx.now)({
      ...registered.aggregateState,
      redirectUris: [...registered.aggregateState.redirectUris],
      scopes: [...registered.aggregateState.scopes],
    });
    if (!duplicate.ok) throw new Error('register failed');

    await expect(createD1OAuthApplicationRegisteredStore(ctx.db).store(duplicate.val)).rejects.toThrow();
    const count = ctx.sqlite.prepare('SELECT count(*) AS n FROM domain_events').get() as { n: number };
    expect(count.n).toBe(1);
  });
});

describe('D1 authorization code adapters', () => {
  const issueCode = async (
    ctx: ReturnType<typeof setup>,
    applicationId: ReturnType<typeof OAuthApplication.orThrow>['id'],
  ) => {
    const codeHash = await Secret.hash(Secret.generate());
    const issued = AuthorizationCode.issue(ctx.now)({
      codeHash,
      applicationId,
      userId: ctx.userId,
      redirectUri: RedirectUri.orThrow('https://app.example/cb'),
      scopes: [Scope.orThrow('read')],
      codeChallenge: null,
      codeChallengeMethod: null,
    });
    if (!issued.ok) throw new Error('issue failed');
    await createD1AuthorizationCodeIssuedStore(ctx.db).store(issued.val);
    return issued.val;
  };

  it('使用済みにすると consumedAt を書き、2 回目の更新で上書きしない', async () => {
    const ctx = setup();
    const { aggregateState: application } = await registerApplication(ctx);
    const issued = await issueCode(ctx, application.id);
    const resolver = createD1AuthorizationCodeResolverByCodeHash(ctx.db);
    const store = createD1AuthorizationCodeConsumedStore(ctx.db);

    const first = AuthorizationCode.consume(Instant.addDuration(ctx.now, 1000))(issued.aggregateState);
    const second = AuthorizationCode.consume(Instant.addDuration(ctx.now, 2000))(issued.aggregateState);
    if (!first.ok || !second.ok) throw new Error('consume failed');
    expect(await store.store(first.val)).toMatchObject({ ok: true, val: true });
    expect(await store.store(second.val)).toMatchObject({ ok: true, val: false });

    const resolved = await resolver.resolve(issued.aggregateState.codeHash);
    expect(resolved).toMatchObject({ ok: true, val: { consumedAt: ctx.now + 1000 } });
    const consumedEvents = ctx.sqlite.prepare('SELECT eventId FROM domain_events WHERE eventName = ?').all(
      'authorizationCode.consumed',
    );
    expect(consumedEvents).toHaveLength(1);
  });
});

describe('D1 access token adapters', () => {
  const issueToken = async (
    ctx: ReturnType<typeof setup>,
    applicationId: ReturnType<typeof OAuthApplication.orThrow>['id'],
    overrides: { userId?: UserId | null; authorizationCodeHash?: Awaited<ReturnType<typeof Secret.hash>> | null } = {},
  ) => {
    const tokenHash = await Secret.hash(Secret.generate());
    const issued = AccessToken.issue(ctx.now)({
      tokenHash,
      applicationId,
      userId: overrides.userId === undefined ? ctx.userId : overrides.userId,
      authorizationCodeHash: overrides.authorizationCodeHash ?? null,
      scopes: [Scope.orThrow('read'), Scope.orThrow('write:statuses')],
    });
    if (!issued.ok) throw new Error('issue failed');
    await createD1AccessTokenIssuedStore(ctx.db).store(issued.val);
    return issued.val;
  };

  it('トークンを保存して tokenHash で引ける。client_credentials は userId が null になる', async () => {
    const ctx = setup();
    const { aggregateState: application } = await registerApplication(ctx);
    const withUser = await issueToken(ctx, application.id);
    const appOnly = await issueToken(ctx, application.id, { userId: null });
    const resolver = createD1AccessTokenResolverByTokenHash(ctx.db);

    expect(await resolver.resolve(withUser.aggregateState.tokenHash)).toMatchObject({
      ok: true,
      val: withUser.aggregateState,
    });
    expect(await resolver.resolve(appOnly.aggregateState.tokenHash)).toMatchObject({
      ok: true,
      val: { userId: null, scopes: ['read', 'write:statuses'] },
    });
    expect(await resolver.resolve(await Secret.hash('unknown'))).toMatchObject({ ok: true, val: undefined });
  });

  it('tokenHash の重複を一意索引で拒む', async () => {
    const ctx = setup();
    const { aggregateState: application } = await registerApplication(ctx);
    const issued = await issueToken(ctx, application.id);
    const duplicate = AccessToken.issue(ctx.now)({
      tokenHash: issued.aggregateState.tokenHash,
      applicationId: application.id,
      userId: null,
      authorizationCodeHash: null,
      scopes: [Scope.orThrow('read')],
    });
    if (!duplicate.ok) throw new Error('issue failed');

    await expect(createD1AccessTokenIssuedStore(ctx.db).store(duplicate.val)).rejects.toThrow();
  });

  it('認可コードのハッシュで発行済みのトークンを引ける', async () => {
    const ctx = setup();
    const { aggregateState: application } = await registerApplication(ctx);
    const codeHash = await Secret.hash('code');
    await issueToken(ctx, application.id, { authorizationCodeHash: codeHash });
    await issueToken(ctx, application.id, { authorizationCodeHash: codeHash });
    await issueToken(ctx, application.id);

    const resolved = await createD1AccessTokensResolverByAuthorizationCodeHash(ctx.db).resolve(codeHash);

    expect(resolved.ok && resolved.val).toHaveLength(2);
  });
});

describe('D1 での認可コードの並行交換', () => {
  it('同じコードを同時に交換しても、トークンは 1 本だけ発行する', async () => {
    const ctx = setup();
    const registered = await RegisterOAuthApplicationUseCase.create({
      oauthApplicationRegisteredStore: createD1OAuthApplicationRegisteredStore(ctx.db),
    }).run({ clientName: 'Test App', redirectUris: 'https://app.example/cb', scopes: 'read', website: undefined });
    if (!registered.ok) throw new Error(registered.err.message);
    const { application, clientId, clientSecret } = registered.val;
    const code = 'concurrent-code';
    const issued = AuthorizationCode.issue(ctx.now)({
      codeHash: await Secret.hash(code),
      applicationId: application.id,
      userId: ctx.userId,
      redirectUri: RedirectUri.orThrow('https://app.example/cb'),
      scopes: [Scope.orThrow('read')],
      codeChallenge: null,
      codeChallengeMethod: null,
    });
    if (!issued.ok) throw new Error('issue failed');
    await createD1AuthorizationCodeIssuedStore(ctx.db).store(issued.val);
    const exchangeToken = ExchangeTokenUseCase.create({
      oauthApplicationResolverByClientId: createD1OAuthApplicationResolverByClientId(ctx.db),
      authorizationCodeResolverByCodeHash: createD1AuthorizationCodeResolverByCodeHash(ctx.db),
      authorizationCodeConsumedStore: createD1AuthorizationCodeConsumedStore(ctx.db),
      accessTokenIssuedStore: createD1AccessTokenIssuedStore(ctx.db),
      accessTokenRevokedStore: createD1AccessTokenRevokedStore(ctx.db),
      accessTokensResolverByAuthorizationCodeHash: createD1AccessTokensResolverByAuthorizationCodeHash(ctx.db),
    });
    const input = {
      grantType: 'authorization_code',
      clientId,
      clientSecret,
      code,
      redirectUri: 'https://app.example/cb',
      codeVerifier: undefined,
      scope: undefined,
    };

    const results = await Promise.all([exchangeToken.run(input), exchangeToken.run(input)]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toMatchObject([{ err: { error: 'invalid_grant' } }]);
    const tokens = ctx.sqlite.prepare('SELECT revokedAt FROM oauth_access_tokens').all() as Array<
      { revokedAt: number | null }
    >;
    expect(tokens).toHaveLength(1);
    const consumedEvents = ctx.sqlite.prepare('SELECT eventId FROM domain_events WHERE eventName = ?').all(
      'authorizationCode.consumed',
    );
    expect(consumedEvents).toHaveLength(1);
  });
});
