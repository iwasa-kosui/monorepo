import { afterEach, describe, expect, it, vi } from 'vitest';

import { Secret } from '../../domain/oauth/secret.ts';
import { createOAuthInMemory } from './helper/oauthInMemory.ts';

const REDIRECT_URI = 'https://app.example/callback';
const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

const setup = () => {
  const memory = createOAuthInMemory();
  const { useCases } = memory;

  const register = async (overrides: { scopes?: string; redirectUris?: string | string[] } = {}) => {
    const result = await useCases.registerOAuthApplicationUseCase.run({
      clientName: 'Test App',
      redirectUris: overrides.redirectUris ?? REDIRECT_URI,
      scopes: overrides.scopes ?? 'read write',
      website: undefined,
    });
    if (!result.ok) throw new Error(result.err.message);
    return result.val;
  };

  const authorize = async (
    app: Awaited<ReturnType<typeof register>>,
    options: {
      scope?: string;
      codeChallenge?: string;
      codeChallengeMethod?: string;
      sessionId?: ReturnType<typeof memory.addSession>['sessionId'];
    } = {},
  ) => {
    const sessionId = options.sessionId ?? memory.addSession().sessionId;
    return useCases.issueAuthorizationCodeUseCase.run({
      sessionId,
      clientId: app.clientId,
      redirectUri: REDIRECT_URI,
      scope: options.scope,
      codeChallenge: options.codeChallenge,
      codeChallengeMethod: options.codeChallengeMethod,
    });
  };

  const exchange = (
    app: Awaited<ReturnType<typeof register>>,
    overrides: Partial<Parameters<typeof useCases.exchangeTokenUseCase.run>[0]> = {},
  ) =>
    useCases.exchangeTokenUseCase.run({
      grantType: 'authorization_code',
      clientId: app.clientId,
      clientSecret: app.clientSecret,
      code: undefined,
      redirectUri: REDIRECT_URI,
      codeVerifier: undefined,
      scope: undefined,
      ...overrides,
    });

  const issueCode = async (
    app: Awaited<ReturnType<typeof register>>,
    options: Parameters<typeof authorize>[1] = {},
  ) => {
    const issued = await authorize(app, options);
    if (!issued.ok) throw new Error(JSON.stringify(issued.err));
    return issued.val.code;
  };

  return { memory, useCases, register, authorize, exchange, issueCode };
};

afterEach(() => {
  vi.useRealTimers();
});

