import { Note, Person } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { createRefetchRelayForwardedNoteHandler } from './refetchRelayForwardedNote.ts';

const relayId = '0b8f0f4e-6a0b-4c52-9d3a-0d6f1c9a7e11';
const objectId = 'https://remote.example/notes/1';
const actorId = 'https://remote.example/users/alice';
const data = { objectId, actorId, relayId };
const publicAddress = new URL('https://www.w3.org/ns/activitystreams#Public');

const createNote = (overrides: { id?: string; tos?: URL[] } = {}) =>
  new Note({
    id: new URL(overrides.id ?? objectId),
    content: '<p>hello</p>',
    tos: overrides.tos ?? [publicAddress],
    attribution: new Person({
      id: new URL(actorId),
      inbox: new URL(`${actorId}/inbox`),
      preferredUsername: 'alice',
    }),
  });

const createCtx = (looked: unknown) => {
  const documentLoader = vi.fn();
  const lookupObject = vi.fn(async () => looked);
  return {
    documentLoader,
    lookupObject,
    ctx: {
      getDocumentLoader: vi.fn(async () => documentLoader),
      lookupObject,
    } as never,
  };
};

const createDeps = (relayStatus: string | null = 'accepted') => {
  const relayResolver = {
    resolve: vi.fn(async () =>
      RA.ok(
        relayStatus === null ? undefined : { relayId, status: relayStatus, actorUri: 'https://relay.example/actor' },
      )
    ),
  };
  const remotePostUpserter = { resolve: vi.fn(async () => RA.ok({ postId: 'post-1' })) };
  const federatedTimelineItemResolverByPostId = { resolve: vi.fn(async () => RA.ok(undefined)) };
  const federatedTimelineItemCreatedStore = { store: vi.fn(async () => undefined) };
  return {
    deps: {
      origin: 'https://iori.test',
      relayResolver,
      remotePostUpserter,
      federatedTimelineItemResolverByPostId,
      federatedTimelineItemCreatedStore,
    } as never,
    federatedTimelineItemCreatedStore,
  };
};

describe('createRefetchRelayForwardedNoteHandler', () => {
  it('refetches the Note with the instance actor loader and stores a federated timeline item', async () => {
    const { deps, federatedTimelineItemCreatedStore } = createDeps();
    const { ctx, documentLoader, lookupObject } = createCtx(createNote());

    await createRefetchRelayForwardedNoteHandler(deps)(ctx, data);

    expect(lookupObject).toHaveBeenCalledWith(new URL(objectId), { documentLoader });
    expect(federatedTimelineItemCreatedStore.store).toHaveBeenCalledOnce();
  });

  it('stores a federated timeline item for an unlisted Note', async () => {
    const { deps, federatedTimelineItemCreatedStore } = createDeps();
    const note = createNote({ tos: [] }).clone({ ccs: [publicAddress] });
    const { ctx } = createCtx(note);

    await createRefetchRelayForwardedNoteHandler(deps)(ctx, data);

    expect(federatedTimelineItemCreatedStore.store).toHaveBeenCalledOnce();
  });

  it('does not store when lookupObject returns null', async () => {
    const { deps, federatedTimelineItemCreatedStore } = createDeps();
    const { ctx } = createCtx(null);

    await createRefetchRelayForwardedNoteHandler(deps)(ctx, data);

    expect(federatedTimelineItemCreatedStore.store).not.toHaveBeenCalled();
  });

  it('does not store when the refetched object is not a Note', async () => {
    const { deps, federatedTimelineItemCreatedStore } = createDeps();
    const { ctx } = createCtx(new Person({ id: new URL(objectId) }));

    await createRefetchRelayForwardedNoteHandler(deps)(ctx, data);

    expect(federatedTimelineItemCreatedStore.store).not.toHaveBeenCalled();
  });

  it('does not store when the id of the refetched Note differs from the requested one', async () => {
    const { deps, federatedTimelineItemCreatedStore } = createDeps();
    const { ctx } = createCtx(createNote({ id: 'https://remote.example/notes/2' }));

    await createRefetchRelayForwardedNoteHandler(deps)(ctx, data);

    expect(federatedTimelineItemCreatedStore.store).not.toHaveBeenCalled();
  });

  it('does not store a followers-only Note', async () => {
    const { deps, federatedTimelineItemCreatedStore } = createDeps();
    const note = createNote({ tos: [new URL(`${actorId}/followers`)] });
    const { ctx } = createCtx(note);

    await createRefetchRelayForwardedNoteHandler(deps)(ctx, data);

    expect(federatedTimelineItemCreatedStore.store).not.toHaveBeenCalled();
  });

  it('does not refetch when the relay is not accepted', async () => {
    const { deps, federatedTimelineItemCreatedStore } = createDeps('pending');
    const { ctx, lookupObject } = createCtx(createNote());

    await createRefetchRelayForwardedNoteHandler(deps)(ctx, data);

    expect(lookupObject).not.toHaveBeenCalled();
    expect(federatedTimelineItemCreatedStore.store).not.toHaveBeenCalled();
  });

  it('does not refetch when the relay does not exist', async () => {
    const { deps, federatedTimelineItemCreatedStore } = createDeps(null);
    const { ctx, lookupObject } = createCtx(createNote());

    await createRefetchRelayForwardedNoteHandler(deps)(ctx, data);

    expect(lookupObject).not.toHaveBeenCalled();
    expect(federatedTimelineItemCreatedStore.store).not.toHaveBeenCalled();
  });

  it('does not store when the origin of the Note differs from the origin of the actor', async () => {
    const { deps, federatedTimelineItemCreatedStore } = createDeps();
    const { ctx } = createCtx(createNote());

    await createRefetchRelayForwardedNoteHandler(deps)(ctx, { ...data, actorId: 'https://other.example/users/alice' });

    expect(federatedTimelineItemCreatedStore.store).not.toHaveBeenCalled();
  });

  it('rejects when the store throws', async () => {
    const { deps, federatedTimelineItemCreatedStore } = createDeps();
    const error = new Error('db down');
    federatedTimelineItemCreatedStore.store.mockRejectedValue(error);
    const { ctx } = createCtx(createNote());

    await expect(createRefetchRelayForwardedNoteHandler(deps)(ctx, data)).rejects.toBe(error);
  });
});
