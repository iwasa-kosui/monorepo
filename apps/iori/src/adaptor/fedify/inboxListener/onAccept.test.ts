import { Accept, Follow } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { Relay } from '../../../domain/relay/relay.ts';
import { createOnAccept } from './onAccept.ts';

const ORIGIN = 'https://iori.test';
const RELAY_ACTOR_URI = 'https://relay.example/actor';

const createCtx = () =>
  ({
    getActorUri: vi.fn(() => new URL(`${ORIGIN}/users/instance`)),
  }) as never;

const createDeps = (relay: unknown) => {
  const acceptRelaySubscriptionUseCase = {
    run: vi.fn(async () => RA.ok({ actorUri: RELAY_ACTOR_URI })),
  };
  const followAcceptedStore = { store: vi.fn(async () => RA.ok(undefined)) };
  const deps = {
    origin: ORIGIN,
    relayResolverByActorUri: { resolve: vi.fn(async () => RA.ok(relay)) },
    inboxActorResolver: {
      resolve: vi.fn(async () => RA.ok({ actorIdentity: { uri: RELAY_ACTOR_URI } })),
    },
    acceptRelaySubscriptionUseCase,
    actorResolverByUri: { resolve: vi.fn(async (uri: string) => RA.ok({ id: `actor:${uri}` })) },
    followResolver: { resolve: vi.fn(async () => RA.ok({ followerId: 'f', followingId: 'g' })) },
    followAcceptedStore,
  };
  return { deps: deps as never, acceptRelaySubscriptionUseCase, followAcceptedStore };
};

const pendingRelay = { actorUri: RELAY_ACTOR_URI, status: Relay.Status.Pending };

const createAcceptWithObjectId = (objectId: string) => {
  const accept = new Accept({
    id: new URL('https://relay.example/activities/1'),
    actor: new URL(RELAY_ACTOR_URI),
    object: new URL(objectId),
  });
  const getObject = vi.spyOn(accept, 'getObject').mockRejectedValue(new SyntaxError('Unexpected token < in JSON'));
  return { accept, getObject };
};

