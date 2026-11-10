import { Hono } from 'hono';

import type { IoriAppAdapters } from './runtime/ioriRuntime.ts';

export const createIoriApp = (adapters: IoriAppAdapters): Hono => {
  const app = new Hono();

  if (adapters.federationMiddleware !== undefined) {
    app.use(adapters.federationMiddleware);
  }

  app.get('/healthz', (c) => c.json({ ok: true, service: 'iori' }));
  app.get('/health', (c) => c.text('OK'));

  app.get('/uploads/:filename', async (c) => {
    const response = await adapters.serveUpload(c.req.param('filename'));
    return response ?? c.notFound();
  });

  adapters.registerRoutes?.(app);

  app.get('/api/og/*', (c) => adapters.serveOgImage(c.req.raw));

  app.all('*', async (c) => {
    const asset = await adapters.serveAsset(c.req.raw);
    if (asset !== undefined) {
      return asset;
    }
    const page = await adapters.servePage?.(c.req.raw);
    return page ?? c.notFound();
  });

  return app;
};
