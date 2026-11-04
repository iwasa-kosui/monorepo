import { RA } from '@iwasa-kosui/result';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { SessionId } from '../../../domain/session/sessionId.ts';
import { UnacceptableUsernameError, UsernameAlreadyTakenError } from '../../../domain/user/user.ts';
import { Username } from '../../../domain/user/username.ts';
import { createWorkerAuthFormRouter, type WorkerAuthFormRouterDeps } from '../workerAuthFormRouter.ts';

const ORIGIN = 'https://blog.test';
const PASSWORD = 'a-secure-password-with-16-characters';
const AUTHORIZE_NEXT = '/oauth/authorize?client_id=a&state=b';

const createApp = (overrides: Partial<WorkerAuthFormRouterDeps> = {}) => {
  const signInUseCase = { run: vi.fn(async () => RA.ok({ sessionId: SessionId.generate() })) };
  const signUpUseCase = { run: vi.fn(async () => RA.ok({ user: { username: Username.orThrow('kosui') } })) };
  const app = new Hono().route(
    '/auth',
    createWorkerAuthFormRouter({
      signInUseCase,
      signUpUseCase,
      createContext: () => ({}) as never,
      ...overrides,
    } as WorkerAuthFormRouterDeps),
  );
  return { app, signInUseCase, signUpUseCase };
};

const post = (
  app: Hono,
  path: string,
  fields: Record<string, string>,
  headers: Record<string, string> = { Origin: ORIGIN },
) =>
  app.request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams(fields),
  });