describe('RegisterOAuthApplicationUseCase', () => {
  it('アプリを登録し、平文の client_id と client_secret を返す', async () => {
    const { register, memory } = setup();
    const app = await register({ redirectUris: ['https://a.example/cb', 'ivory://cb'], scopes: 'read write follow' });

    expect(app.clientId).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(app.clientSecret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const stored = memory.applications.get(app.application.id)!;
    expect(stored.clientSecretHash).toBe(await Secret.hash(app.clientSecret));
    expect(stored.redirectUris).toEqual(['https://a.example/cb', 'ivory://cb']);
    expect(stored.scopes).toEqual(['read', 'write', 'follow']);
  });

  it('scopes を省略すると read になり、改行区切りの redirect_uris を分ける', async () => {
    const { useCases } = setup();
    const result = await useCases.registerOAuthApplicationUseCase.run({
      clientName: 'App',
      redirectUris: 'https://a.example/cb\nhttps://b.example/cb',
      scopes: undefined,
      website: 'https://app.example',
    });

    expect(result).toMatchObject({
      ok: true,
      val: {
        application: {
          scopes: ['read'],
          website: 'https://app.example',
          redirectUris: ['https://a.example/cb', 'https://b.example/cb'],
        },
      },
    });
  });

  it('イベントのペイロードに client_secret の平文を含めない', async () => {
    const { register, memory } = setup();
    const app = await register();

    expect(memory.events.map((event) => event.eventName)).toEqual(['oauthApplication.registered']);
    expect(JSON.stringify(memory.events)).not.toContain(app.clientSecret);
  });

  it.each([
    ['client_name がない', { clientName: undefined, redirectUris: REDIRECT_URI }],
    ['redirect_uris がない', { clientName: 'App', redirectUris: undefined }],
    ['redirect_uris が javascript:', { clientName: 'App', redirectUris: 'javascript:alert(1)' }],
    ['scopes が未知', { clientName: 'App', redirectUris: REDIRECT_URI, scopes: 'admin' }],
    ['website が URL でない', { clientName: 'App', redirectUris: REDIRECT_URI, website: 'javascript:alert(1)' }],
  ])('%s と拒否する', async (_label, input) => {
    const { useCases, memory } = setup();
    const result = await useCases.registerOAuthApplicationUseCase.run({
      scopes: undefined,
      website: undefined,
      ...input,
    });

    expect(result).toMatchObject({ ok: false, err: { type: 'InvalidApplicationRequestError' } });
    expect(memory.applications.size).toBe(0);
  });
});

describe('IssueAuthorizationCodeUseCase', () => {
  it('認可コードを発行し、ハッシュだけを保存する', async () => {
    const { register, authorize, memory } = setup();
    const app = await register();
    const result = await authorize(app, { scope: 'read' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const stored = memory.codes.get(await Secret.hash(result.val.code))!;
    expect(stored).toMatchObject({
      scopes: ['read'],
      redirectUri: REDIRECT_URI,
      codeChallenge: null,
      consumedAt: null,
    });
    expect(stored.expiresAt - stored.createdAt).toBe(10 * 60 * 1000);
    expect(JSON.stringify(memory.events)).not.toContain(result.val.code);
  });

  it('redirect_uri が登録値と完全一致しないと拒否する', async () => {
    const { register, useCases, memory } = setup();
    const app = await register();
    const result = await useCases.issueAuthorizationCodeUseCase.run({
      sessionId: memory.addSession().sessionId,
      clientId: app.clientId,
      redirectUri: `${REDIRECT_URI}/`,
      scope: undefined,
      codeChallenge: undefined,
      codeChallengeMethod: undefined,
    });

    expect(result).toMatchObject({ ok: false, err: { type: 'UnredirectableAuthorizationError' } });
  });

  it('未知の client_id を拒否する', async () => {
    const { useCases, memory } = setup();
    const result = await useCases.issueAuthorizationCodeUseCase.run({
      sessionId: memory.addSession().sessionId,
      clientId: 'unknown',
      redirectUri: REDIRECT_URI,
      scope: undefined,
      codeChallenge: undefined,
      codeChallengeMethod: undefined,
    });

    expect(result).toMatchObject({ ok: false, err: { type: 'UnredirectableAuthorizationError' } });
  });

  it('登録スコープの部分集合でない scope を invalid_scope にする', async () => {
    const { register, authorize } = setup();
    const app = await register({ scopes: 'read' });

    expect(await authorize(app, { scope: 'read write' })).toMatchObject({
      ok: false,
      err: { type: 'OAuthError', error: 'invalid_scope' },
    });
    expect(await authorize(app, { scope: 'bogus' })).toMatchObject({
      ok: false,
      err: { type: 'OAuthError', error: 'invalid_scope' },
    });
  });

  it('登録スコープの細分スコープを許す', async () => {
    const { register, authorize } = setup();
    const app = await register({ scopes: 'read write' });

    expect(await authorize(app, { scope: 'read:statuses write:media' })).toMatchObject({ ok: true });
  });

  it('PKCE は S256 の code_challenge だけを受け付ける', async () => {
    const { register, authorize } = setup();
    const app = await register();

    expect(await authorize(app, { codeChallenge: CHALLENGE, codeChallengeMethod: 'S256' })).toMatchObject({ ok: true });
    expect(await authorize(app, { codeChallenge: CHALLENGE, codeChallengeMethod: 'plain' })).toMatchObject({
      ok: false,
      err: { error: 'invalid_request' },
    });
    expect(await authorize(app, { codeChallenge: CHALLENGE })).toMatchObject({
      ok: false,
      err: { error: 'invalid_request' },
    });
    expect(await authorize(app, { codeChallenge: 'short', codeChallengeMethod: 'S256' })).toMatchObject({
      ok: false,
      err: { error: 'invalid_request' },
    });
  });

  it('期限切れのセッションを拒否する', async () => {
    const { register, authorize, memory } = setup();
    const app = await register();
    const { sessionId } = memory.addSession(undefined, 1 as never);

    expect(await authorize(app, { sessionId })).toMatchObject({ ok: false, err: { type: 'SessionExpiredError' } });
  });
});

describe('ExchangeTokenUseCase (authorization_code)', () => {
  it('コードをトークンに交換し、ハッシュだけを保存する', async () => {
    const { register, issueCode, exchange, memory } = setup();
    const app = await register();
    const { userId, sessionId } = memory.addSession();
    const code = await issueCode(app, { scope: 'read', sessionId });

    const result = await exchange(app, { code });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.val.scopes).toEqual(['read']);
    const [token] = [...memory.tokens.values()];
    expect(token).toMatchObject({ userId, scopes: ['read'], revokedAt: null });
    expect(token!.tokenHash).toBe(await Secret.hash(result.val.accessToken));
    expect(token!.authorizationCodeHash).toBe(await Secret.hash(code));
    expect(JSON.stringify(memory.events)).not.toContain(result.val.accessToken);
    expect(memory.events.map((event) => event.eventName)).toEqual([
      'oauthApplication.registered',
      'authorizationCode.issued',
      'authorizationCode.consumed',
      'accessToken.issued',
    ]);
  });

  it('client_secret が違うと invalid_client にする', async () => {
    const { register, issueCode, exchange } = setup();
    const app = await register();
    const code = await issueCode(app);

    expect(await exchange(app, { code, clientSecret: 'wrong' })).toMatchObject({
      ok: false,
      err: { error: 'invalid_client' },
    });
    expect(await exchange(app, { code, clientSecret: undefined })).toMatchObject({
      ok: false,
      err: { error: 'invalid_client' },
    });
  });

  it('redirect_uri が認可時と違うと invalid_grant にする', async () => {
    const { register, issueCode, exchange } = setup();
    const app = await register({ redirectUris: [REDIRECT_URI, 'https://other.example/cb'] });
    const code = await issueCode(app);

    expect(await exchange(app, { code, redirectUri: 'https://other.example/cb' })).toMatchObject({
      ok: false,
      err: { error: 'invalid_grant' },
    });
  });

  it('別のアプリのコードを invalid_grant にする', async () => {
    const { register, issueCode, exchange } = setup();
    const app = await register();
    const other = await register();
    const code = await issueCode(app);

    expect(await exchange(other, { code })).toMatchObject({ ok: false, err: { error: 'invalid_grant' } });
  });

  it('期限切れのコードを invalid_grant にする', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const { register, issueCode, exchange, memory } = setup();
    const app = await register();
    const code = await issueCode(app);

    vi.setSystemTime(new Date('2026-01-01T00:10:00Z'));
    const result = await exchange(app, { code });

    expect(result).toMatchObject({ ok: false, err: { error: 'invalid_grant' } });
    expect(memory.tokens.size).toBe(0);
  });

  it('期限内のコードは交換できる', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const { register, issueCode, exchange, memory } = setup();
    const app = await register();
    const { sessionId } = memory.addSession();
    const code = await issueCode(app, { sessionId });

    vi.setSystemTime(new Date('2026-01-01T00:09:59Z'));

    expect(await exchange(app, { code })).toMatchObject({ ok: true });
  });

  describe('PKCE', () => {
    it('正しい code_verifier を受け付ける', async () => {
      const { register, issueCode, exchange } = setup();
      const app = await register();
      const code = await issueCode(app, { codeChallenge: CHALLENGE, codeChallengeMethod: 'S256' });

      expect(await exchange(app, { code, codeVerifier: VERIFIER })).toMatchObject({ ok: true });
    });

    it('code_verifier がない、または違うと invalid_grant にし、コードは消費しない', async () => {
      const { register, issueCode, exchange, memory } = setup();
      const app = await register();
      const code = await issueCode(app, { codeChallenge: CHALLENGE, codeChallengeMethod: 'S256' });

      expect(await exchange(app, { code })).toMatchObject({ ok: false, err: { error: 'invalid_grant' } });
      expect(await exchange(app, { code, codeVerifier: `${VERIFIER}x` })).toMatchObject({
        ok: false,
        err: { error: 'invalid_grant' },
      });
      expect([...memory.codes.values()][0]!.consumedAt).toBeNull();
      expect(await exchange(app, { code, codeVerifier: VERIFIER })).toMatchObject({ ok: true });
    });

    it('PKCE なしで発行したコードは code_verifier なしで交換できる', async () => {
      const { register, issueCode, exchange } = setup();
      const app = await register();
      const code = await issueCode(app);

      expect(await exchange(app, { code })).toMatchObject({ ok: true });
    });
  });

  describe('コードの再使用', () => {
    it('使用済みコードが再び来たら invalid_grant にし、そのコードのトークンをすべて失効させる', async () => {
      const { register, issueCode, exchange, memory } = setup();
      const app = await register();
      const code = await issueCode(app);

      const first = await exchange(app, { code });
      expect(first.ok).toBe(true);
      const second = await exchange(app, { code });

      expect(second).toMatchObject({ ok: false, err: { error: 'invalid_grant' } });
      const [token] = [...memory.tokens.values()];
      expect(token!.revokedAt).not.toBeNull();
      expect(memory.events.map((event) => event.eventName)).toContain('accessToken.revoked');
    });

    it('別のコードで発行したトークンは失効させない', async () => {
      const { register, issueCode, exchange, memory } = setup();
      const app = await register();
      const codeA = await issueCode(app);
      const codeB = await issueCode(app);
      await exchange(app, { code: codeA });
      await exchange(app, { code: codeB });

      await exchange(app, { code: codeA });

      const revoked = [...memory.tokens.values()].filter((token) => token.revokedAt !== null);
      expect(revoked).toHaveLength(1);
      expect(revoked[0]!.authorizationCodeHash).toBe(await Secret.hash(codeA));
    });
  });

  it('code または redirect_uri がないと invalid_request にする', async () => {
    const { register, exchange } = setup();
    const app = await register();

    expect(await exchange(app, { code: undefined })).toMatchObject({ ok: false, err: { error: 'invalid_request' } });
  });
});

