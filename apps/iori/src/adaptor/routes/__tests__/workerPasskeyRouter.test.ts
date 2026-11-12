import { RA } from '@iwasa-kosui/result';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { PasskeyCredential, PasskeyCredentialNotFoundError } from '../../../domain/passkey/passkeyCredential.ts';
import { PasskeyCredentialId } from '../../../domain/passkey/passkeyCredentialId.ts';
import { WebAuthnChallengeInvalidError } from '../../../domain/passkey/webAuthnChallenge.ts';
import { WebAuthnChallengeId } from '../../../domain/passkey/webAuthnChallengeId.ts';
import { SessionId } from '../../../domain/session/sessionId.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { createMockSessionResolver } from '../../../useCase/__tests__/helper/mockAdaptors.ts';
import { InvalidPassword } from '../../../useCase/startPasskeyRegistration.ts';
import { createMastodonAuthn } from '../mastodonAuthn.ts';
import { createWorkerPasskeyRouter } from '../workerPasskeyRouter.ts';

const ORIGIN = 'https://iori.test';
const PASSWORD = 'a-secure-password-with-16-characters';
const AUTHORIZE_NEXT = '/oauth/authorize?client_id=a&state=b';
const SAME_ORIGIN = { Origin: ORIGIN };

const registrationResponse = {
  id: 'cred',
  rawId: 'cred',
  type: 'public-key',
  clientExtensionResults: {},
  response: { clientDataJSON: 'a', attestationObject: 'b', transports: ['internal'] },
};
const authenticationResponse = {
  id: 'cred',
  rawId: 'cred',
  type: 'public-key',
  clientExtensionResults: {},
  response: { clientDataJSON: 'a', authenticatorData: 'b', signature: 'c', userHandle: 'd' },
};

const createApp = () => {
  const userId = UserId.generate();
  const sessionId = SessionId.generate();
  const sessionResolver = createMockSessionResolver();
  sessionResolver.setSession({ sessionId, userId, expires: (Date.now() + 60_000) as never });
  const challengeId = WebAuthnChallengeId.generate();
  const credential = PasskeyCredential.orThrow({
    credentialId: 'cred',
    userId,
    publicKey: 'key',
    counter: 3,
    transports: ['internal'],
    deviceType: 'multiDevice',
    backedUp: true,
    name: 'MacBook',
    createdAt: Date.UTC(2026, 10, 1),
    lastUsedAt: null,
  });
  const deps = {
    startPasskeyRegistrationUseCase: {
      run: vi.fn(async (_input: unknown) => RA.ok({ options: { challenge: 'reg-challenge' }, challengeId })),
    },
    finishPasskeyRegistrationUseCase: { run: vi.fn(async (_input: unknown) => RA.ok({ credential })) },
    startPasskeyAuthenticationUseCase: {
      run: vi.fn(async (_input: unknown) => RA.ok({ options: { challenge: 'auth-challenge' }, challengeId })),
    },
    finishPasskeyAuthenticationUseCase: {
      run: vi.fn(async (_input: unknown) => RA.ok({ sessionId: SessionId.generate() })),
    },
    listPasskeysUseCase: { run: vi.fn(async (_input: unknown) => RA.ok({ credentials: [credential] })) },
    deletePasskeyUseCase: {
      run: vi.fn(async (_input: unknown) => RA.ok({ credentialId: PasskeyCredentialId.orThrow('cred') })),
    },
  };
  const authn = createMastodonAuthn({
    verifyAccessTokenUseCase: { run: vi.fn(async () => RA.err({ type: 'invalid' })) } as never,
    sessionResolver,
  });
  const app = new Hono().route('/auth/passkey', createWorkerPasskeyRouter({ ...deps, authn } as never));
  return { app, deps, userId, sessionId, challengeId, credential };
};

type Harness = ReturnType<typeof createApp>;

