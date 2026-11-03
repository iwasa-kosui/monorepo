import { sValidator } from '@hono/standard-validator';
import { Hono } from 'hono';
import { z } from 'zod/v4';

export const createWorkerRemoteFollowRedirectRouter = (): Hono => {
  const app = new Hono();
  app.post(
    '/:username/remote-follow',
    sValidator('form', z.object({ handle: z.string().min(1) })),
    async (c) => {
      const match = c.req.valid('form').handle.match(/@?[^@]+@([^@]+)/);
      if (match === null) return c.text('Invalid handle format. Use @user@server.example', 400);
      const targetUri = new URL(`/users/${c.req.param('username')}`, c.req.url).href;
      return c.redirect(`https://${match[1]}/authorize_interaction?uri=${encodeURIComponent(targetUri)}`);
    },
  );
  return app;
};
