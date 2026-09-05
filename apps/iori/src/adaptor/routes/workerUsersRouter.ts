import { sValidator } from '@hono/standard-validator';
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { z } from 'zod/v4';

import { SessionId } from '../../domain/session/sessionId.ts';
import { Username } from '../../domain/user/username.ts';

export type WorkerUsersRouterDeps = Readonly<{
  updateLogoUri: (input: Readonly<{ sessionId: SessionId; logoUri: string }>) => Promise<boolean>;
}>;

export const createWorkerUsersRouter = (deps: WorkerUsersRouterDeps): Hono => {
  const app = new Hono();

  app.post(
    '/:username',
    sValidator('param', z.object({ username: Username.zodType })),
    sValidator('form', z.object({ logoUri: z.string().optional() })),
    async (c) => {
      const logoUri = c.req.valid('form').logoUri?.trim() ?? '';
      if (logoUri.length === 0) return c.text('logoUri is required', 400);
      const parsedSession = SessionId.parse(getCookie(c, 'sessionId'));
      if (!parsedSession.ok) return c.redirect('/sign-in');
      const updated = await deps.updateLogoUri({ sessionId: parsedSession.val, logoUri });
      return updated
        ? c.redirect(`/users/${c.req.valid('param').username}`)
        : c.json({ error: 'Unable to update logoUri' }, 400);
    },
  );

  return app;
};
