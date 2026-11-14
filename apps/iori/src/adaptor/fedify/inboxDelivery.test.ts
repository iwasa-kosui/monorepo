import {
  createFederation,
  generateCryptoKeyPair,
  MemoryKvStore,
  signJsonLd,
  signObject,
  signRequest,
} from '@fedify/fedify';
import { Create, CryptographicKey, Follow, Multikey, Note, Person, PUBLIC_COLLECTION } from '@fedify/vocab';
import { getDocumentLoader } from '@fedify/vocab-runtime';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { createContextLoaderFactory } from '../../federationContext.ts';

const ORIGIN = 'https://iori.example';
const REMOTE_ACTOR = 'https://remote.example/users/alice';
const REMOTE_KEY = `${REMOTE_ACTOR}#main-key`;

let keyPair: CryptoKeyPair;

const setup = async () => {
  const remoteActor = new Person({
    id: new URL(REMOTE_ACTOR),
    preferredUsername: 'alice',
    inbox: new URL(`${REMOTE_ACTOR}/inbox`),
    publicKey: new CryptographicKey({
      id: new URL(REMOTE_KEY),
      owner: new URL(REMOTE_ACTOR),
      publicKey: keyPair.publicKey,
    }),
  });
  const contextLoader = getDocumentLoader();
  const remoteActorDocument = await remoteActor.toJsonLd({ format: 'compact', contextLoader });
  const federation = createFederation<void>({
    kv: new MemoryKvStore(),
    origin: ORIGIN,
    contextLoaderFactory: createContextLoaderFactory(),
    documentLoaderFactory: () => async (url) => {
      if (!url.startsWith(REMOTE_ACTOR)) throw new Error(`unexpected document: ${url}`);
      return { contextUrl: null, document: remoteActorDocument, documentUrl: url };
    },
  });
  const onFollow = vi.fn();
  const onCreate = vi.fn();
  federation.setActorDispatcher(
    '/users/{identifier}',
    (ctx, identifier) =>
      identifier === 'kosui' ? new Person({ id: ctx.getActorUri(identifier), preferredUsername: identifier }) : null,
  ).setKeyPairsDispatcher(async () => []);
  federation
    .setInboxListeners('/users/{identifier}/inbox', '/inbox')
    .withIdempotency('per-origin')
    .on(Follow, onFollow)
    .on(Create, onCreate);
  const deliver = async (path: string, activity: Follow | Create) => {
    const body = JSON.stringify(await activity.toJsonLd({ format: 'compact', contextLoader }));
    const unsigned = new Request(`${ORIGIN}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/activity+json' },
      body,
    });
    const signed = await signRequest(unsigned, keyPair.privateKey, new URL(REMOTE_KEY));
    return federation.fetch(signed, { contextData: undefined });
  };
  return { deliver, federation, onFollow, onCreate };
};

const follow = () =>
  new Follow({
    id: new URL('https://remote.example/activities/follow-1'),
    actor: new URL(REMOTE_ACTOR),
    object: new URL(`${ORIGIN}/users/kosui`),
  });

const create = () =>
  new Create({
    id: new URL('https://remote.example/activities/create-1'),
    actor: new URL(REMOTE_ACTOR),
    to: PUBLIC_COLLECTION,
    object: new Note({
      id: new URL('https://remote.example/notes/1'),
      attribution: new URL(REMOTE_ACTOR),
      to: PUBLIC_COLLECTION,
      content: 'hello',
    }),
  });

describe('HTTP 署名つきの活動の受信', { timeout: 30_000 }, () => {
  beforeAll(async () => {
    keyPair = await generateCryptoKeyPair('RSASSA-PKCS1-v1_5');
  }, 30_000);

  it('同じ活動が共有 inbox と個人 inbox の両方に届いても、listener は1回だけ呼ぶ', async () => {
    const { deliver, onCreate } = await setup();

    const shared = await deliver('/inbox', create());
    const personal = await deliver('/users/kosui/inbox', create());

    expect([shared.status, personal.status]).toEqual([202, 202]);
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it('同じ inbox に同じ活動が再送されても listener は1回だけ呼ぶ', async () => {
    const { deliver, onCreate } = await setup();

    await deliver('/inbox', create());
    const retried = await deliver('/inbox', create());

    expect(retried.status).toBe(202);
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it('署名のない POST は 401 で拒否して listener を呼ばない', async () => {
    const { federation, onFollow } = await setup();
    const body = JSON.stringify(await follow().toJsonLd({ format: 'compact', contextLoader: getDocumentLoader() }));

    const response = await federation.fetch(
      new Request(`${ORIGIN}/inbox`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/activity+json' },
        body,
      }),
      { contextData: undefined },
    );

    expect(response.status).toBe(401);
    expect(onFollow).not.toHaveBeenCalled();
  });
});

describe('relay が転送した活動の受信', { timeout: 30_000 }, () => {
  const RELAY_ACTOR = 'https://relay.example/actor';
  const RELAY_KEY = `${RELAY_ACTOR}#main-key`;
  const AUTHOR_PROOF_KEY = `${REMOTE_ACTOR}#ed25519-key`;
  let relayKeyPair: CryptoKeyPair;
  let authorKeyPair: CryptoKeyPair;
  let authorProofKeyPair: CryptoKeyPair;

  beforeAll(async () => {
    relayKeyPair = await generateCryptoKeyPair('RSASSA-PKCS1-v1_5');
    authorKeyPair = await generateCryptoKeyPair('RSASSA-PKCS1-v1_5');
    authorProofKeyPair = await generateCryptoKeyPair('Ed25519');
  }, 30_000);

  const setupRelay = async () => {
    const contextLoader = getDocumentLoader();
    const relayActor = new Person({
      id: new URL(RELAY_ACTOR),
      preferredUsername: 'relay',
      inbox: new URL('https://relay.example/inbox'),
      publicKey: new CryptographicKey({
        id: new URL(RELAY_KEY),
        owner: new URL(RELAY_ACTOR),
        publicKey: relayKeyPair.publicKey,
      }),
    });
    const authorActor = new Person({
      id: new URL(REMOTE_ACTOR),
      preferredUsername: 'alice',
      inbox: new URL(`${REMOTE_ACTOR}/inbox`),
      publicKey: new CryptographicKey({
        id: new URL(REMOTE_KEY),
        owner: new URL(REMOTE_ACTOR),
        publicKey: authorKeyPair.publicKey,
      }),
      assertionMethods: [
        new Multikey({
          id: new URL(AUTHOR_PROOF_KEY),
          controller: new URL(REMOTE_ACTOR),
          publicKey: authorProofKeyPair.publicKey,
        }),
      ],
    });
    const documents = new Map<string, unknown>([
      [RELAY_ACTOR, await relayActor.toJsonLd({ format: 'compact', contextLoader })],
      [REMOTE_ACTOR, await authorActor.toJsonLd({ format: 'compact', contextLoader })],
    ]);
    const federation = createFederation<void>({
      kv: new MemoryKvStore(),
      origin: ORIGIN,
      contextLoaderFactory: createContextLoaderFactory(),
      documentLoaderFactory: () => async (url) => {
        const document = documents.get(url.split('#')[0] ?? url);
        if (document === undefined) throw new Error(`unexpected document: ${url}`);
        return { contextUrl: null, document, documentUrl: url };
      },
    });
    const onCreate = vi.fn();
    federation.setActorDispatcher(
      '/users/{identifier}',
      (ctx, identifier) =>
        identifier === 'kosui' ? new Person({ id: ctx.getActorUri(identifier), preferredUsername: identifier }) : null,
    ).setKeyPairsDispatcher(async () => []);
    federation
      .setInboxListeners('/users/{identifier}/inbox', '/inbox')
      .withIdempotency('per-origin')
      .on(Create, onCreate);
    const forward = async (body: unknown) => {
      const unsigned = new Request(`${ORIGIN}/inbox`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/activity+json' },
        body: JSON.stringify(body),
      });
      const signed = await signRequest(unsigned, relayKeyPair.privateKey, new URL(RELAY_KEY));
      return federation.fetch(signed, { contextData: undefined });
    };
    return { authorKeyPair, authorProofKeyPair, contextLoader, forward, onCreate };
  };

  it('relay が HTTP 署名し、投稿者の LD 署名がついた Create を 202 で受け付けて listener を呼ぶ', async () => {
    const { authorKeyPair, contextLoader, forward, onCreate } = await setupRelay();
    const jsonLd = await create().toJsonLd({ format: 'compact', contextLoader });
    const signed = await signJsonLd(jsonLd, authorKeyPair.privateKey, new URL(REMOTE_KEY), { contextLoader });

    const response = await forward(signed);

    expect(response.status, await response.clone().text()).toBe(202);
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it('relay が HTTP 署名し、投稿者の Object Integrity Proof がついた Create を 202 で受け付けて listener を呼ぶ', async () => {
    const { authorProofKeyPair, contextLoader, forward, onCreate } = await setupRelay();
    const signed = await signObject(create(), authorProofKeyPair.privateKey, new URL(AUTHOR_PROOF_KEY), {
      contextLoader,
    });
    const jsonLd = await signed.toJsonLd({ format: 'compact', contextLoader });

    const response = await forward(jsonLd);

    expect(response.status, await response.clone().text()).toBe(202);
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it('署名のない Create を relay が転送しても 401 で拒否して listener を呼ばない', async () => {
    const { contextLoader, forward, onCreate } = await setupRelay();
    const jsonLd = await create().toJsonLd({ format: 'compact', contextLoader });

    const response = await forward(jsonLd);

    expect(response.status).toBe(401);
    expect(onCreate).not.toHaveBeenCalled();
  });
});
