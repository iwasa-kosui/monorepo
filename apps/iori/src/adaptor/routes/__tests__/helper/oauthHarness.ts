import { Hono } from 'hono';

import { Scope } from '../../../../domain/oauth/scope.ts';
import { createOAuthInMemory } from '../../../../useCase/__tests__/helper/oauthInMemory.ts';
import { createMastodonAuthn, type MastodonAuthEnv } from '../../mastodonAuthn.ts';
import { createWorkerMastodonAppsRouter } from '../../workerMastodonAppsRouter.ts';
import { createWorkerOAuthRouter } from '../../workerOAuthRouter.ts';

export const ORIGIN = 'https://iori.test';
export const REDIRECT_URI = 'https://app.example/callback';

export const createOAuthHarness = () => {
  const memory = createOAuthInMemory();
  const authn = createMastodonAuthn({
    verifyAccessTokenUseCase: memory.useCases.verifyAccessTokenUseCase,
    sessionResolver: memory.sessionResolver as never,
  });
  const protectedRoutes = new Hono<MastodonAuthEnv>()
    .get('/api/v1/user', authn.requireUser(Scope.orThrow('read')), (c) => c.json(c.get('principal') ?? null))
    .post('/api/v1/user', authn.requireUser(Scope.orThrow('read')), (c) => c.json({ ok: true }))
    .get('/api/v1/statuses', authn.requireUser('read:statuses' as never), (c) => c.json({ ok: true }))
    .get(
      '/api/v1/account',
      authn.requireUser('read:accounts' as never, 'profile' as never),
      (c) => c.json({ ok: true }),
    )
    .get('/api/v1/public', authn.optionalAuth, (c) => c.json({ authenticated: c.get('principal') !== undefined }))
    .get('/api/v1/app', authn.requireApp, (c) => c.json({ ok: true }));
  const app = new Hono()
    .route(
      '/',
      createWorkerOAuthRouter({
        validateAuthorizationRequestUseCase: memory.useCases.validateAuthorizationRequestUseCase,
        issueAuthorizationCodeUseCase: memory.useCases.issueAuthorizationCodeUseCase,
        exchangeTokenUseCase: memory.useCases.exchangeTokenUseCase,
        revokeTokenUseCase: memory.useCases.revokeTokenUseCase,
        sessionResolver: memory.sessionResolver as never,
      }),
    )
    .route(
      '/api',
      createWorkerMastodonAppsRouter({
        registerOAuthApplicationUseCase: memory.useCases.registerOAuthApplicationUseCase,
        oauthApplicationResolver: memory.oauthApplicationResolver as never,
        authn,
      }),
    )
    .route('/', protectedRoutes);

  const request = (path: string, init?: RequestInit) => app.request(`${ORIGIN}${path}`, init);

  const registerApp = async (overrides: { name?: string; scopes?: string; redirectUris?: string[] } = {}) => {
    const result = await memory.useCases.registerOAuthApplicationUseCase.run({
      clientName: overrides.name ?? 'Test App',
      redirectUris: overrides.redirectUris ?? [REDIRECT_URI],
      scopes: overrides.scopes ?? 'read write follow',
      website: undefined,
    });
    if (!result.ok) throw new Error(result.err.message);
    return result.val;
  };

  const issueUserToken = async (scope = 'read write') => {
    const registered = await registerApp({ scopes: scope });
    const session = memory.addSession();
    const issued = await memory.useCases.issueAuthorizationCodeUseCase.run({
      sessionId: session.sessionId,
      clientId: registered.clientId,
      redirectUri: REDIRECT_URI,
      scope,
      codeChallenge: undefined,
      codeChallengeMethod: undefined,
    });
    if (!issued.ok) throw new Error('code not issued');
    const exchanged = await memory.useCases.exchangeTokenUseCase.run({
      grantType: 'authorization_code',
      clientId: registered.clientId,
      clientSecret: registered.clientSecret,
      code: issued.val.code,
      redirectUri: REDIRECT_URI,
      codeVerifier: undefined,
      scope: undefined,
    });
    if (!exchanged.ok) throw new Error('token not issued');
    return { ...session, ...registered, token: exchanged.val.accessToken };
  };

  const issueAppToken = async (scope?: string) => {
    const registered = await registerApp();
    const exchanged = await memory.useCases.exchangeTokenUseCase.run({
      grantType: 'client_credentials',
      clientId: registered.clientId,
      clientSecret: registered.clientSecret,
      code: undefined,
      redirectUri: undefined,
      codeVerifier: undefined,
      scope,
    });
    if (!exchanged.ok) throw new Error('token not issued');
    return { ...registered, token: exchanged.val.accessToken };
  };

  return { memory, app, request, registerApp, issueUserToken, issueAppToken };
};

export const form = (values: Record<string, string>) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(values).toString(),
});
