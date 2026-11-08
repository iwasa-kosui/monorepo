import type { Context } from 'hono';

import { isSameOriginRequest, type MastodonAuthEnv } from '../mastodonAuthn.ts';

export const requireSameOriginForCookie = async (c: Context<MastodonAuthEnv>, next: () => Promise<void>) => {
  if (c.req.header('Authorization') === undefined && !isSameOriginRequest(c.req.raw)) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  await next();
};
