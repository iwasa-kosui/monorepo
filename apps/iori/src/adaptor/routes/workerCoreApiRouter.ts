import { Hono } from 'hono';

export type WorkerCoreApiRouterDeps = Readonly<{
  vapidPublicKey: string | undefined;
}>;

export const createWorkerCoreApiRouter = (deps: WorkerCoreApiRouterDeps): Hono => {
  const app = new Hono();

  app.get('/v1/push/vapid-public-key', (c) =>
    deps.vapidPublicKey === undefined
      ? c.json({ error: 'Push is not configured' }, 503)
      : c.json({ publicKey: deps.vapidPublicKey }));

  return app;
};
