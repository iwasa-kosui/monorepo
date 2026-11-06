import { Follow, Reject } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { createOnReject } from './onReject.ts';

const ORIGIN = 'https://iori.test';
const REMOTE_ACTOR_URI = 'https://remote.example/users/bob';
const LOCAL_ACTOR_URI = `${ORIGIN}/users/alice`;

const createCtx = () =>
  ({
    parseUri: vi.fn((uri: URL) =>
      uri.origin === ORIGIN ? { type: 'actor', identifier: uri.pathname.split('/').pop() } : null
    ),
  }) as never;

const createDeps = (followExists = true) => {
  const undoFollowingProcessedStore = { store: vi.fn(async () => RA.ok(undefined)) };
  const follow = followExists ? { followerId: 'actor:local', followingId: 'actor:remote' } : undefined;
  const followResolver = { resolve: vi.fn(async () => RA.ok(follow)) };
  const deps = {
    inboxActorResolver: {
      resolve: vi.fn(async () => RA.ok({ actorIdentity: { uri: REMOTE_ACTOR_URI } })),
    },
    actorResolverByUri: {
      resolve: vi.fn(async (uri: string) => RA.ok({ id: uri === LOCAL_ACTOR_URI ? 'actor:local' : 'actor:remote' })),
    },
    followResolver,
    undoFollowingProcessedStore,
  };
  return { deps: deps as never, followResolver, undoFollowingProcessedStore };
};

const createReject = (followActor = LOCAL_ACTOR_URI, followObject = REMOTE_ACTOR_URI) =>
  new Reject({
    id: new URL('https://remote.example/activities/1'),
    actor: new URL(REMOTE_ACTOR_URI),
    object: new Follow({
      id: new URL(`${ORIGIN}/follows/1`),
      actor: new URL(followActor),
      object: new URL(followObject),
    }),
  });

describe('createOnReject', () => {
  it('removes the follow when the rejected Follow exists', async () => {
    const { deps, followResolver, undoFollowingProcessedStore } = createDeps();

    await createOnReject(deps)(createCtx(), createReject());

    expect(followResolver.resolve).toHaveBeenCalledWith({ followerId: 'actor:local', followingId: 'actor:remote' });
    expect(undoFollowingProcessedStore.store).toHaveBeenCalledOnce();
    expect(undoFollowingProcessedStore.store).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'follow.undoFollowingProcessed',
        eventPayload: { followerId: 'actor:local', followingId: 'actor:remote' },
      }),
    );
  });

  it('removes the follow when the embedded Follow id has a different origin from the Reject id', async () => {
    const { deps, followResolver, undoFollowingProcessedStore } = createDeps();
    const followId = `${ORIGIN}/users/alice#follows/abc`;
    const documentLoader = vi.fn(async (url: string) => ({
      contextUrl: null,
      documentUrl: url,
      document: {
        '@context': 'https://www.w3.org/ns/activitystreams',
        id: LOCAL_ACTOR_URI,
        type: 'Person',
        preferredUsername: 'alice',
      },
    }));
    const reject = await Reject.fromJsonLd({
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: 'https://remote.example/activities/4',
      type: 'Reject',
      actor: REMOTE_ACTOR_URI,
      object: {
        id: followId,
        type: 'Follow',
        actor: LOCAL_ACTOR_URI,
        object: REMOTE_ACTOR_URI,
      },
    }, { documentLoader });

    await createOnReject(deps)(createCtx(), reject as Reject);

    expect(followResolver.resolve).toHaveBeenCalledWith({ followerId: 'actor:local', followingId: 'actor:remote' });
    expect(undoFollowingProcessedStore.store).toHaveBeenCalledOnce();
  });

  it('does nothing when the follow does not exist', async () => {
    const { deps, undoFollowingProcessedStore } = createDeps(false);

    await createOnReject(deps)(createCtx(), createReject());

    expect(undoFollowingProcessedStore.store).not.toHaveBeenCalled();
  });

  it('rejects when the follow resolver fails so that the queue retries', async () => {
    const { deps, followResolver, undoFollowingProcessedStore } = createDeps();
    followResolver.resolve.mockResolvedValueOnce(RA.err(new Error('db down')) as never);

    await expect(createOnReject(deps)(createCtx(), createReject())).rejects.toThrow();

    expect(undoFollowingProcessedStore.store).not.toHaveBeenCalled();
  });

  it('does nothing when the object is not a Follow', async () => {
    const { deps, followResolver, undoFollowingProcessedStore } = createDeps();
    const reject = new Reject({
      id: new URL('https://remote.example/activities/2'),
      actor: new URL(REMOTE_ACTOR_URI),
      object: new URL(`${ORIGIN}/follows/1`),
    });
    vi.spyOn(reject, 'getObject').mockResolvedValue(null);

    await createOnReject(deps)(createCtx(), reject);

    expect(followResolver.resolve).not.toHaveBeenCalled();
    expect(undoFollowingProcessedStore.store).not.toHaveBeenCalled();
  });

  it('does nothing when the Follow actor is not a local actor', async () => {
    const { deps, followResolver, undoFollowingProcessedStore } = createDeps();

    await createOnReject(deps)(createCtx(), createReject('https://other.example/users/carol'));

    expect(followResolver.resolve).not.toHaveBeenCalled();
    expect(undoFollowingProcessedStore.store).not.toHaveBeenCalled();
  });

  it('does nothing when the Follow object differs from the sender', async () => {
    const { deps, followResolver, undoFollowingProcessedStore } = createDeps();

    await createOnReject(deps)(createCtx(), createReject(LOCAL_ACTOR_URI, 'https://remote.example/users/dave'));

    expect(followResolver.resolve).not.toHaveBeenCalled();
    expect(undoFollowingProcessedStore.store).not.toHaveBeenCalled();
  });

  it('does nothing when the Reject has no actorId', async () => {
    const { deps, followResolver, undoFollowingProcessedStore } = createDeps();
    const reject = new Reject({
      id: new URL('https://remote.example/activities/3'),
      object: new Follow({
        id: new URL(`${ORIGIN}/follows/1`),
        actor: new URL(LOCAL_ACTOR_URI),
        object: new URL(REMOTE_ACTOR_URI),
      }),
    });

    await createOnReject(deps)(createCtx(), reject);

    expect(followResolver.resolve).not.toHaveBeenCalled();
    expect(undoFollowingProcessedStore.store).not.toHaveBeenCalled();
  });
});
