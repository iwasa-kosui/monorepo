import { Note, Person } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { ActorIdentity } from '../actorIdentity.ts';
import { saveFederatedNote } from './saveFederatedNote.ts';

const relayId = 'relay-1' as never;

const createNote = (attributionId = 'https://remote.example/users/alice') =>
  new Note({
    id: new URL('https://remote.example/notes/1'),
    content: '<p>hello</p>',
    attribution: new Person({
      id: new URL(attributionId),
      inbox: new URL(`${attributionId}/inbox`),
      preferredUsername: 'alice',
    }),
  });

const createDeps = (existing: unknown = undefined) => {
  const remotePostUpserter = { resolve: vi.fn(async () => RA.ok({ postId: 'post-1', actorId: 'actor-1' })) };
  const actorResolverByUri = { resolve: vi.fn(async (_uri: string) => RA.ok({ id: 'actor-1' } as unknown)) };
  const federatedTimelineItemResolverByPostId = { resolve: vi.fn(async () => RA.ok(existing)) };
  const federatedTimelineItemCreatedStore = { store: vi.fn(async () => undefined) };
  return {
    deps: {
      origin: 'https://iori.test',
      remotePostUpserter,
      actorResolverByUri,
      federatedTimelineItemResolverByPostId,
      federatedTimelineItemCreatedStore,
    } as never,
    remotePostUpserter,
    actorResolverByUri,
    federatedTimelineItemResolverByPostId,
    federatedTimelineItemCreatedStore,
  };
};

const documentLoader = vi.fn() as never;

