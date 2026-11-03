import {
  Activity,
  Application,
  Create,
  createFederation,
  detachSignature,
  generateCryptoKeyPair,
  MemoryKvStore,
  Note,
  PUBLIC_COLLECTION,
  type RequestContext,
  verifyJsonLd,
  verifyObject,
  verifyRequest,
} from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { INSTANCE_ACTOR_IDENTIFIER } from '../../adaptor/fedify/sharedKeyDispatcher.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { Relay } from '../../domain/relay/relay.ts';
import { RelayId } from '../../domain/relay/relayId.ts';
import { SubscribeRelayUseCase } from '../subscribeRelay.ts';
import { UnsubscribeRelayUseCase } from '../unsubscribeRelay.ts';

const PUBLIC_IRI = 'https://www.w3.org/ns/activitystreams#Public';
const ORIGIN = 'https://iori.example';
const RELAY_ACTOR_URI = 'https://relay.example/actor';
const RELAY_INBOX_URL = 'https://relay.example/inbox';

const setup = async () => {
  const rsa = await generateCryptoKeyPair('RSASSA-PKCS1-v1_5');
  const ed25519 = await generateCryptoKeyPair('Ed25519');
  const federation = createFederation<unknown>({
    kv: new MemoryKvStore(),
    origin: ORIGIN,
    firstKnock: 'draft-cavage-http-signatures-12',
  });
  federation
    .setActorDispatcher('/users/{identifier}', (ctx, identifier) =>
      identifier === INSTANCE_ACTOR_IDENTIFIER
        ? new Application({ id: ctx.getActorUri(identifier), preferredUsername: identifier })
        : null)
    .setKeyPairsDispatcher(async () => [rsa, ed25519]);
  const ctx: RequestContext<unknown> = federation.createContext(new Request(`${ORIGIN}/`), undefined);
  const keyPairs = await ctx.getActorKeyPairs(INSTANCE_ACTOR_IDENTIFIER);
  const publicKeys = new Map<string, unknown>();
  for (const keyPair of keyPairs) {
    const key = keyPair.privateKey.algorithm.name === 'Ed25519' ? keyPair.multikey : keyPair.cryptographicKey;
    if (key.id) publicKeys.set(key.id.href, key);
  }
  const keyCache = {
    get: async (keyId: URL) => (publicKeys.get(keyId.href) ?? undefined) as never,
    set: async () => {},
  };
  return { ctx, keyCache };
};

const createRelay = () =>
  Relay.requestSubscription({
    relayId: RelayId.generate(),
    inboxUrl: RELAY_INBOX_URL,
    actorUri: RELAY_ACTOR_URI,
    createdAt: Instant.now(),
  }, Instant.now()).aggregateState;

const sha256Base64 = async (body: string) =>
  Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body))).toString('base64');

