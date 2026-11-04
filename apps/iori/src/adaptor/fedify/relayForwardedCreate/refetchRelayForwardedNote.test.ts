import { Note, Person } from '@fedify/vocab';
import { FetchError } from '@fedify/vocab-runtime';
import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { createRefetchRelayForwardedNoteHandler } from './refetchRelayForwardedNote.ts';

const relayId = '0b8f0f4e-6a0b-4c52-9d3a-0d6f1c9a7e11';
const objectId = 'https://remote.example/notes/1';
const actorId = 'https://remote.example/users/alice';
const data = { objectId, actorId, relayId };
const publicAddress = new URL('https://www.w3.org/ns/activitystreams#Public');

const fetchTimeout = (url: string) => {
  const error = new FetchError(url, 'Timed out after 10000 ms');
  error.cause = new DOMException('The document loader timed out after 10000 ms.', 'TimeoutError');
  return error;
};

const createNote = (overrides: { id?: string; tos?: URL[]; actorId?: string } = {}) =>
  new Note({
    id: new URL(overrides.id ?? objectId),
    content: '<p>hello</p>',
    tos: overrides.tos ?? [publicAddress],
    attribution: new Person({
      id: new URL(overrides.actorId ?? actorId),
      inbox: new URL(`${overrides.actorId ?? actorId}/inbox`),
      preferredUsername: 'alice',
    }),
  });

const createCtx = (fetched: Note | Person | null | Error, documentUrl?: string) => {
  const documentLoader = vi.fn(async (url: string) => {
    if (fetched instanceof Error) {
      throw fetched;
    }
    return {
      contextUrl: null,
      documentUrl: documentUrl ?? url,
      document: fetched === null ? null : await fetched.toJsonLd(),
    };
  });
  return {
    documentLoader,
    ctx: {
      getDocumentLoader: vi.fn(async () => documentLoader),
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
    const { ctx, documentLoader } = createCtx(createNote());

    await createRefetchRelayForwardedNoteHandler(deps)(ctx, data);

    expect(documentLoader).toHaveBeenCalledWith(objectId);
    expect(federatedTimelineItemCreatedStore.store).toHaveBeenCalledOnce();
  });

  it('stores a federated timeline item for an unlisted Note', async () => {
    const { deps, federatedTimelineItemCreatedStore } = createDeps();
    const note = createNote({ tos: [] }).clone({ ccs: [publicAddress] });
    const { ctx } = createCtx(note);

    await createRefetchRelayForwardedNoteHandler(deps)(ctx, data);

    expect(federatedTimelineItemCreatedStore.store).toHaveBeenCalledOnce();
  });

  it('does not store when the fetched document is null', async () => {
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

  it('resolves without storing when the documentUrl has a different origin from the requested one', async () => {
    const { deps, federatedTimelineItemCreatedStore } = createDeps();
    const { ctx } = createCtx(createNote(), 'https://attacker.example/notes/1');

    await expect(createRefetchRelayForwardedNoteHandler(deps)(ctx, data)).resolves.toBeUndefined();

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
    const { ctx, documentLoader } = createCtx(createNote());

    await createRefetchRelayForwardedNoteHandler(deps)(ctx, data);

    expect(documentLoader).not.toHaveBeenCalled();
    expect(federatedTimelineItemCreatedStore.store).not.toHaveBeenCalled();
  });

  it('does not refetch when the relay does not exist', async () => {
    const { deps, federatedTimelineItemCreatedStore } = createDeps(null);
    const { ctx, documentLoader } = createCtx(createNote());

    await createRefetchRelayForwardedNoteHandler(deps)(ctx, data);

    expect(documentLoader).not.toHaveBeenCalled();
    expect(federatedTimelineItemCreatedStore.store).not.toHaveBeenCalled();
  });

  it('does not store when the origin of the Note differs from the origin of the actor', async () => {
    const { deps, federatedTimelineItemCreatedStore } = createDeps();
    const otherActorId = 'https://other.example/users/alice';
    const note = createNote({ actorId: otherActorId });
    const author = await note.getAttribution();
    const documentLoader = vi.fn(async (url: string) => ({
      contextUrl: null,
      documentUrl: url,
      document: await (url === otherActorId ? author : note)?.toJsonLd(),
    }));
    const ctx = { getDocumentLoader: vi.fn(async () => documentLoader) } as never;

    await createRefetchRelayForwardedNoteHandler(deps)(ctx, { ...data, actorId: otherActorId });

    expect(federatedTimelineItemCreatedStore.store).not.toHaveBeenCalled();
  });

  it('does not store when the author of the Note differs from the actor of the Create', async () => {
    const { deps, federatedTimelineItemCreatedStore } = createDeps();
    const { ctx } = createCtx(createNote({ actorId: 'https://remote.example/users/bob' }));

    await createRefetchRelayForwardedNoteHandler(deps)(ctx, data);

    expect(federatedTimelineItemCreatedStore.store).not.toHaveBeenCalled();
  });

  it('resolves without storing when fetching the Note times out', async () => {
    const { deps, federatedTimelineItemCreatedStore } = createDeps();
    const timeout = fetchTimeout(objectId);
    const { ctx } = createCtx(timeout);

    await expect(createRefetchRelayForwardedNoteHandler(deps)(ctx, data)).resolves.toBeUndefined();

    expect(federatedTimelineItemCreatedStore.store).not.toHaveBeenCalled();
  });

  it('rejects when fetching the Note fails for a reason other than the fetch', async () => {
    const { deps } = createDeps();
    const error = new Error('unexpected');
    const { ctx } = createCtx(error);

    await expect(createRefetchRelayForwardedNoteHandler(deps)(ctx, data)).rejects.toBe(error);
  });

  it('resolves without storing when fetching the author times out', async () => {
    const { deps, federatedTimelineItemCreatedStore } = createDeps();
    const authorId = new URL(actorId);
    const timeout = fetchTimeout(actorId);
    const note = new Note({
      id: new URL(objectId),
      content: '<p>hello</p>',
      tos: [publicAddress],
      attribution: authorId,
    });
    const documentLoader = vi.fn(async (url: string) => {
      if (url === actorId) {
        throw timeout;
      }
      return { contextUrl: null, documentUrl: url, document: await note.toJsonLd() };
    });
    const ctx = { getDocumentLoader: vi.fn(async () => documentLoader) } as never;

    await expect(createRefetchRelayForwardedNoteHandler(deps)(ctx, data)).resolves.toBeUndefined();

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