describe('ExchangeTokenUseCase (grant_type)', () => {
  it('grant_type の欠落と未対応を区別する', async () => {
    const { register, exchange } = setup();
    const app = await register();

    expect(await exchange(app, { grantType: undefined })).toMatchObject({
      ok: false,
      err: { error: 'invalid_request' },
    });
    expect(await exchange(app, { grantType: 'password' })).toMatchObject({
      ok: false,
      err: { error: 'unsupported_grant_type' },
    });
  });
});

describe('ExchangeTokenUseCase (client_credentials)', () => {
  it('userId が null のトークンを発行し、scope を省略すると read になる', async () => {
    const { register, exchange, memory } = setup();
    const app = await register({ scopes: 'read write' });

    const result = await exchange(app, { grantType: 'client_credentials' });

    expect(result).toMatchObject({ ok: true, val: { scopes: ['read'] } });
    expect([...memory.tokens.values()][0]).toMatchObject({ userId: null, authorizationCodeHash: null });
  });

  it('登録スコープの部分集合だけを許す', async () => {
    const { register, exchange } = setup();
    const app = await register({ scopes: 'read' });

    expect(await exchange(app, { grantType: 'client_credentials', scope: 'read:statuses' })).toMatchObject({
      ok: true,
    });
    expect(await exchange(app, { grantType: 'client_credentials', scope: 'write' })).toMatchObject({
      ok: false,
      err: { error: 'invalid_scope' },
    });
    expect(await exchange(app, { grantType: 'client_credentials', scope: 'nope' })).toMatchObject({
      ok: false,
      err: { error: 'invalid_scope' },
    });
  });

  it('client_secret が違うと invalid_client にする', async () => {
    const { register, exchange } = setup();
    const app = await register();

    expect(await exchange(app, { grantType: 'client_credentials', clientSecret: 'wrong' })).toMatchObject({
      ok: false,
      err: { error: 'invalid_client' },
    });
  });
});

