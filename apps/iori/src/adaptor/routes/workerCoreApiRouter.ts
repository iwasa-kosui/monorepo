import type { RequestContext } from '@fedify/fedify';
import { sValidator } from '@hono/standard-validator';
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { z } from 'zod/v4';

import { Password } from '../../domain/password/password.ts';
import { SessionId } from '../../domain/session/sessionId.ts';
import { Username } from '../../domain/user/username.ts';
import type { createSignUpUseCase } from '../../useCase/signUp.ts';
import type { SubscribePushUseCase } from '../../useCase/subscribePush.ts';
import type { UnsubscribePushUseCase } from '../../useCase/unsubscribePush.ts';

export type WorkerCoreApiRouterDeps = Readonly<{
  signUpUseCase: ReturnType<typeof createSignUpUseCase>;
  subscribePushUseCase: SubscribePushUseCase;
  unsubscribePushUseCase: UnsubscribePushUseCase;
  vapidPublicKey: string | undefined;
  createContext: (request: Request) => RequestContext<unknown>;
}>;

const sessionFrom = (cookie: string | undefined): SessionId | undefined => {
  const result = SessionId.parse(cookie);
  return result.ok ? result.val : undefined;
};

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

  app.post(
    '/v1/push/subscribe',
    sValidator(
      'json',
      z.object({
        endpoint: z.url(),
        keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
      }),
    ),
    async (c) => {
      const sessionId = sessionFrom(getCookie(c, 'sessionId'));
      if (sessionId === undefined) return c.json({ error: 'Unauthorized' }, 401);
      const body = c.req.valid('json');
      const result = await deps.subscribePushUseCase.run({
        sessionId,
        endpoint: body.endpoint,
        p256dhKey: body.keys.p256dh,
        authKey: body.keys.auth,
      });
      return result.ok ? c.json({ success: true }) : c.json({ error: result.err.message }, 400);
    },
  );

  app.delete(
    '/v1/push/subscribe',
    sValidator('json', z.object({ endpoint: z.url() })),
    async (c) => {
      const sessionId = sessionFrom(getCookie(c, 'sessionId'));
      if (sessionId === undefined) return c.json({ error: 'Unauthorized' }, 401);
      const result = await deps.unsubscribePushUseCase.run({
        sessionId,
        endpoint: c.req.valid('json').endpoint,
      });
      return result.ok ? c.json({ success: true }) : c.json({ error: result.err.message }, 400);
    },
  );

  return app;
};
