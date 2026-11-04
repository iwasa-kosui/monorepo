import { type Announce, Document, Note, Person } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { createOnAnnounce } from './onAnnounce.ts';

const createNote = (attachments: (Document | URL)[]) =>
  new Note({
    id: new URL('https://remote.example/notes/1'),
    content: '<p>hello</p>',
    attribution: new Person({
      id: new URL('https://remote.example/users/alice'),
      inbox: new URL('https://remote.example/users/alice/inbox'),
      preferredUsername: 'alice',
    }),
    attachments,
  });

const createActivity = (note: Note) =>
  ({
    id: new URL('https://announcer.example/activities/1'),
    actorId: new URL('https://announcer.example/users/bob'),
    objectId: note.id,
    getObject: vi.fn(async () => note),
  }) as unknown as Announce;

const createCtx = (documentLoader: unknown = vi.fn(), parsedUri: unknown = null) =>
  ({
    parseUri: vi.fn(() => parsedUri),
    documentLoader,
  }) as never;

const createDeps = (relay: unknown, followed = true, acceptedRelays: unknown[] = []) => {
  const documentLoader = vi.fn();
  const addReceivedRepostUseCase = {
    run: vi.fn(async () => RA.ok({ actor: { uri: 'https://announcer.example/users/bob' } })),
  };
  const remotePostUpserter = {
    resolve: vi.fn(async () => RA.ok({ postId: 'post-1' })),
  };
  const federatedTimelineItemResolverByPostId = { resolve: vi.fn(async () => RA.ok(undefined)) };
  const federatedTimelineItemCreatedStore = { store: vi.fn(async () => RA.ok(undefined)) };
  const followedByLocalActorResolverByActorUri = { resolve: vi.fn(async () => RA.ok(followed)) };
  const inboxActorResolver = {
    resolve: vi.fn(async () =>
      RA.ok({
        actorIdentity: { uri: 'https://announcer.example/users/bob' },
        documentLoaderOptions: { documentLoader },
      })
    ),
  };
  const deps = {
    origin: 'https://iori.test',
    relayResolverByActorUri: { resolve: vi.fn(async () => RA.ok(relay)) },
    followedByLocalActorResolverByActorUri,
    acceptedRelaysResolver: { resolve: vi.fn(async () => RA.ok(acceptedRelays)) },
    inboxActorResolver,
    addReceivedRepostUseCase,
    remotePostUpserter,
    federatedTimelineItemResolverByPostId,
    federatedTimelineItemCreatedStore,
  };
  return {
    deps: deps as never,
    documentLoader,
    addReceivedRepostUseCase,
    remotePostUpserter,
    federatedTimelineItemCreatedStore,
    followedByLocalActorResolverByActorUri,
    inboxActorResolver,
  };
};

const imageAttachments = [
  new Document({ url: new URL('https://remote.example/media/1.png'), mediaType: 'image/png' }),
];

