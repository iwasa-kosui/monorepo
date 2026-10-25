import type { Context } from '@fedify/fedify';
import { sValidator } from '@hono/standard-validator';
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { z } from 'zod/v4';

import { ActorId } from '../../domain/actor/actorId.ts';
import { SessionId } from '../../domain/session/sessionId.ts';
import type { WorkerRemoteActorAction } from '../../runtime/ports.ts';

export type WorkerPageActionsRouterDeps = Readonly<{
  followRemoteActor: WorkerRemoteActorAction;
  unfollowRemoteActor: WorkerRemoteActorAction;
  createContext: (request: Request) => Context<unknown>;
}>;

const sessionFrom = (cookie: string | undefined): SessionId | undefined => {
  const parsed = SessionId.parse(cookie);
  return parsed.ok ? parsed.val : undefined;
};

export const createWorkerPageActionsRouter = (deps: WorkerPageActionsRouterDeps): Hono => {
  const app = new Hono();

  for (
    const [path, action] of [
      ['/:actorId/follow', deps.followRemoteActor],
      ['/:actorId/unfollow', deps.unfollowRemoteActor],
    ] as const
  ) {
    app.post(
      path,
      sValidator('param', z.object({ actorId: ActorId.zodType })),
      async (c) => {
        const sessionId = sessionFrom(getCookie(c, 'sessionId'));
        if (sessionId === undefined) return c.redirect('/sign-in');
        const actorId = c.req.valid('param').actorId;
        const result = await action({
          sessionId,
          actorId,
          ctx: deps.createContext(c.req.raw),
        });
        return result.ok
          ? c.redirect(`/remote-users/${actorId}`)
          : c.json({ error: result.err.message }, 400);
      },
    );
  }

  return app;
};

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
