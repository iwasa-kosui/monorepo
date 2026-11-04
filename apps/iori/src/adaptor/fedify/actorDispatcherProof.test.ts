import { createFederation, detachSignature, generateCryptoKeyPair, MemoryKvStore, verifyObject } from '@fedify/fedify';
import { Activity, Follow } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActorId } from '../../domain/actor/actorId.ts';
import { UserId } from '../../domain/user/userId.ts';
import { Username } from '../../domain/user/username.ts';
import { createActorDispatcher } from './actorDispatcherFactory.ts';

const ORIGIN = 'https://iori.example';
const REMOTE_INBOX = 'https://remote.example/inbox';

describe('ユーザーの actor が送る活動の proof', () => {
  const fetchMock = vi.fn<(request: Request) => Promise<Response>>();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('actor 文書の assertionMethods から鍵を取得して検証できる', async () => {
    const rsa = await generateCryptoKeyPair('RSASSA-PKCS1-v1_5');
    const ed25519 = await generateCryptoKeyPair('Ed25519');
    const userId = UserId.generate();
    const actorId = ActorId.generate();
    const actorDispatcher = createActorDispatcher({
      userResolverByUsername: { resolve: async () => RA.ok({ id: userId, username: Username.orThrow('kosui') }) },
      actorResolverByUserId: {
        resolve: async () =>
          RA.ok({
            id: actorId,
            userId,
            type: 'local' as const,
            uri: `${ORIGIN}/users/kosui`,
            inboxUrl: `${ORIGIN}/users/kosui/inbox`,
          }),
      },
    });
    const federation = createFederation<void>({
      kv: new MemoryKvStore(),
      origin: ORIGIN,
      firstKnock: 'draft-cavage-http-signatures-12',
      allowPrivateAddress: true,
    });
    federation
      .setActorDispatcher('/users/{identifier}', actorDispatcher.dispatch)
      .setKeyPairsDispatcher(async () => [rsa, ed25519]);
    federation.setInboxListeners('/users/{identifier}/inbox', '/inbox');
    federation.setOutboxDispatcher('/users/{identifier}/outbox', () => ({ items: [] }));
    federation.setFollowersDispatcher('/users/{identifier}/followers', () => ({ items: [] }));
    const ctx = federation.createContext(new Request(`${ORIGIN}/`), undefined);
    const actorUri = ctx.getActorUri('kosui');

    await ctx.sendActivity(
      { identifier: 'kosui' },
      { id: new URL('https://remote.example/users/bob'), inboxId: new URL(REMOTE_INBOX) },
      new Follow({
        id: new URL(`${ORIGIN}/activities/follow-1`),
        actor: actorUri,
        object: new URL('https://remote.example/users/bob'),
        to: new URL('https://remote.example/users/bob'),
      }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(await fetchMock.mock.calls[0][0].clone().text()) as Record<string, unknown>;
    expect(sent.proof).toBeDefined();
    const actorResponse = await federation.fetch(
      new Request(actorUri, { headers: { Accept: 'application/activity+json' } }),
      { contextData: undefined },
    );
    expect(actorResponse.status).toBe(200);
    const actorDocument = await actorResponse.json();
    const documentLoader = async (url: string) => {
      if (!url.startsWith(actorUri.href)) throw new Error(`unexpected document: ${url}`);
      return { contextUrl: null, document: actorDocument, documentUrl: url };
    };

    expect(await verifyObject(Activity, detachSignature(sent), { documentLoader })).not.toBeNull();
  });
});