describe('createWorkerAuthFormRouter', () => {
  describe.each(['/auth/sign-in', '/auth/sign-up'])('POST %s の同一オリジン検査', (path) => {
    const fields = { username: 'kosui', password: PASSWORD };

    it('Origin が違うと 403 にする', async () => {
      const { app, signInUseCase, signUpUseCase } = createApp();

      const response = await post(app, path, fields, { Origin: 'https://evil.example' });

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({ error: 'Forbidden' });
      expect(signInUseCase.run).not.toHaveBeenCalled();
      expect(signUpUseCase.run).not.toHaveBeenCalled();
    });

    it('Origin も Sec-Fetch-Site も無いと 403 にする', async () => {
      const { app } = createApp();

      const response = await post(app, path, fields, {});

      expect(response.status).toBe(403);
    });

    it('Origin が無くても Sec-Fetch-Site が same-origin なら受け付ける', async () => {
      const { app } = createApp();

      const response = await post(app, path, fields, { 'Sec-Fetch-Site': 'same-origin' });

      expect(response.status).toBe(303);
    });
  });

  describe('POST /auth/sign-in', () => {
    it('成功するとセッション Cookie を発行して / へ 303 にする', async () => {
      const { app, signInUseCase } = createApp();

      const response = await post(app, '/auth/sign-in', { username: 'kosui', password: PASSWORD });

      expect(response.status).toBe(303);
      expect(response.headers.get('Location')).toBe('/');
      const cookie = response.headers.get('Set-Cookie') ?? '';
      expect(cookie).toContain('sessionId=');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Secure');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain('Path=/');
      expect(cookie).toContain('Max-Age=604800');
      expect(signInUseCase.run).toHaveBeenCalledTimes(1);
    });

    it('/oauth/authorize への next へ 303 にする', async () => {
      const { app } = createApp();

      const response = await post(app, '/auth/sign-in', {
        username: 'kosui',
        password: PASSWORD,
        next: AUTHORIZE_NEXT,
      });

      expect(response.status).toBe(303);
      expect(response.headers.get('Location')).toBe(AUTHORIZE_NEXT);
    });

    it.each([
      '/home',
      '//evil.example',
      'https://evil.example/oauth/authorize',
      `${ORIGIN.replace('blog', 'other')}/oauth/authorize?client_id=a`,
    ])('next が %s のときは / へ 303 にする', async (next) => {
      const { app } = createApp();

      const response = await post(app, '/auth/sign-in', { username: 'kosui', password: PASSWORD, next });

      expect(response.status).toBe(303);
      expect(response.headers.get('Location')).toBe('/');
    });

    it('認証に失敗すると invalid_credentials で /sign-in へ 303 にし、Cookie を発行しない', async () => {
      const { app } = createApp({
        signInUseCase: {
          run: vi.fn(async () =>
            RA.err({ type: 'UsernameOrPasswordInvalid', message: 'invalid', detail: { username: 'kosui' } })
          ),
        },
      } as never);

      const response = await post(app, '/auth/sign-in', { username: 'kosui', password: PASSWORD });

      expect(response.status).toBe(303);
      expect(response.headers.get('Location')).toBe('/sign-in?error=invalid_credentials');
      expect(response.headers.get('Set-Cookie')).toBeNull();
    });

    it('認証に失敗しても有効な next を残す', async () => {
      const { app } = createApp({
        signInUseCase: {
          run: vi.fn(async () =>
            RA.err({ type: 'UsernameOrPasswordInvalid', message: 'invalid', detail: { username: 'kosui' } })
          ),
        },
      } as never);

      const response = await post(app, '/auth/sign-in', {
        username: 'kosui',
        password: PASSWORD,
        next: AUTHORIZE_NEXT,
      });

      expect(response.headers.get('Location')).toBe(
        `/sign-in?error=invalid_credentials&next=${encodeURIComponent(AUTHORIZE_NEXT)}`,
      );
    });

    it('短いパスワードは invalid_input で /sign-in へ 303 にし、有効な next を残す', async () => {
      const { app, signInUseCase } = createApp();

      const response = await post(app, '/auth/sign-in', {
        username: 'kosui',
        password: 'short',
        next: AUTHORIZE_NEXT,
      });

      expect(response.status).toBe(303);
      expect(response.headers.get('Location')).toBe(
        `/sign-in?error=invalid_input&next=${encodeURIComponent(AUTHORIZE_NEXT)}`,
      );
      expect(signInUseCase.run).not.toHaveBeenCalled();
    });

    it('無効な next は入力エラー時にも残さない', async () => {
      const { app } = createApp();

      const response = await post(app, '/auth/sign-in', {
        username: 'kosui',
        password: 'short',
        next: 'https://evil.example/oauth/authorize',
      });

      expect(response.headers.get('Location')).toBe('/sign-in?error=invalid_input');
    });
  });

  describe('POST /auth/sign-up', () => {
    it('成功すると /sign-in?registered=1 へ 303 にする', async () => {
      const { app, signUpUseCase } = createApp();

      const response = await post(app, '/auth/sign-up', { username: 'kosui', password: PASSWORD });

      expect(response.status).toBe(303);
      expect(response.headers.get('Location')).toBe('/sign-in?registered=1');
      expect(signUpUseCase.run).toHaveBeenCalledTimes(1);
    });

    it('短いパスワードは invalid_input で /sign-up へ 303 にする', async () => {
      const { app, signUpUseCase } = createApp();

      const response = await post(app, '/auth/sign-up', { username: 'kosui', password: 'short' });

      expect(response.status).toBe(303);
      expect(response.headers.get('Location')).toBe('/sign-up?error=invalid_input');
      expect(signUpUseCase.run).not.toHaveBeenCalled();
    });

    it('kosui 以外は username_unacceptable で /sign-up へ 303 にする', async () => {
      const { app } = createApp({
        signUpUseCase: {
          run: vi.fn(async () => RA.err(UnacceptableUsernameError.create(Username.orThrow('alice'), 'not allowed'))),
        },
      } as never);

      const response = await post(app, '/auth/sign-up', { username: 'alice', password: PASSWORD });

      expect(response.status).toBe(303);
      expect(response.headers.get('Location')).toBe('/sign-up?error=username_unacceptable');
    });

    it('重複は username_taken で /sign-up へ 303 にする', async () => {
      const { app } = createApp({
        signUpUseCase: {
          run: vi.fn(async () => RA.err(UsernameAlreadyTakenError.create(Username.orThrow('kosui')))),
        },
      } as never);

      const response = await post(app, '/auth/sign-up', { username: 'kosui', password: PASSWORD });

      expect(response.status).toBe(303);
      expect(response.headers.get('Location')).toBe('/sign-up?error=username_taken');
    });

    it('その他のエラーは failed で /sign-up へ 303 にする', async () => {
      const { app } = createApp({
        signUpUseCase: { run: vi.fn(async () => RA.err({ type: 'StoreError', message: 'boom' })) },
      } as never);

      const response = await post(app, '/auth/sign-up', { username: 'kosui', password: PASSWORD });

      expect(response.headers.get('Location')).toBe('/sign-up?error=failed');
    });
  });
});