describe('createOnAccept', () => {
  it('accepts a pending relay subscription from an Accept whose object is only a Follow id', async () => {
    const { deps, acceptRelaySubscriptionUseCase } = createDeps(pendingRelay);
    const { accept, getObject } = createAcceptWithObjectId(`${ORIGIN}/#RelayFollow/0b0a3d2e`);

    await createOnAccept(deps)(createCtx(), accept);

    expect(acceptRelaySubscriptionUseCase.run).toHaveBeenCalledWith({ relayActorUri: RELAY_ACTOR_URI });
    expect(getObject).not.toHaveBeenCalled();
  });

  it('does not treat an Accept as a relay Accept when the object id is not on the iori origin', async () => {
    const { deps, acceptRelaySubscriptionUseCase } = createDeps(pendingRelay);
    const { accept, getObject } = createAcceptWithObjectId('https://other.example/#RelayFollow/0b0a3d2e');

    await expect(createOnAccept(deps)(createCtx(), accept)).rejects.toThrow();

    expect(acceptRelaySubscriptionUseCase.run).not.toHaveBeenCalled();
    expect(getObject).toHaveBeenCalledOnce();
  });

  it('does not treat an Accept as a relay Accept when the object id is a user Follow id on the iori origin', async () => {
    const { deps, acceptRelaySubscriptionUseCase } = createDeps(pendingRelay);
    const { accept, getObject } = createAcceptWithObjectId(`${ORIGIN}/#Follow/0b0a3d2e`);

    await expect(createOnAccept(deps)(createCtx(), accept)).rejects.toThrow();

    expect(acceptRelaySubscriptionUseCase.run).not.toHaveBeenCalled();
    expect(getObject).toHaveBeenCalledOnce();
  });

  it('falls through to the existing branch when the actor is not in relays', async () => {
    const { deps, acceptRelaySubscriptionUseCase } = createDeps(undefined);
    const { accept, getObject } = createAcceptWithObjectId(`${ORIGIN}/#RelayFollow/0b0a3d2e`);

    await expect(createOnAccept(deps)(createCtx(), accept)).rejects.toThrow();

    expect(acceptRelaySubscriptionUseCase.run).not.toHaveBeenCalled();
    expect(getObject).toHaveBeenCalledOnce();
  });

  it('does nothing without fetching the object when the relay is already accepted', async () => {
    const { deps, acceptRelaySubscriptionUseCase } = createDeps({ ...pendingRelay, status: Relay.Status.Accepted });
    const { accept, getObject } = createAcceptWithObjectId(`${ORIGIN}/#RelayFollow/0b0a3d2e`);

    await expect(createOnAccept(deps)(createCtx(), accept)).resolves.toBeUndefined();

    expect(acceptRelaySubscriptionUseCase.run).not.toHaveBeenCalled();
    expect(getObject).not.toHaveBeenCalled();
  });

  it('falls through to the existing branch when the relay is rejected', async () => {
    const { deps, acceptRelaySubscriptionUseCase } = createDeps({ ...pendingRelay, status: Relay.Status.Rejected });
    const { accept, getObject } = createAcceptWithObjectId(`${ORIGIN}/#RelayFollow/0b0a3d2e`);

    await expect(createOnAccept(deps)(createCtx(), accept)).rejects.toThrow();

    expect(acceptRelaySubscriptionUseCase.run).not.toHaveBeenCalled();
    expect(getObject).toHaveBeenCalledOnce();
  });

  it('still accepts a relay subscription from an Accept with an embedded Follow by the instance actor', async () => {
    const { deps, acceptRelaySubscriptionUseCase } = createDeps(undefined);
    const accept = new Accept({
      id: new URL('https://relay.example/activities/2'),
      actor: new URL(RELAY_ACTOR_URI),
      object: new Follow({
        id: new URL('https://relay.example/follows/1'),
        actor: new URL(`${ORIGIN}/users/instance`),
        object: new URL(RELAY_ACTOR_URI),
      }),
    });

    await createOnAccept(deps)(createCtx(), accept);

    expect(acceptRelaySubscriptionUseCase.run).toHaveBeenCalledWith({ relayActorUri: RELAY_ACTOR_URI });
  });

  it('processes an Accept for a user Follow as before', async () => {
    const { deps, acceptRelaySubscriptionUseCase, followAcceptedStore } = createDeps(undefined);
    const accept = new Accept({
      id: new URL('https://remote.example/activities/3'),
      actor: new URL('https://remote.example/users/bob'),
      object: new Follow({
        id: new URL(`${ORIGIN}/follows/1`),
        actor: new URL(`${ORIGIN}/users/alice`),
        object: new URL('https://remote.example/users/bob'),
      }),
    });

    await createOnAccept(deps)(createCtx(), accept);

    expect(acceptRelaySubscriptionUseCase.run).not.toHaveBeenCalled();
    expect(followAcceptedStore.store).toHaveBeenCalledOnce();
  });

  it('processes an Accept whose embedded Follow id has a different origin from the Accept id', async () => {
    const { deps, followAcceptedStore } = createDeps(undefined);
    const localActorUri = `${ORIGIN}/users/alice`;
    const documentLoader = vi.fn(async (url: string) => ({
      contextUrl: null,
      documentUrl: url,
      document: {
        '@context': 'https://www.w3.org/ns/activitystreams',
        id: localActorUri,
        type: 'Person',
        preferredUsername: 'alice',
      },
    }));
    const accept = await Accept.fromJsonLd({
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: 'https://remote.example/activities/4',
      type: 'Accept',
      actor: 'https://remote.example/users/bob',
      object: {
        id: `${localActorUri}#follows/abc`,
        type: 'Follow',
        actor: localActorUri,
        object: 'https://remote.example/users/bob',
      },
    }, { documentLoader });

    await createOnAccept(deps)(createCtx(), accept as Accept);

    expect(followAcceptedStore.store).toHaveBeenCalledOnce();
  });
});
