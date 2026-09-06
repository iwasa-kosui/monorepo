import type { Context } from '@fedify/fedify';
import { sValidator } from '@hono/standard-validator';
import { RA } from '@iwasa-kosui/result';
import { Hono } from 'hono';
import { setCookie } from 'hono/cookie';
import { z } from 'zod/v4';

import { Password } from '../../domain/password/password.ts';
import { Username } from '../../domain/user/username.ts';
import { createSignInUseCase } from '../../useCase/signIn.ts';

export type WorkerAuthApiRouterDeps = Readonly<{
  signInUseCase: ReturnType<typeof createSignInUseCase>;
  createContext: (request: Request) => Context<unknown>;
}>;

export const createWorkerAuthApiRouter = ({
  signInUseCase,
  createContext,
}: WorkerAuthApiRouterDeps): Hono =>
  new Hono().post(
    '/v1/sign-in',
    sValidator(
      'json',
      z.object({
        username: Username.zodType,
        password: Password.zodType,
      }),
    ),
    async (c) => {
      const { username, password } = c.req.valid('json');
      const ctx = createContext(c.req.raw);

      return RA.flow(
        signInUseCase.run({ username, password, ctx }),
        RA.match({
          ok: ({ sessionId }) => {
            setCookie(c, 'sessionId', sessionId, {
              httpOnly: true,
              path: '/',
              maxAge: 7 * 24 * 60 * 60,
              sameSite: 'lax',
              secure: true,
            });
            return c.json({ success: true });
          },
          err: () => c.json({ error: 'Invalid username or password' }, 401),
        }),
      );
    },
  );