describe('saveFederatedNote', () => {
  it('stores one federated timeline item for a new post', async () => {
    const { deps, federatedTimelineItemCreatedStore } = createDeps();

    await saveFederatedNote(deps, { note: createNote(), relayId, documentLoader });

    expect(federatedTimelineItemCreatedStore.store).toHaveBeenCalledOnce();
  });

  it('fetches the author and attachments of the Note with the given document loader', async () => {
    const { deps } = createDeps();
    const note = createNote();
    const getAttribution = vi.spyOn(note, 'getAttribution');
    const getAttachments = vi.spyOn(note, 'getAttachments');
    const fromFedifyActor = vi.spyOn(ActorIdentity, 'fromFedifyActor');

    await saveFederatedNote(deps, { note, relayId, documentLoader });

    expect(getAttribution).toHaveBeenCalledWith({ documentLoader });
    expect(getAttachments).toHaveBeenCalledWith({ documentLoader });
    expect(fromFedifyActor).toHaveBeenCalledWith(expect.anything(), { documentLoader });
    fromFedifyActor.mockRestore();
  });

  it('passes the summary and sensitive flag of the Note to the upserter', async () => {
    const { deps, remotePostUpserter } = createDeps();
    const note = createNote().clone({ summary: 'ネタバレ注意', sensitive: true });

    await saveFederatedNote(deps, { note, relayId, documentLoader });

    expect(remotePostUpserter.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ summary: 'ネタバレ注意', sensitive: true }),
    );
  });

  it('passes null and false to the upserter when the Note has no content warning', async () => {
    const { deps, remotePostUpserter } = createDeps();

    await saveFederatedNote(deps, { note: createNote(), relayId, documentLoader });

    expect(remotePostUpserter.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ summary: null, sensitive: false }),
    );
  });

  it('stores a federated timeline item for an existing post owned by the Note author', async () => {
    const { deps, remotePostUpserter, actorResolverByUri, federatedTimelineItemCreatedStore } = createDeps();
    remotePostUpserter.resolve.mockReturnValue(RA.ok({ postId: 'post-existing', actorId: 'actor-1' }));

    await saveFederatedNote(deps, { note: createNote(), relayId, documentLoader });

    expect(actorResolverByUri.resolve).toHaveBeenCalledWith('https://remote.example/users/alice');
    expect(federatedTimelineItemCreatedStore.store).toHaveBeenCalledOnce();
  });

  it.each<[string, URL | undefined]>([
    ['without the actor id', undefined],
    ['with the actor id', new URL('https://remote.example/users/bob')],
  ])(
    'does not store a federated timeline item for an existing post owned by another actor %s',
    async (_name, actorId) => {
      const { deps, remotePostUpserter, federatedTimelineItemResolverByPostId, federatedTimelineItemCreatedStore } =
        createDeps();
      remotePostUpserter.resolve.mockReturnValue(RA.ok({ postId: 'post-existing', actorId: 'actor-other' }));

      await saveFederatedNote(deps, { note: createNote(), relayId, documentLoader, actorId });

      expect(federatedTimelineItemResolverByPostId.resolve).not.toHaveBeenCalled();
      expect(federatedTimelineItemCreatedStore.store).not.toHaveBeenCalled();
    },
  );

  it('does not store a federated timeline item when the author actor is not found', async () => {
    const { deps, actorResolverByUri, federatedTimelineItemCreatedStore } = createDeps();
    actorResolverByUri.resolve.mockReturnValue(RA.ok(undefined));

    await saveFederatedNote(deps, { note: createNote(), relayId, documentLoader });

    expect(federatedTimelineItemCreatedStore.store).not.toHaveBeenCalled();
  });

  it('rejects without storing a federated timeline item when resolving the author actor fails', async () => {
    const { deps, actorResolverByUri, federatedTimelineItemCreatedStore } = createDeps();
    actorResolverByUri.resolve.mockRejectedValue(new Error('db down'));

    await expect(saveFederatedNote(deps, { note: createNote(), relayId, documentLoader })).rejects.toThrow();

    expect(federatedTimelineItemCreatedStore.store).not.toHaveBeenCalled();
  });

  it('does not store a federated timeline item when the post is already in the federated timeline', async () => {
    const { deps, federatedTimelineItemCreatedStore } = createDeps({ postId: 'post-1' });

    await saveFederatedNote(deps, { note: createNote(), relayId, documentLoader });

    expect(federatedTimelineItemCreatedStore.store).not.toHaveBeenCalled();
  });

  it('does not save a Note whose attribution is on another origin', async () => {
    const { deps, remotePostUpserter, federatedTimelineItemCreatedStore } = createDeps();
    const note = createNote('https://other.example/users/alice');

    await saveFederatedNote(deps, { note, relayId, documentLoader });

    expect(remotePostUpserter.resolve).not.toHaveBeenCalled();
    expect(federatedTimelineItemCreatedStore.store).not.toHaveBeenCalled();
  });

  it('does not save the Note when the given actor id is on another origin', async () => {
    const { deps, remotePostUpserter, federatedTimelineItemCreatedStore } = createDeps();

    await saveFederatedNote(deps, {
      note: createNote(),
      relayId,
      documentLoader,
      actorId: new URL('https://other.example/users/alice'),
    });

    expect(remotePostUpserter.resolve).not.toHaveBeenCalled();
    expect(federatedTimelineItemCreatedStore.store).not.toHaveBeenCalled();
  });

  it('saves the Note when the given actor id is on the same origin', async () => {
    const { deps, federatedTimelineItemCreatedStore } = createDeps();

    await saveFederatedNote(deps, {
      note: createNote(),
      relayId,
      documentLoader,
      actorId: new URL('https://remote.example/users/bob'),
    });

    expect(federatedTimelineItemCreatedStore.store).toHaveBeenCalledOnce();
  });

  it('records the given inReplyToUri on the remote post', async () => {
    const { deps, remotePostUpserter } = createDeps();

    await saveFederatedNote(deps, {
      note: createNote(),
      relayId,
      documentLoader,
      inReplyToUri: 'https://remote.example/notes/0',
    });

    expect(remotePostUpserter.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ inReplyToUri: 'https://remote.example/notes/0' }),
    );
  });

  it('records a null inReplyToUri when none is given', async () => {
    const { deps, remotePostUpserter } = createDeps();

    await saveFederatedNote(deps, { note: createNote(), relayId, documentLoader });

    expect(remotePostUpserter.resolve).toHaveBeenCalledWith(expect.objectContaining({ inReplyToUri: null }));
  });

  it('treats a different port as a different origin', async () => {
    const { deps, federatedTimelineItemCreatedStore } = createDeps();

    await saveFederatedNote(deps, {
      note: createNote(),
      relayId,
      documentLoader,
      actorId: new URL('https://remote.example:8443/users/bob'),
    });

    expect(federatedTimelineItemCreatedStore.store).not.toHaveBeenCalled();
  });

  it('succeeds when the store fails but the item exists on re-resolve', async () => {
    const { deps, federatedTimelineItemResolverByPostId, federatedTimelineItemCreatedStore } = createDeps();
    federatedTimelineItemResolverByPostId.resolve
      .mockReturnValueOnce(RA.ok(undefined))
      .mockReturnValueOnce(RA.ok({ postId: 'post-1' }));
    federatedTimelineItemCreatedStore.store.mockRejectedValue(new Error('UNIQUE constraint failed'));

    await expect(saveFederatedNote(deps, { note: createNote(), relayId, documentLoader })).resolves.toBeUndefined();

    expect(federatedTimelineItemResolverByPostId.resolve).toHaveBeenCalledTimes(2);
  });

  it('rethrows the store error when the item does not exist on re-resolve', async () => {
    const { deps, federatedTimelineItemCreatedStore } = createDeps();
    const error = new Error('db down');
    federatedTimelineItemCreatedStore.store.mockRejectedValue(error);

    await expect(saveFederatedNote(deps, { note: createNote(), relayId, documentLoader })).rejects.toBe(error);
  });

  it('rethrows the store error when the re-resolve itself throws', async () => {
    const { deps, federatedTimelineItemResolverByPostId, federatedTimelineItemCreatedStore } = createDeps();
    const error = new Error('db down');
    federatedTimelineItemResolverByPostId.resolve
      .mockReturnValueOnce(RA.ok(undefined))
      .mockRejectedValueOnce(new Error('resolve failed'));
    federatedTimelineItemCreatedStore.store.mockRejectedValue(error);

    await expect(saveFederatedNote(deps, { note: createNote(), relayId, documentLoader })).rejects.toBe(error);
  });
});