const request = (
  h: Harness,
  method: string,
  path: string,
  options: Readonly<{ body?: unknown; headers?: Record<string, string>; session?: boolean; challenge?: boolean }> = {},
) => {
  const cookies = [
    options.session === false ? undefined : `sessionId=${h.sessionId}`,
    options.challenge === false ? undefined : `webauthnChallengeId=${h.challengeId}`,
  ].filter((cookie) => cookie !== undefined).join('; ');
  return h.app.request(`${ORIGIN}/auth/passkey${path}`, {
    method,
    headers: {
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(cookies === '' ? {} : { Cookie: cookies }),
      ...(options.headers ?? SAME_ORIGIN),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
};

const setCookies = (response: Response): string[] => response.headers.getSetCookie();
const challengeCookie = (response: Response): string =>
  setCookies(response).find((cookie) => cookie.startsWith('webauthnChallengeId=')) ?? '';

const writes: ReadonlyArray<
  Readonly<{ name: string; method: string; path: string; body?: unknown; use: keyof Harness['deps'] }>
> = [
  {
    name: 'registration-options',
    method: 'POST',
    path: '/registration-options',
    body: { password: PASSWORD },
    use: 'startPasskeyRegistrationUseCase',
  },
  {
    name: 'registrations',
    method: 'POST',
    path: '/registrations',
    body: { response: registrationResponse },
    use: 'finishPasskeyRegistrationUseCase',
  },
  {
    name: 'authentication-options',
    method: 'POST',
    path: '/authentication-options',
    use: 'startPasskeyAuthenticationUseCase',
  },
  {
    name: 'sign-in',
    method: 'POST',
    path: '/sign-in',
    body: { response: authenticationResponse },
    use: 'finishPasskeyAuthenticationUseCase',
  },
  { name: 'DELETE credentials', method: 'DELETE', path: '/credentials/cred', use: 'deletePasskeyUseCase' },
];

describe('createWorkerPasskeyRouter', () => {
  describe.each(writes)('$method $path の同一オリジン検査', ({ method, path, body, use }) => {
    it('Origin が違うと 403 にし、ユースケースを呼ばない', async () => {
      const h = createApp();

      const response = await request(h, method, path, {
        body: body ?? {},
        headers: { Origin: 'https://evil.example' },
      });

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({ error: 'Forbidden' });
      expect(h.deps[use].run).not.toHaveBeenCalled();
    });

    it('Origin も Sec-Fetch-Site も無いと 403 にする', async () => {
      const h = createApp();

      const response = await request(h, method, path, { body: body ?? {}, headers: {} });

      expect(response.status).toBe(403);
    });
  });

  describe('未ログイン', () => {
    it.each(
      [
        ['POST', '/registration-options', { password: PASSWORD }],
        ['POST', '/registrations', { response: registrationResponse }],
        ['GET', '/credentials', undefined],
        ['DELETE', '/credentials/cred', undefined],
      ] as const,
    )('%s %s は 401 unauthorized にする', async (method, path, body) => {
      const h = createApp();

      const response = await request(h, method, path, { body, session: false });

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'unauthorized' });
      for (const useCase of Object.values(h.deps)) expect(useCase.run).not.toHaveBeenCalled();
    });
  });

  describe('POST /auth/passkey/registration-options', () => {
    it('options をそのまま返し、challenge の Cookie を付ける', async () => {
      const h = createApp();

      const response = await request(h, 'POST', '/registration-options', { body: { password: PASSWORD } });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ challenge: 'reg-challenge' });
      const cookie = challengeCookie(response);
      expect(cookie).toContain(`webauthnChallengeId=${h.challengeId}`);
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Secure');
      expect(cookie).toContain('SameSite=Strict');
      expect(cookie).toContain('Path=/auth/passkey');
      expect(cookie).toContain('Max-Age=300');
      expect(h.deps.startPasskeyRegistrationUseCase.run).toHaveBeenCalledWith({ userId: h.userId, password: PASSWORD });
    });

    it('パスワードが違うと 400 invalid_password にし、Cookie を付けない', async () => {
      const h = createApp();
      h.deps.startPasskeyRegistrationUseCase.run.mockResolvedValueOnce(
        RA.err(InvalidPassword.create(h.userId)) as never,
      );

      const response = await request(h, 'POST', '/registration-options', { body: { password: PASSWORD } });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'invalid_password' });
      expect(challengeCookie(response)).toBe('');
    });

    it('短すぎるパスワードはユースケースを呼ばず 400 invalid_password にする', async () => {
      const h = createApp();

      const response = await request(h, 'POST', '/registration-options', { body: { password: 'short' } });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'invalid_password' });
      expect(h.deps.startPasskeyRegistrationUseCase.run).not.toHaveBeenCalled();
    });

    it.each([{}, { password: 1 }, 'not-json'])('本文が %j だと 400 invalid_request にする', async (body) => {
      const h = createApp();

      const response = await request(h, 'POST', '/registration-options', { body });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'invalid_request' });
    });
  });

  describe('POST /auth/passkey/registrations', () => {
    it('201 で credential を返し、challenge の Cookie を消す', async () => {
      const h = createApp();

      const response = await request(h, 'POST', '/registrations', {
        body: { response: registrationResponse, name: 'MacBook' },
      });

      expect(response.status).toBe(201);
      await expect(response.json()).resolves.toEqual({
        credential: {
          credentialId: 'cred',
          name: 'MacBook',
          createdAt: '2026-11-01T00:00:00.000Z',
          lastUsedAt: null,
          deviceType: 'multiDevice',
          backedUp: true,
        },
      });
      expect(challengeCookie(response)).toContain('Max-Age=0');
      expect(h.deps.finishPasskeyRegistrationUseCase.run).toHaveBeenCalledWith(
        expect.objectContaining({ userId: h.userId, challengeId: h.challengeId, name: 'MacBook' }),
      );
    });

    it('失敗すると 400 registration_failed にし、challenge の Cookie を消す', async () => {
      const h = createApp();
      h.deps.finishPasskeyRegistrationUseCase.run.mockResolvedValueOnce(
        RA.err(WebAuthnChallengeInvalidError.create(h.challengeId)) as never,
      );

      const response = await request(h, 'POST', '/registrations', { body: { response: registrationResponse } });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'registration_failed' });
      expect(challengeCookie(response)).toContain('Max-Age=0');
    });

    it('challenge の Cookie が無いとユースケースを呼ばず 400 にする', async () => {
      const h = createApp();

      const response = await request(h, 'POST', '/registrations', {
        body: { response: registrationResponse },
        challenge: false,
      });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'registration_failed' });
      expect(h.deps.finishPasskeyRegistrationUseCase.run).not.toHaveBeenCalled();
    });
  });

  describe('POST /auth/passkey/authentication-options', () => {
    it('セッションが無くても options を返し、challenge の Cookie を付ける', async () => {
      const h = createApp();

      const response = await request(h, 'POST', '/authentication-options', { session: false, challenge: false });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ challenge: 'auth-challenge' });
      expect(challengeCookie(response)).toContain(`webauthnChallengeId=${h.challengeId}`);
      expect(challengeCookie(response)).toContain('Path=/auth/passkey');
    });
  });

  describe('POST /auth/passkey/sign-in', () => {
    it('成功するとセッション Cookie を発行し、redirectTo を返し、challenge の Cookie を消す', async () => {
      const h = createApp();

      const response = await request(h, 'POST', '/sign-in', {
        body: { response: authenticationResponse },
        session: false,
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ redirectTo: '/' });
      const session = setCookies(response).find((cookie) => cookie.startsWith('sessionId=')) ?? '';
      expect(session).toContain('HttpOnly');
      expect(session).toContain('Secure');
      expect(session).toContain('SameSite=Lax');
      expect(session).toContain('Max-Age=604800');
      expect(challengeCookie(response)).toContain('Max-Age=0');
      expect(h.deps.finishPasskeyAuthenticationUseCase.run).toHaveBeenCalledWith(
        expect.objectContaining({ challengeId: h.challengeId }),
      );
    });

    it('/oauth/authorize への next を redirectTo にする', async () => {
      const h = createApp();

      const response = await request(h, 'POST', '/sign-in', {
        body: { response: authenticationResponse, next: AUTHORIZE_NEXT },
        session: false,
      });

      await expect(response.json()).resolves.toEqual({ redirectTo: AUTHORIZE_NEXT });
    });

    it.each(['/home', '//evil.example', 'https://evil.example/oauth/authorize'])(
      'next が %s のときは redirectTo を / にする',
      async (next) => {
        const h = createApp();

        const response = await request(h, 'POST', '/sign-in', {
          body: { response: authenticationResponse, next },
          session: false,
        });

        await expect(response.json()).resolves.toEqual({ redirectTo: '/' });
      },
    );

    it('失敗すると理由を区別せず 401 authentication_failed にし、セッション Cookie を発行しない', async () => {
      const h = createApp();
      h.deps.finishPasskeyAuthenticationUseCase.run.mockResolvedValueOnce(
        RA.err(WebAuthnChallengeInvalidError.create(h.challengeId)) as never,
      );

      const response = await request(h, 'POST', '/sign-in', {
        body: { response: authenticationResponse },
        session: false,
      });

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'authentication_failed' });
      expect(setCookies(response).some((cookie) => cookie.startsWith('sessionId='))).toBe(false);
      expect(challengeCookie(response)).toContain('Max-Age=0');
    });

    it('challenge の Cookie が無いと 401 にする', async () => {
      const h = createApp();

      const response = await request(h, 'POST', '/sign-in', {
        body: { response: authenticationResponse },
        session: false,
        challenge: false,
      });

      expect(response.status).toBe(401);
      expect(h.deps.finishPasskeyAuthenticationUseCase.run).not.toHaveBeenCalled();
    });
  });

  describe('GET /auth/passkey/credentials', () => {
    it('資格情報の一覧を返す', async () => {
      const h = createApp();

      const response = await request(h, 'GET', '/credentials', { headers: {} });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        credentials: [
          {
            credentialId: 'cred',
            name: 'MacBook',
            createdAt: '2026-11-01T00:00:00.000Z',
            lastUsedAt: null,
            deviceType: 'multiDevice',
            backedUp: true,
          },
        ],
      });
      expect(h.deps.listPasskeysUseCase.run).toHaveBeenCalledWith({ userId: h.userId });
    });
  });

  describe('DELETE /auth/passkey/credentials/:credentialId', () => {
    it('204 を返す', async () => {
      const h = createApp();

      const response = await request(h, 'DELETE', '/credentials/cred');

      expect(response.status).toBe(204);
      expect(h.deps.deletePasskeyUseCase.run).toHaveBeenCalledWith({
        userId: h.userId,
        credentialId: 'cred',
      });
    });

    it('他人のものや無いものは 404 not_found にする', async () => {
      const h = createApp();
      h.deps.deletePasskeyUseCase.run.mockResolvedValueOnce(
        RA.err(PasskeyCredentialNotFoundError.create('cred')) as never,
      );

      const response = await request(h, 'DELETE', '/credentials/cred');

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: 'not_found' });
    });
  });
});