describe('createOnAnnounce', () => {
  it('passes attachments of a remote Announce to addReceivedRepostUseCase', async () => {
    const { deps, addReceivedRepostUseCase } = createDeps(undefined);
    const note = createNote(imageAttachments);

    await createOnAnnounce(deps)(createCtx(), createActivity(note));

    expect(addReceivedRepostUseCase.run).toHaveBeenCalledOnce();
    expect(addReceivedRepostUseCase.run).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'remote',
        remotePostIdentity: expect.objectContaining({
          uri: 'https://remote.example/notes/1',
          attachments: [{ url: 'https://remote.example/media/1.png', altText: null }],
        }),
      }),
    );
  });

  it('passes attachments of a relay Announce to remotePostUpserter', async () => {
    const { deps, remotePostUpserter } = createDeps({ status: 'accepted', actorUri: 'https://relay.example/actor' });
    const note = createNote(imageAttachments);

    await createOnAnnounce(deps)(createCtx(), createActivity(note));

    expect(remotePostUpserter.resolve).toHaveBeenCalledOnce();
    expect(remotePostUpserter.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: 'https://remote.example/notes/1',
        attachments: [{ url: 'https://remote.example/media/1.png', altText: null }],
      }),
    );
  });

  it('records the visibility of the announced Note in a remote Announce', async () => {
    const { deps, addReceivedRepostUseCase } = createDeps(undefined);
    const note = createNote([]).clone({ ccs: [new URL('https://www.w3.org/ns/activitystreams#Public')] });

    await createOnAnnounce(deps)(createCtx(), createActivity(note));

    expect(addReceivedRepostUseCase.run).toHaveBeenCalledWith(
      expect.objectContaining({
        remotePostIdentity: expect.objectContaining({ visibility: 'unlisted' }),
      }),
    );
  });

  it('records the visibility of the announced Note in a relay Announce', async () => {
    const { deps, remotePostUpserter } = createDeps({ status: 'accepted', actorUri: 'https://relay.example/actor' });
    const note = createNote([]).clone({ tos: [new URL('https://www.w3.org/ns/activitystreams#Public')] });

    await createOnAnnounce(deps)(createCtx(), createActivity(note));

    expect(remotePostUpserter.resolve).toHaveBeenCalledWith(expect.objectContaining({ visibility: 'public' }));
  });

  it('records null when the announced Note has no to and cc', async () => {
    const { deps, remotePostUpserter } = createDeps({ status: 'accepted', actorUri: 'https://relay.example/actor' });

    await createOnAnnounce(deps)(createCtx(), createActivity(createNote([])));

    expect(remotePostUpserter.resolve).toHaveBeenCalledWith(expect.objectContaining({ visibility: null }));
  });

  it('records the local actors addressed by the announced Note in a remote Announce', async () => {
    const { deps, addReceivedRepostUseCase } = createDeps(undefined);
    const note = createNote([]).clone({
      tos: [new URL('https://iori.test/users/kosui'), new URL('https://remote.example/users/alice/followers')],
    });

    await createOnAnnounce(deps)(createCtx(), createActivity(note));

    expect(addReceivedRepostUseCase.run).toHaveBeenCalledWith(
      expect.objectContaining({
        remotePostIdentity: expect.objectContaining({ recipientActorUris: ['https://iori.test/users/kosui'] }),
      }),
    );
  });

  it('records the local actors addressed by the announced Note in a relay Announce', async () => {
    const { deps, remotePostUpserter } = createDeps({ status: 'accepted', actorUri: 'https://relay.example/actor' });
    const note = createNote([]).clone({ ccs: [new URL('https://iori.test/users/kosui')] });

    await createOnAnnounce(deps)(createCtx(), createActivity(note));

    expect(remotePostUpserter.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ recipientActorUris: ['https://iori.test/users/kosui'] }),
    );
  });

  it('continues with empty attachments when fetching attachments fails in a remote Announce', async () => {
    const { deps, documentLoader, addReceivedRepostUseCase } = createDeps(undefined);
    documentLoader.mockRejectedValue(new Error('load failed'));
    const note = createNote([new URL('https://remote.example/media/ref')]);

    await createOnAnnounce(deps)(createCtx(), createActivity(note));

    expect(documentLoader).toHaveBeenCalled();
    expect(addReceivedRepostUseCase.run).toHaveBeenCalledWith(
      expect.objectContaining({
        remotePostIdentity: expect.objectContaining({ attachments: [] }),
      }),
    );
  });

  it('continues with empty attachments when fetching attachments fails in a relay Announce', async () => {
    const { deps, remotePostUpserter } = createDeps({ status: 'accepted', actorUri: 'https://relay.example/actor' });
    const note = createNote([new URL('https://remote.example/media/ref')]);
    const ctxDocumentLoader = vi.fn(async () => {
      throw new Error('load failed');
    });

    await createOnAnnounce(deps)(createCtx(ctxDocumentLoader), createActivity(note));

    expect(ctxDocumentLoader).toHaveBeenCalled();
    expect(remotePostUpserter.resolve).toHaveBeenCalledWith(expect.objectContaining({ attachments: [] }));
  });

  it('creates one federated timeline item from a relay Announce', async () => {
    const { deps, federatedTimelineItemCreatedStore } = createDeps({
      status: 'accepted',
      actorUri: 'https://relay.example/actor',
      relayId: 'relay-1',
    });

    await createOnAnnounce(deps)(createCtx(), createActivity(createNote([])));

    expect(federatedTimelineItemCreatedStore.store).toHaveBeenCalledOnce();
  });

  it('does not save a relay Announce whose Note attribution is on another origin', async () => {
    const { deps, remotePostUpserter, federatedTimelineItemCreatedStore } = createDeps({
      status: 'accepted',
      actorUri: 'https://relay.example/actor',
      relayId: 'relay-1',
    });
    const note = createNote([]).clone({
      attribution: new Person({
        id: new URL('https://other.example/users/alice'),
        inbox: new URL('https://other.example/users/alice/inbox'),
      }),
    });

    await createOnAnnounce(deps)(createCtx(), createActivity(note));

    expect(remotePostUpserter.resolve).not.toHaveBeenCalled();
    expect(federatedTimelineItemCreatedStore.store).not.toHaveBeenCalled();
  });

  it('does not save a remote Announce from an actor no local actor follows', async () => {
    const { deps, addReceivedRepostUseCase, inboxActorResolver, followedByLocalActorResolverByActorUri } = createDeps(
      undefined,
      false,
    );

    await createOnAnnounce(deps)(createCtx(), createActivity(createNote([])));

    expect(followedByLocalActorResolverByActorUri.resolve).toHaveBeenCalledWith({
      actorUri: 'https://announcer.example/users/bob',
    });
    expect(inboxActorResolver.resolve).not.toHaveBeenCalled();
    expect(addReceivedRepostUseCase.run).not.toHaveBeenCalled();
  });

  it('rejects without saving anything when checking whether a local actor follows the announcer fails', async () => {
    const {
      deps,
      addReceivedRepostUseCase,
      federatedTimelineItemCreatedStore,
      followedByLocalActorResolverByActorUri,
      inboxActorResolver,
    } = createDeps(undefined, false, [{ relayId: 'relay-1' }]);
    followedByLocalActorResolverByActorUri.resolve.mockResolvedValue(RA.err(new Error('db down')) as never);

    await expect(createOnAnnounce(deps)(createCtx(), createActivity(createNote([])))).rejects.toThrow();

    expect(inboxActorResolver.resolve).not.toHaveBeenCalled();
    expect(addReceivedRepostUseCase.run).not.toHaveBeenCalled();
    expect(federatedTimelineItemCreatedStore.store).not.toHaveBeenCalled();
  });

  it('saves a remote Announce from an actor a local actor follows', async () => {
    const { deps, addReceivedRepostUseCase } = createDeps(undefined, true);

    await createOnAnnounce(deps)(createCtx(), createActivity(createNote([])));

    expect(addReceivedRepostUseCase.run).toHaveBeenCalledOnce();
  });

  it('saves a local Note Announce even from an actor no local actor follows', async () => {
    const { deps, addReceivedRepostUseCase, followedByLocalActorResolverByActorUri } = createDeps(undefined, false);
    const postId = '00000000-0000-4000-8000-000000000001';
    const parsedUri = {
      type: 'object',
      class: { typeId: new URL('https://www.w3.org/ns/activitystreams#Note') },
      values: { id: postId },
    };

    await createOnAnnounce(deps)(createCtx(vi.fn(), parsedUri), createActivity(createNote([])));

    expect(followedByLocalActorResolverByActorUri.resolve).not.toHaveBeenCalled();
    expect(addReceivedRepostUseCase.run).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'local', repostedPostId: postId }),
    );
  });

  it('does not check follows for a relay Announce', async () => {
    const { deps, followedByLocalActorResolverByActorUri, federatedTimelineItemCreatedStore } = createDeps({
      status: 'accepted',
      actorUri: 'https://relay.example/actor',
      relayId: 'relay-1',
    }, false);

    await createOnAnnounce(deps)(createCtx(), createActivity(createNote([])));

    expect(followedByLocalActorResolverByActorUri.resolve).not.toHaveBeenCalled();
    expect(federatedTimelineItemCreatedStore.store).toHaveBeenCalledOnce();
  });

  it('saves a federated timeline item from an unfollowed actor Announce when exactly one relay is accepted', async () => {
    const { deps, addReceivedRepostUseCase, federatedTimelineItemCreatedStore, remotePostUpserter } = createDeps(
      undefined,
      false,
      [{ relayId: 'relay-1', actorUri: 'https://relay.example/actor' }],
    );

    await createOnAnnounce(deps)(createCtx(), createActivity(createNote([])));

    expect(remotePostUpserter.resolve).toHaveBeenCalledOnce();
    expect(federatedTimelineItemCreatedStore.store).toHaveBeenCalledOnce();
    expect(addReceivedRepostUseCase.run).not.toHaveBeenCalled();
  });

  it.each([
    [0, []],
    [2, [{ relayId: 'relay-1' }, { relayId: 'relay-2' }]],
  ])('creates nothing from an unfollowed actor Announce when %i relays are accepted', async (_count, relays) => {
    const { deps, addReceivedRepostUseCase, federatedTimelineItemCreatedStore, remotePostUpserter } = createDeps(
      undefined,
      false,
      relays,
    );

    await createOnAnnounce(deps)(createCtx(), createActivity(createNote([])));

    expect(remotePostUpserter.resolve).not.toHaveBeenCalled();
    expect(federatedTimelineItemCreatedStore.store).not.toHaveBeenCalled();
    expect(addReceivedRepostUseCase.run).not.toHaveBeenCalled();
  });

  it('creates nothing from an unfollowed actor Announce whose object is not a Note', async () => {
    const { deps, addReceivedRepostUseCase, federatedTimelineItemCreatedStore, remotePostUpserter } = createDeps(
      undefined,
      false,
      [{ relayId: 'relay-1' }],
    );
    const activity = {
      ...createActivity(createNote([])),
      getObject: vi.fn(async () => new Person({ id: new URL('https://remote.example/users/alice') })),
    } as unknown as Announce;

    await createOnAnnounce(deps)(createCtx(), activity);

    expect(remotePostUpserter.resolve).not.toHaveBeenCalled();
    expect(federatedTimelineItemCreatedStore.store).not.toHaveBeenCalled();
    expect(addReceivedRepostUseCase.run).not.toHaveBeenCalled();
  });

  it('creates nothing from an unfollowed actor Announce when fetching the object fails', async () => {
    const { deps, addReceivedRepostUseCase, federatedTimelineItemCreatedStore } = createDeps(undefined, false, [
      { relayId: 'relay-1' },
    ]);
    const activity = {
      ...createActivity(createNote([])),
      getObject: vi.fn(async () => {
        throw new Error('fetch failed');
      }),
    } as unknown as Announce;

    await createOnAnnounce(deps)(createCtx(), activity);

    expect(federatedTimelineItemCreatedStore.store).not.toHaveBeenCalled();
    expect(addReceivedRepostUseCase.run).not.toHaveBeenCalled();
  });
});
