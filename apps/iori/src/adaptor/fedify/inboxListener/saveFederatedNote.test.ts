import { Note, Person } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

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
  const remotePostUpserter = { resolve: vi.fn(async () => RA.ok({ postId: 'post-1' })) };
  const federatedTimelineItemResolverByPostId = { resolve: vi.fn(async () => RA.ok(existing)) };
  const federatedTimelineItemCreatedStore = { store: vi.fn(async () => undefined) };
  return {
    deps: {
      origin: 'https://iori.test',
      remotePostUpserter,
      federatedTimelineItemResolverByPostId,
      federatedTimelineItemCreatedStore,
    } as never,
    remotePostUpserter,
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
