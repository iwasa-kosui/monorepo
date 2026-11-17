import { Hono } from 'hono';

import type { ActorIdResolverByAcct } from '../../domain/actor/accountRelationship.ts';
import { parseAcct } from '../../domain/actor/acct.ts';

type Dependencies = Readonly<{
  actorIdResolverByAcct: ActorIdResolverByAcct;
}>;

/**
 * `/@alice` と `/@alice@remote.example` を、そのアクターのプロフィールページへ転送する。
 * リモートのアクターは、このサーバーがすでに知っているものだけを転送する。
 */
export const createWorkerActorHandleRouter = ({ actorIdResolverByAcct }: Dependencies): Hono => {
  const app = new Hono();
  app.on('GET', ['/:handle{@[^/]+}', '/:handle{@[^/]+}/'], async (c) => {
    const url = new URL(c.req.url);
    const lookup = parseAcct(c.req.param('handle'), url.host);
    if (lookup === undefined) return c.notFound();
    const actorId = await actorIdResolverByAcct.resolve(lookup);
    if (!actorId.ok || actorId.val === undefined) return c.notFound();
    const pathname = lookup.type === 'local'
      ? `/users/${encodeURIComponent(lookup.username)}`
      : `/remote-users/${actorId.val}`;
    return c.redirect(`${pathname}${url.search}`);
  });
  return app;
};