describe('RevokeTokenUseCase', () => {
  const issueToken = async (
    setupResult: ReturnType<typeof setup>,
    app: Awaited<ReturnType<ReturnType<typeof setup>['register']>>,
  ) => {
    const issued = await setupResult.exchange(app, { grantType: 'client_credentials' });
    if (!issued.ok) throw new Error('token not issued');
    return issued.val.accessToken;
  };

  it('トークンを失効させる', async () => {
    const s = setup();
    const app = await s.register();
    const token = await issueToken(s, app);

    const result = await s.useCases.revokeTokenUseCase.run({
      clientId: app.clientId,
      clientSecret: app.clientSecret,
      token,
    });

    expect(result.ok).toBe(true);
    expect([...s.memory.tokens.values()][0]!.revokedAt).not.toBeNull();
    expect(s.memory.events.map((event) => event.eventName)).toContain('accessToken.revoked');
  });

  it('別のアプリのトークンは unauthorized_client にし、失効させない', async () => {
    const s = setup();
    const app = await s.register();
    const other = await s.register();
    const token = await issueToken(s, app);

    const result = await s.useCases.revokeTokenUseCase.run({
      clientId: other.clientId,
      clientSecret: other.clientSecret,
      token,
    });

    expect(result).toMatchObject({ ok: false, err: { error: 'unauthorized_client' } });
    expect([...s.memory.tokens.values()][0]!.revokedAt).toBeNull();
  });

  it('存在しないトークンは成功として扱う', async () => {
    const s = setup();
    const app = await s.register();

    const result = await s.useCases.revokeTokenUseCase.run({
      clientId: app.clientId,
      clientSecret: app.clientSecret,
      token: 'does-not-exist',
    });

    expect(result.ok).toBe(true);
  });

  it('失効済みのトークンも成功として扱う', async () => {
    const s = setup();
    const app = await s.register();
    const token = await issueToken(s, app);
    const input = { clientId: app.clientId, clientSecret: app.clientSecret, token };
    await s.useCases.revokeTokenUseCase.run(input);

    expect((await s.useCases.revokeTokenUseCase.run(input)).ok).toBe(true);
    expect(s.memory.events.filter((event) => event.eventName === 'accessToken.revoked')).toHaveLength(1);
  });

  it('client_secret が違うと invalid_client にする', async () => {
    const s = setup();
    const app = await s.register();
    const token = await issueToken(s, app);

    const result = await s.useCases.revokeTokenUseCase.run({ clientId: app.clientId, clientSecret: 'wrong', token });

    expect(result).toMatchObject({ ok: false, err: { error: 'invalid_client' } });
  });
});

