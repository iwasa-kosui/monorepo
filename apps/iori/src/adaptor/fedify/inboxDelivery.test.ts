import { createFederation, generateCryptoKeyPair, MemoryKvStore, signRequest } from '@fedify/fedify';
import { Create, CryptographicKey, Follow, Note, Person, PUBLIC_COLLECTION } from '@fedify/vocab';
import { getDocumentLoader } from '@fedify/vocab-runtime';
import { describe, expect, it, vi } from 'vitest';

import { createContextLoaderFactory } from '../../federationContext.ts';

const ORIGIN = 'https://iori.example';
const REMOTE_ACTOR = 'https://remote.example/users/alice';
const REMOTE_KEY = `${REMOTE_ACTOR}#main-key`;

const setup = async () => {
  const keyPair = await generateCryptoKeyPair('RSASSA-PKCS1-v1_5');
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

describe('HTTP 署名つきの活動の受信', () => {
  it('個人 inbox への署名つき Follow を 202 で受け付けて listener を呼ぶ', async () => {
    const { deliver, onFollow } = await setup();

    const response = await deliver('/users/kosui/inbox', follow());

    expect(response.status).toBe(202);
    expect(onFollow).toHaveBeenCalledOnce();
  });

  it('共有 inbox への署名つき Create を 202 で受け付けて listener を呼ぶ', async () => {
    const { deliver, onCreate } = await setup();

    const response = await deliver('/inbox', create());

    expect(response.status).toBe(202);
    expect(onCreate).toHaveBeenCalledOnce();
  });

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
