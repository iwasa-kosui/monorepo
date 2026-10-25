import type { RequestContext } from '@fedify/fedify';
import { sValidator } from '@hono/standard-validator';
import { RA } from '@iwasa-kosui/result';
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { z } from 'zod/v4';

import { ActorId } from '../../domain/actor/actorId.ts';
import type { AllRelaysResolver } from '../../domain/relay/relay.ts';
import { SessionId } from '../../domain/session/sessionId.ts';
import type { CreateMuteUseCase } from '../../useCase/createMute.ts';
import type { DeleteMuteUseCase } from '../../useCase/deleteMute.ts';
import type { GetMutesUseCase } from '../../useCase/getMutes.ts';
import type { SubscribeRelayUseCase } from '../../useCase/subscribeRelay.ts';

export type WorkerMutesRelaysApiRouterDeps = Readonly<{
  getMutesUseCase: GetMutesUseCase;
  createMuteUseCase: CreateMuteUseCase;
  deleteMuteUseCase: DeleteMuteUseCase;
  subscribeRelayUseCase: SubscribeRelayUseCase;
  allRelaysResolver: AllRelaysResolver;
  createContext: (request: Request) => RequestContext<unknown>;
}>;

const muteSchema = z.object({ actorId: ActorId.zodType });

export const createWorkerMutesRelaysApiRouter = (
  deps: WorkerMutesRelaysApiRouterDeps,
): Hono =>
  new Hono()
    .get('/v1/mutes', async (c) => {
      const sessionId = SessionId.parse(getCookie(c, 'sessionId'));
      if (!sessionId.ok) return c.json({ error: getCookie(c, 'sessionId') ? 'Invalid session' : 'Unauthorized' }, 401);
      return RA.match({
        ok: (mutes) => c.json({ mutes }),
        err: (err) => c.json({ error: `Failed to get mutes: ${JSON.stringify(err)}` }, 400),
      })(await deps.getMutesUseCase.run({ sessionId: sessionId.val }));
    })
    .post('/v1/mute', sValidator('json', muteSchema), async (c) => {
      const sessionId = SessionId.parse(getCookie(c, 'sessionId'));
      if (!sessionId.ok) return c.json({ error: 'Invalid session' }, 401);
      return RA.match({
        ok: () => c.json({ success: true }),
        err: (err) => c.json({ error: `Failed to mute: ${JSON.stringify(err)}` }, 400),
      })(
        await deps.createMuteUseCase.run({
          sessionId: sessionId.val,
          mutedActorId: c.req.valid('json').actorId,
        }),
      );
    })
    .delete('/v1/mute', sValidator('json', muteSchema), async (c) => {
      const sessionId = SessionId.parse(getCookie(c, 'sessionId'));
      if (!sessionId.ok) return c.json({ error: 'Invalid session' }, 401);
      return RA.match({
        ok: () => c.json({ success: true }),
        err: (err) => c.json({ error: `Failed to unmute: ${JSON.stringify(err)}` }, 400),
      })(
        await deps.deleteMuteUseCase.run({
          sessionId: sessionId.val,
          mutedActorId: c.req.valid('json').actorId,
        }),
      );
    })
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