describe('relay への送信', () => {
  const fetchMock = vi.fn<(request: Request) => Promise<Response>>();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (request) => {
      if (request.url !== RELAY_INBOX_URL) {
        throw new Error(`unexpected request: ${request.url}`);
      }
      return new Response(null, { status: 202 });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const sentRequest = async () => {
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0][0];
    const body = await request.clone().text();
    return { request, body, json: JSON.parse(body) as Record<string, unknown> };
  };

  const expectSignaturesCover = async (
    { request, body, json }: Awaited<ReturnType<typeof sentRequest>>,
    keyCache: Awaited<ReturnType<typeof setup>>['keyCache'],
  ) => {
    expect(json.proof).toBeDefined();
    expect(json.signature).toBeDefined();
    expect(await verifyJsonLd(json, { keyCache })).toBe(true);
    expect(await verifyObject(Activity, detachSignature(json), { keyCache })).not.toBeNull();
    expect(
      await verifyObject(Activity, {
        ...(detachSignature(json) as Record<string, unknown>),
        id: 'https://iori.example/#tampered',
      }, { keyCache }),
    )
      .toBeNull();
    expect(request.headers.get('Digest')).toBe(`SHA-256=${await sha256Base64(body)}`);
    expect(request.headers.get('Signature')).toContain('keyId=');
    expect(await verifyRequest(request.clone(), { keyCache })).not.toBeNull();
  };

  it('Follow の object と to が完全な IRI で、proof と署名が送った JSON を覆う', async () => {
    const { ctx, keyCache } = await setup();
    const useCase = SubscribeRelayUseCase.create({
      relayResolverByActorUri: { resolve: vi.fn(async () => RA.ok(createRelay())) } as never,
      relaySubscriptionRequestedStore: { store: vi.fn() } as never,
    });

    await useCase.run({ relayActorUri: RELAY_ACTOR_URI, ctx });

    const sent = await sentRequest();
    expect(sent.json).toMatchObject({
      type: 'Follow',
      actor: `${ORIGIN}/users/${INSTANCE_ACTOR_IDENTIFIER}`,
      object: PUBLIC_IRI,
      to: PUBLIC_IRI,
    });
    expect(sent.json.id).toMatch(new RegExp(`^${ORIGIN}/#RelayFollow/[0-9a-f-]{36}$`));
    expect({ ...sent.json, proof: undefined, signature: undefined, id: undefined }).toEqual({
      '@context': sent.json['@context'],
      type: 'Follow',
      actor: `${ORIGIN}/users/${INSTANCE_ACTOR_IDENTIFIER}`,
      object: PUBLIC_IRI,
      to: PUBLIC_IRI,
    });
    await expectSignaturesCover(sent, keyCache);
    expect(
      await verifyObject(
        Activity,
        { ...(detachSignature(sent.json) as Record<string, unknown>), object: 'as:Public' },
        { keyCache },
      ),
    )
      .toBeNull();
  });

  it('Undo Follow を送っても、proof と署名が送った JSON を覆う', async () => {
    const { ctx, keyCache } = await setup();
    const relay = createRelay();
    const useCase = UnsubscribeRelayUseCase.create({
      relayResolver: { resolve: vi.fn(async () => RA.ok(relay)) } as never,
      relayUnsubscribedStore: { store: vi.fn(async () => RA.ok(undefined)) } as never,
    });

    await useCase.run({ relayId: relay.relayId, ctx });

    const sent = await sentRequest();
    expect(sent.json).toMatchObject({
      type: 'Undo',
      actor: `${ORIGIN}/users/${INSTANCE_ACTOR_IDENTIFIER}`,
      object: { type: 'Follow', object: RELAY_ACTOR_URI },
      to: RELAY_ACTOR_URI,
    });
    await expectSignaturesCover(sent, keyCache);
  });

  it('投稿の Create の to は従来どおり as:Public のまま', async () => {
    const { ctx, keyCache } = await setup();
    const actor = ctx.getActorUri(INSTANCE_ACTOR_IDENTIFIER);
    const keys = await ctx.getActorKeyPairs(INSTANCE_ACTOR_IDENTIFIER);

    await ctx.sendActivity(
      keys,
      { id: new URL(RELAY_ACTOR_URI), inboxId: new URL(RELAY_INBOX_URL) },
      new Create({
        id: new URL(`${ORIGIN}/users/${INSTANCE_ACTOR_IDENTIFIER}/posts/1/activity`),
        actor,
        to: PUBLIC_COLLECTION,
        object: new Note({
          id: new URL(`${ORIGIN}/users/${INSTANCE_ACTOR_IDENTIFIER}/posts/1`),
          attribution: actor,
          to: PUBLIC_COLLECTION,
          content: 'hello',
        }),
      }),
    );

    const sent = await sentRequest();
    expect(sent.json.to).toBe('as:Public');
    expect(sent.json.object).toMatchObject({ type: 'Note', to: 'as:Public' });
    await expectSignaturesCover(sent, keyCache);
  });
});