describe('VerifyAccessTokenUseCase', () => {
  const issue = async (s: ReturnType<typeof setup>) => {
    const app = await s.register({ scopes: 'read write' });
    const code = await s.issueCode(app, { scope: 'read write' });
    const result = await s.exchange(app, { code });
    if (!result.ok) throw new Error('token not issued');
    return { app, token: result.val.accessToken };
  };

  it('有効なトークンから applicationId、userId、scopes を返す', async () => {
    const s = setup();
    const { app, token } = await issue(s);

    const result = await s.useCases.verifyAccessTokenUseCase.run({ token });

    expect(result).toMatchObject({
      ok: true,
      val: { applicationId: app.application.id, scopes: ['read', 'write'] },
    });
    expect(result.ok && result.val.userId).not.toBeNull();
  });

  it('client_credentials のトークンは userId が null になる', async () => {
    const s = setup();
    const app = await s.register();
    const issued = await s.exchange(app, { grantType: 'client_credentials' });
    if (!issued.ok) throw new Error('token not issued');

    const result = await s.useCases.verifyAccessTokenUseCase.run({ token: issued.val.accessToken });

    expect(result).toMatchObject({ ok: true, val: { userId: null } });
  });

  it('未知のトークンと失効済みのトークンを拒否する', async () => {
    const s = setup();
    const { app, token } = await issue(s);
    expect(await s.useCases.verifyAccessTokenUseCase.run({ token: 'unknown' })).toMatchObject({ ok: false });

    await s.useCases.revokeTokenUseCase.run({ clientId: app.clientId, clientSecret: app.clientSecret, token });

    expect(await s.useCases.verifyAccessTokenUseCase.run({ token })).toMatchObject({
      ok: false,
      err: { type: 'AccessTokenInvalidError' },
    });
  });

  it('lastUsedAt の更新は 1 時間に 1 回までにする', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const s = setup();
    const { token } = await issue(s);

    await s.useCases.verifyAccessTokenUseCase.run({ token });
    expect(s.memory.usageRecords).toHaveLength(1);

    vi.setSystemTime(new Date('2026-01-01T00:59:59Z'));
    await s.useCases.verifyAccessTokenUseCase.run({ token });
    expect(s.memory.usageRecords).toHaveLength(1);

    vi.setSystemTime(new Date('2026-01-01T01:00:00Z'));
    await s.useCases.verifyAccessTokenUseCase.run({ token });
    expect(s.memory.usageRecords).toHaveLength(2);
  });
});
