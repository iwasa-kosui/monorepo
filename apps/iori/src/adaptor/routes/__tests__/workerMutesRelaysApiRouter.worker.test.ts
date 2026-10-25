import { RA } from '@iwasa-kosui/result';
import { describe, expect, it } from 'vitest';

import { createIoriApp } from '../../../appFactory.tsx';
import { ActorId } from '../../../domain/actor/actorId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { MuteId } from '../../../domain/mute/muteId.ts';
import { RelayId } from '../../../domain/relay/relayId.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { createMockRequestContext } from '../../../useCase/__tests__/helper/mockAdaptors.ts';
import type { CreateMuteUseCase } from '../../../useCase/createMute.ts';
import type { DeleteMuteUseCase } from '../../../useCase/deleteMute.ts';
import type { GetMutesUseCase } from '../../../useCase/getMutes.ts';
import type { SubscribeRelayUseCase } from '../../../useCase/subscribeRelay.ts';
import { createWorkerMutesRelaysApiRouter } from '../workerMutesRelaysApiRouter.ts';

const sessionCookie = 'sessionId=4dc530d6-d06c-4b4a-a021-0e1aee0b6d82';

describe('createWorkerMutesRelaysApiRouter', () => {
  it('serves authenticated mute and relay management contracts', async () => {
    const actorId = ActorId.generate();
    const userId = UserId.generate();
    const now = Instant.orThrow(Date.parse('2026-08-05T00:00:00.000Z'));
    const mute = { muteId: MuteId.generate(), userId, mutedActorId: actorId };
    const relay = {
      relayId: RelayId.generate(),
      inboxUrl: 'https://relay.test/inbox',
      actorUri: 'https://relay.test/actor',
      status: 'pending' as const,
      createdAt: now,
      acceptedAt: null,
    };
    const getMutesUseCase: GetMutesUseCase = { run: async () => RA.ok([mute]) };
    const createMuteUseCase: CreateMuteUseCase = { run: async () => RA.ok(undefined) };
    const deleteMuteUseCase: DeleteMuteUseCase = { run: async () => RA.ok(undefined) };
    const subscribeRelayUseCase: SubscribeRelayUseCase = { run: async () => RA.ok(relay) };
    const app = createIoriApp({
      federationMiddleware: undefined,
      registerRoutes: (router) => {
        router.route(
          '/api',
          createWorkerMutesRelaysApiRouter({
            getMutesUseCase,
            createMuteUseCase,
            deleteMuteUseCase,
            subscribeRelayUseCase,
            allRelaysResolver: { resolve: async () => RA.ok([relay]) },
            createContext: () => createMockRequestContext(),
          }),
        );
      },
      serveAsset: async () => undefined,
      serveUpload: async () => undefined,
      serveOgImage: async () => new Response('not implemented', { status: 501 }),
    });

    const mutes = await app.request('https://worker.test/api/v1/mutes', { headers: { Cookie: sessionCookie } });
    const createMute = await app.request('https://worker.test/api/v1/mute', {
      method: 'POST',
      headers: { Cookie: sessionCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorId }),
    });
    const deleteMute = await app.request('https://worker.test/api/v1/mute', {
      method: 'DELETE',
      headers: { Cookie: sessionCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorId }),
    });
    const subscribeRelay = await app.request('https://worker.test/api/v1/relay', {
      method: 'POST',
      headers: { Cookie: sessionCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorUri: relay.actorUri }),
    });
    const relays = await app.request('https://worker.test/api/v1/relays', { headers: { Cookie: sessionCookie } });

    await expect(mutes.json()).resolves.toEqual({ mutes: [mute] });
    await expect(createMute.json()).resolves.toEqual({ success: true });
    await expect(deleteMute.json()).resolves.toEqual({ success: true });
    await expect(subscribeRelay.json()).resolves.toEqual({ success: true, relay });
    await expect(relays.json()).resolves.toEqual({ relays: [relay] });
  });
});
