import type { RequestContext } from '@fedify/fedify';
import { sValidator } from '@hono/standard-validator';
import { RA } from '@iwasa-kosui/result';
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { z } from 'zod/v4';

import type { AllRelaysResolver } from '../../domain/relay/relay.ts';
import { SessionId } from '../../domain/session/sessionId.ts';
import type { SubscribeRelayUseCase } from '../../useCase/subscribeRelay.ts';

export type WorkerMutesRelaysApiRouterDeps = Readonly<{
  subscribeRelayUseCase: SubscribeRelayUseCase;
  allRelaysResolver: AllRelaysResolver;
  createContext: (request: Request) => RequestContext<unknown>;
}>;

export const createWorkerMutesRelaysApiRouter = (
  deps: WorkerMutesRelaysApiRouterDeps,
): Hono =>
  new Hono()
    .post(
      '/v1/relay',
      sValidator('json', z.object({ actorUri: z.string().url() })),
      async (c) => {
        const sessionId = SessionId.parse(getCookie(c, 'sessionId'));
        if (!sessionId.ok) return c.json({ error: 'Unauthorized' }, 401);
        const result = await deps.subscribeRelayUseCase.run({
          relayActorUri: c.req.valid('json').actorUri,
          ctx: deps.createContext(c.req.raw),
        });
        return RA.match({
          ok: (relay) => c.json({ success: true, relay }),
          err: (err) => c.json({ error: `Failed to subscribe to relay: ${JSON.stringify(err)}` }, 400),
        })(result);
      },
    )
    .get('/v1/relays', async (c) => {
      const sessionId = SessionId.parse(getCookie(c, 'sessionId'));
      if (!sessionId.ok) return c.json({ error: getCookie(c, 'sessionId') ? 'Invalid session' : 'Unauthorized' }, 401);
      return RA.match({
        ok: (relays) => c.json({ relays }),
        err: () => c.json({ error: 'Failed to load relays' }, 400),
      })(await deps.allRelaysResolver.resolve());
    });
