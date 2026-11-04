import {
  createFederation,
  detachSignature,
  generateCryptoKeyPair,
  MemoryKvStore,
  signRequest,
  verifyObject,
} from '@fedify/fedify';
import { Activity, CryptographicKey, Follow, Person } from '@fedify/vocab';
import { getDocumentLoader } from '@fedify/vocab-runtime';
import { RA } from '@iwasa-kosui/result';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createActorDispatcher } from '../actorDispatcherFactory.ts';
import { INSTANCE_ACTOR_IDENTIFIER } from '../sharedKeyDispatcher.ts';
import { createOnFollow } from './onFollow.ts';

const ORIGIN = 'https://iori.example';
const REMOTE_ACTOR = 'https://remote.example/users/alice';
const REMOTE_KEY = `${REMOTE_ACTOR}#main-key`;
const REMOTE_INBOX = `${REMOTE_ACTOR}/inbox`;

describe('createOnFollow', () => {
  const fetchMock = vi.fn<(request: Request) => Promise<Response>>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('instance actor を対象にした Follow へ、instance actor の鍵で proof をつけた Accept を返す', async () => {
    const contextLoader = getDocumentLoader();
    const remoteKeyPair = await generateCryptoKeyPair('RSASSA-PKCS1-v1_5');
    const rsa = await generateCryptoKeyPair('RSASSA-PKCS1-v1_5');
    const ed25519 = await generateCryptoKeyPair('Ed25519');
    const remoteActor = new Person({
      id: new URL(REMOTE_ACTOR),
      preferredUsername: 'alice',
      inbox: new URL(REMOTE_INBOX),
      publicKey: new CryptographicKey({
        id: new URL(REMOTE_KEY),
        owner: new URL(REMOTE_ACTOR),
        publicKey: remoteKeyPair.publicKey,
      }),
    });
    const remoteActorDocument = await remoteActor.toJsonLd({ format: 'compact', contextLoader });
    const federation = createFederation<void>({
      kv: new MemoryKvStore(),
      origin: ORIGIN,
      firstKnock: 'draft-cavage-http-signatures-12',
      allowPrivateAddress: true,
    });
    fetchMock.mockImplementation(async (request) => {
      if (request.method === 'POST' && request.url === REMOTE_INBOX) return new Response(null, { status: 202 });
      if (request.method === 'GET' && request.url.startsWith(REMOTE_ACTOR)) {
        return new Response(JSON.stringify(remoteActorDocument), {
          headers: { 'Content-Type': 'application/activity+json' },
        });
      }
      throw new Error(`unexpected request: ${request.method} ${request.url}`);
    });
    const actorDispatcher = createActorDispatcher({
      userResolverByUsername: { resolve: async () => RA.ok(undefined) },
      actorResolverByUserId: { resolve: async () => RA.ok(undefined) },
    });
    federation
      .setActorDispatcher('/users/{identifier}', actorDispatcher.dispatch)
      .setKeyPairsDispatcher(async () => [rsa, ed25519]);
    federation.setOutboxDispatcher('/users/{identifier}/outbox', () => ({ items: [] }));
    federation.setFollowersDispatcher('/users/{identifier}/followers', () => ({ items: [] }));
    const run = vi.fn(async () => RA.err(new Error('User not found')));
    federation
      .setInboxListeners('/users/{identifier}/inbox', '/inbox')
      .on(
        Follow,
        createOnFollow({
          inboxActorResolver: {
            resolve: async () =>
              RA.ok({
                actor: remoteActor,
                actorIdentity: { uri: REMOTE_ACTOR, inboxUrl: REMOTE_INBOX, url: undefined, username: 'alice' },
                documentLoaderOptions: {},
              }),
          },
          acceptFollowRequestUseCase: { run } as never,
        }),
      );
    const instanceActorUri = `${ORIGIN}/users/${INSTANCE_ACTOR_IDENTIFIER}`;
    const follow = new Follow({
      id: new URL('https://remote.example/activities/follow-1'),
      actor: new URL(REMOTE_ACTOR),
      object: new URL(instanceActorUri),
    });
    const unsigned = new Request(`${ORIGIN}/inbox`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/activity+json' },
      body: JSON.stringify(await follow.toJsonLd({ format: 'compact', contextLoader })),
    });

    const response = await federation.fetch(
      await signRequest(unsigned, remoteKeyPair.privateKey, new URL(REMOTE_KEY)),
      { contextData: undefined },
    );

    expect(response.status).toBe(202);
    expect(run).toHaveBeenCalledOnce();
    const deliveries = fetchMock.mock.calls.map(([request]) => request).filter((request) => request.method === 'POST');
    expect(deliveries).toHaveLength(1);
    const accept = deliveries[0];
    expect(accept.url).toBe(REMOTE_INBOX);
    const sent = JSON.parse(await accept.clone().text()) as Record<string, unknown>;
    expect(sent).toMatchObject({ type: 'Accept', actor: instanceActorUri });
    const actorResponse = await federation.fetch(
      new Request(instanceActorUri, { headers: { Accept: 'application/activity+json' } }),
      { contextData: undefined },
    );
    expect(actorResponse.status).toBe(200);
    const actorDocument = await actorResponse.json();
    const documentLoader = async (url: string) => {
      if (!url.startsWith(instanceActorUri)) throw new Error(`unexpected document: ${url}`);
      return { contextUrl: null, document: actorDocument, documentUrl: url };
    };

    expect(sent.proof).toBeDefined();
    expect(await verifyObject(Activity, detachSignature(sent), { documentLoader })).not.toBeNull();
  });
});
