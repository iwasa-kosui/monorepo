import type { Context } from 'hono';
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';

const notFound = (c: Context) => {
  if (c.req.header('Authorization') !== undefined || getCookie(c, 'sessionId') !== undefined) {
    console.warn(`Unimplemented Mastodon API: ${c.req.method} ${c.req.path}`);
  }
  return c.json({ error: 'Record not found' }, 404);
};

export const createWorkerMastodonFallbackRouter = (): Hono => new Hono().all('/v1/*', notFound).all('/v2/*', notFound);
