import type { RequestContext } from '@fedify/fedify';
import { sValidator } from '@hono/standard-validator';
import { Hono } from 'hono';
import { z } from 'zod/v4';

import { Password } from '../../domain/password/password.ts';
import { Username } from '../../domain/user/username.ts';
import type { createSignUpUseCase } from '../../useCase/signUp.ts';

export type WorkerCoreApiRouterDeps = Readonly<{
  signUpUseCase: ReturnType<typeof createSignUpUseCase>;
  vapidPublicKey: string | undefined;
  createContext: (request: Request) => RequestContext<unknown>;
}>;

export const createWorkerCoreApiRouter = (deps: WorkerCoreApiRouterDeps): Hono => {
  const app = new Hono();

  app.post(
    '/v1/sign-up',
    sValidator('json', z.object({ username: Username.zodType, password: Password.zodType })),
    async (c) => {
      const result = await deps.signUpUseCase.run({
        ...c.req.valid('json'),
        ctx: deps.createContext(c.req.raw),
      });
      return result.ok
        ? c.json({ success: true, username: result.val.user.username })
        : c.json({ error: result.err.message }, 400);
    },
  );

  app.get('/v1/push/vapid-public-key', (c) =>
    deps.vapidPublicKey === undefined
      ? c.json({ error: 'Push is not configured' }, 503)
      : c.json({ publicKey: deps.vapidPublicKey }));

  return app;
};
