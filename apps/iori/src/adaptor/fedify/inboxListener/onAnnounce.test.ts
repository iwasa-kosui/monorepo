import { type Announce, Collection, Document, Note, Person, Question } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { INSTANCE_ACTOR_IDENTIFIER } from '../sharedKeyDispatcher.ts';
import { createOnAnnounce } from './onAnnounce.ts';

const signedDocumentLoader = vi.fn();

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

const createCtx = (documentLoader: unknown = vi.fn(), parsedUri: unknown = null, recipient: string | null = null) =>
  ({
    parseUri: vi.fn(() => parsedUri),
    documentLoader,
    recipient,
    getDocumentLoader: vi.fn(async () => signedDocumentLoader),
  }) as never;

const createLocalActivity = (objectUri: string) =>
  ({
    id: new URL('https://announcer.example/activities/2'),
    actorId: new URL('https://announcer.example/users/bob'),
    objectId: new URL(objectUri),
    getObject: vi.fn(),
  }) as unknown as Announce;

const createLocalCtx = (className: 'Note' | 'Article', id: string) =>
  ({
    parseUri: vi.fn(() => ({
      type: 'object',
      class: { typeId: new URL(`https://www.w3.org/ns/activitystreams#${className}`) },
      values: { identifier: 'kosui', id },
    })),
    documentLoader: vi.fn(),
  }) as never;

const createDeps = (
  relay: unknown,
  followed = true,
  acceptedRelays: unknown[] = [],
  article: unknown = undefined,
  isBlockedUri: (uri: string) => boolean = () => false,
) => {
  const documentLoader = vi.fn();
  const addReceivedRepostUseCase = {
    run: vi.fn(async () => RA.ok({ actor: { uri: 'https://announcer.example/users/bob' } })),
  };
  const remotePostUpserter = {
    resolve: vi.fn(async () => RA.ok({ postId: 'post-1', actorId: 'actor-1' })),
  };
  const actorResolverByUri = { resolve: vi.fn(async () => RA.ok({ id: 'actor-1' })) };
  const articleResolver = { resolve: vi.fn(async () => RA.ok(article)) };
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
    articleResolver,
    remotePostUpserter,
    actorResolverByUri,
    federatedTimelineItemResolverByPostId,
    federatedTimelineItemCreatedStore,
    isBlockedUri,
  };
  return {
    deps: deps as never,
    documentLoader,
    addReceivedRepostUseCase,
    remotePostUpserter,
    articleResolver,
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
          attachments: [{ url: 'https://remote.example/media/1.png', altText: null, mediaType: 'image/png' }],
        }),
      }),
    );
  });

  it('passes the quoted note URI of a remote Announce to addReceivedRepostUseCase', async () => {
    const { deps, addReceivedRepostUseCase } = createDeps(undefined);
    const note = createNote([]).clone({ quote: new URL('https://other.example/notes/quoted') });

    await createOnAnnounce(deps)(createCtx(), createActivity(note));

    expect(addReceivedRepostUseCase.run).toHaveBeenCalledWith(
      expect.objectContaining({
        remotePostIdentity: expect.objectContaining({ quoteUri: 'https://other.example/notes/quoted' }),
      }),
    );
  });

  it('passes the poll of an announced Question to addReceivedRepostUseCase', async () => {
    const { deps, addReceivedRepostUseCase } = createDeps(undefined);
    const note = createNote([]);
    const question = new Question({
      id: new URL('https://remote.example/notes/2'),
      content: '<p>q</p>',
      attribution: await note.getAttribution(),
      exclusiveOptions: [new Note({ name: 'a', replies: new Collection({ totalItems: 4 }) })],
    });

    await createOnAnnounce(deps)(createCtx(), createActivity(question as unknown as Note));

    expect(addReceivedRepostUseCase.run).toHaveBeenCalledWith(
      expect.objectContaining({
        remotePostIdentity: expect.objectContaining({
          content: '<p>q</p><p><a href="https://remote.example/notes/2">元の投稿で投票する</a></p>',
          poll: {
            multiple: false,
            options: [{ title: 'a', votesCount: 4 }],
            votersCount: null,
            expiresAt: null,
            closed: false,
          },
        }),
      }),
    );
  });

  it('fetches the object of a remote Announce with the document loader of the inbox actor resolver', async () => {
    const { deps, documentLoader } = createDeps(undefined);
    const activity = createActivity(createNote([]));

    await createOnAnnounce(deps)(createCtx(), activity);

    expect(activity.getObject).toHaveBeenCalledWith({ documentLoader });
  });

  it('fetches the object of a relay Announce with the document loader signed by the recipient', async () => {
    const { deps } = createDeps({ status: 'accepted', actorUri: 'https://relay.example/actor' });
    const ctx = createCtx(vi.fn(), null, 'kosui');
    const activity = createActivity(createNote([]));

    await createOnAnnounce(deps)(ctx, activity);

    expect((ctx as { getDocumentLoader: unknown }).getDocumentLoader).toHaveBeenCalledWith({ identifier: 'kosui' });
    expect(activity.getObject).toHaveBeenCalledWith({ documentLoader: signedDocumentLoader });
  });

  it('fetches the object of a relay Announce with the document loader signed by the instance actor on the shared inbox', async () => {
    const { deps } = createDeps({ status: 'accepted', actorUri: 'https://relay.example/actor' });
    const ctx = createCtx();
    const activity = createActivity(createNote([]));

    await createOnAnnounce(deps)(ctx, activity);

    expect((ctx as { getDocumentLoader: unknown }).getDocumentLoader).toHaveBeenCalledWith({
      identifier: INSTANCE_ACTOR_IDENTIFIER,
    });
    expect(activity.getObject).toHaveBeenCalledWith({ documentLoader: signedDocumentLoader });
  });

  it('fetches the object of an unfollowed actor Announce with the signed document loader', async () => {
    const { deps } = createDeps(undefined, false, [{ relayId: 'relay-1', actorUri: 'https://relay.example/actor' }]);
    const ctx = createCtx(vi.fn(), null, 'kosui');
    const activity = createActivity(createNote([]));

    await createOnAnnounce(deps)(ctx, activity);

    expect((ctx as { getDocumentLoader: unknown }).getDocumentLoader).toHaveBeenCalledWith({ identifier: 'kosui' });
    expect(activity.getObject).toHaveBeenCalledWith({ documentLoader: signedDocumentLoader });
  });

  it('fetches the author and attachments of a remote Announce with the document loader of the inbox actor resolver', async () => {
    const { deps, documentLoader } = createDeps(undefined);
    const note = createNote([]);
    const getAttribution = vi.spyOn(note, 'getAttribution');
    const getAttachments = vi.spyOn(note, 'getAttachments');

    await createOnAnnounce(deps)(createCtx(), createActivity(note));

    expect(getAttribution).toHaveBeenCalledWith({ documentLoader });
    expect(getAttachments).toHaveBeenCalledWith({ documentLoader });
  });

  it('fetches the attachments of a relay Announce with the signed document loader', async () => {
    const { deps, remotePostUpserter } = createDeps({ status: 'accepted', actorUri: 'https://relay.example/actor' });
    const note = createNote([]);
    const getAttachments = vi.spyOn(note, 'getAttachments');

    await createOnAnnounce(deps)(createCtx(), createActivity(note));

    expect(remotePostUpserter.resolve).toHaveBeenCalledOnce();
    expect(getAttachments).toHaveBeenCalledWith({ documentLoader: signedDocumentLoader });
  });

  it('fetches the attachments of an unfollowed actor Announce with the signed document loader', async () => {
    const { deps, remotePostUpserter } = createDeps(undefined, false, [
      { relayId: 'relay-1', actorUri: 'https://relay.example/actor' },
    ]);
    const note = createNote([]);
    const getAttachments = vi.spyOn(note, 'getAttachments');

    await createOnAnnounce(deps)(createCtx(), createActivity(note));

    expect(remotePostUpserter.resolve).toHaveBeenCalledOnce();
    expect(getAttachments).toHaveBeenCalledWith({ documentLoader: signedDocumentLoader });
  });

  it('passes attachments of a relay Announce to remotePostUpserter', async () => {
    const { deps, remotePostUpserter } = createDeps({ status: 'accepted', actorUri: 'https://relay.example/actor' });
    const note = createNote(imageAttachments);

    await createOnAnnounce(deps)(createCtx(), createActivity(note));

    expect(remotePostUpserter.resolve).toHaveBeenCalledOnce();
    expect(remotePostUpserter.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: 'https://remote.example/notes/1',
        attachments: [{ url: 'https://remote.example/media/1.png', altText: null, mediaType: 'image/png' }],
      }),
    );
  });

  it('records the summary and sensitive of the announced Note in a remote Announce', async () => {
    const { deps, addReceivedRepostUseCase } = createDeps(undefined);
    const note = createNote([]).clone({ summary: 'spoiler', sensitive: true });

    await createOnAnnounce(deps)(createCtx(), createActivity(note));

    expect(addReceivedRepostUseCase.run).toHaveBeenCalledWith(
      expect.objectContaining({
        remotePostIdentity: expect.objectContaining({ summary: 'spoiler', sensitive: true }),
      }),
    );
  });

  it('passes the profile of the announced Note author in a remote Announce', async () => {
    const { deps, addReceivedRepostUseCase } = createDeps(undefined);
    const note = createNote([]).clone({
      attribution: new Person({
        id: new URL('https://remote.example/users/alice'),
        inbox: new URL('https://remote.example/users/alice/inbox'),
        preferredUsername: 'alice',
        name: 'Alice',
        summary: '<p>bio</p>',
      }),
    });

    await createOnAnnounce(deps)(createCtx(), createActivity(note));

    expect(addReceivedRepostUseCase.run).toHaveBeenCalledWith(
      expect.objectContaining({
        remotePostIdentity: expect.objectContaining({
          authorIdentity: expect.objectContaining({
            uri: 'https://remote.example/users/alice',
            profile: expect.objectContaining({ displayName: 'Alice', summary: '<p>bio</p>', actorType: 'Person' }),
          }),
        }),
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

    const ctx = { ...(createCtx() as object), getDocumentLoader: vi.fn(async () => ctxDocumentLoader) } as never;

    await createOnAnnounce(deps)(ctx, createActivity(note));

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

  it('does not save a remote Announce whose Note attribution is on another origin', async () => {
    const { deps, addReceivedRepostUseCase } = createDeps(undefined);
    const note = createNote([]).clone({
      attribution: new Person({
        id: new URL('https://other.example/users/alice'),
        inbox: new URL('https://other.example/users/alice/inbox'),
      }),
    });

    await createOnAnnounce(deps)(createCtx(), createActivity(note));

    expect(addReceivedRepostUseCase.run).not.toHaveBeenCalled();
  });

  describe('Announce of a local object', () => {
    const noteId = crypto.randomUUID();
    const articleId = crypto.randomUUID();
    const rootPostId = crypto.randomUUID();
    const noteUri = `https://iori.test/users/kosui/posts/${noteId}`;
    const articleUri = `https://iori.test/users/kosui/articles/${articleId}`;

    it('passes a local Note to the local branch with its post id', async () => {
      const { deps, addReceivedRepostUseCase, articleResolver } = createDeps(undefined);

      await createOnAnnounce(deps)(createLocalCtx('Note', noteId), createLocalActivity(noteUri));

      expect(articleResolver.resolve).not.toHaveBeenCalled();
      expect(addReceivedRepostUseCase.run).toHaveBeenCalledWith({
        type: 'local',
        announceActivityUri: 'https://announcer.example/activities/2',
        repostedPostId: noteId,
        reposterIdentity: { uri: 'https://announcer.example/users/bob' },
      });
    });

    it('passes a local Article to the local branch with the root post id of the article', async () => {
      const { deps, addReceivedRepostUseCase, articleResolver } = createDeps(undefined, true, [], {
        articleId,
        rootPostId,
        status: 'published',
      });

      await createOnAnnounce(deps)(createLocalCtx('Article', articleId), createLocalActivity(articleUri));

      expect(articleResolver.resolve).toHaveBeenCalledWith(articleId);
      expect(addReceivedRepostUseCase.run).toHaveBeenCalledOnce();
      expect(addReceivedRepostUseCase.run).toHaveBeenCalledWith({
        type: 'local',
        announceActivityUri: 'https://announcer.example/activities/2',
        repostedPostId: rootPostId,
        reposterIdentity: { uri: 'https://announcer.example/users/bob' },
      });
    });

    it('stops without calling the use case when the Article has no root post', async () => {
      const { deps, addReceivedRepostUseCase } = createDeps(undefined, true, [], {
        articleId,
        rootPostId: null,
        status: 'published',
      });

      await createOnAnnounce(deps)(createLocalCtx('Article', articleId), createLocalActivity(articleUri));

      expect(addReceivedRepostUseCase.run).not.toHaveBeenCalled();
    });

    it.each(['unpublished', 'draft'] as const)(
      'stops without calling the use case when the Article is %s',
      async (status) => {
        const { deps, addReceivedRepostUseCase } = createDeps(undefined, true, [], { articleId, rootPostId, status });

        await createOnAnnounce(deps)(createLocalCtx('Article', articleId), createLocalActivity(articleUri));

        expect(addReceivedRepostUseCase.run).not.toHaveBeenCalled();
      },
    );

    it('stops without calling the use case when the Article does not exist', async () => {
      const { deps, addReceivedRepostUseCase } = createDeps(undefined, true, [], undefined);

      await createOnAnnounce(deps)(createLocalCtx('Article', articleId), createLocalActivity(articleUri));

      expect(addReceivedRepostUseCase.run).not.toHaveBeenCalled();
    });

    it('stops without calling the use case when the Article id is not a valid id', async () => {
      const { deps, addReceivedRepostUseCase, articleResolver } = createDeps(undefined);

      await createOnAnnounce(deps)(createLocalCtx('Article', 'not-a-uuid'), createLocalActivity(articleUri));

      expect(articleResolver.resolve).not.toHaveBeenCalled();
      expect(addReceivedRepostUseCase.run).not.toHaveBeenCalled();
    });
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

  describe('Announce involving a blocked domain', () => {
    const isBlockedUri = (uri: string) => new URL(uri).hostname === 'blocked.example';
    const relay = { status: 'accepted', actorUri: 'https://relay.example/actor', relayId: 'relay-1' };
    const createBlockedNote = () => createNote([]).clone({ id: new URL('https://blocked.example/notes/1') });
    const createActivityReturning = (note: Note) =>
      ({
        ...createActivity(createNote([])),
        getObject: vi.fn(async () => note),
      }) as unknown as Announce;

    it.each([
      ['remote', undefined, true, []],
      ['relay', relay, true, []],
      ['forwarded', undefined, false, [{ relayId: 'relay-1', actorUri: 'https://relay.example/actor' }]],
    ])('does not fetch or save the object of a %s Announce whose objectId is on a blocked domain', async (
      _path,
      relayValue,
      followed,
      acceptedRelays,
    ) => {
      const { deps, addReceivedRepostUseCase, remotePostUpserter, federatedTimelineItemCreatedStore } = createDeps(
        relayValue,
        followed,
        acceptedRelays,
        undefined,
        isBlockedUri,
      );
      const activity = createActivity(createBlockedNote());

      await expect(createOnAnnounce(deps)(createCtx(), activity)).resolves.toBeUndefined();

      expect(activity.getObject).not.toHaveBeenCalled();
      expect(addReceivedRepostUseCase.run).not.toHaveBeenCalled();
      expect(remotePostUpserter.resolve).not.toHaveBeenCalled();
      expect(federatedTimelineItemCreatedStore.store).not.toHaveBeenCalled();
    });

    it('does not save a remote Announce whose Note id is on a blocked domain', async () => {
      const { deps, addReceivedRepostUseCase, remotePostUpserter } = createDeps(
        undefined,
        true,
        [],
        undefined,
        isBlockedUri,
      );

      await createOnAnnounce(deps)(createCtx(), createActivityReturning(createBlockedNote()));

      expect(addReceivedRepostUseCase.run).not.toHaveBeenCalled();
      expect(remotePostUpserter.resolve).not.toHaveBeenCalled();
    });

    it('does not fetch the author or save a remote Announce whose Note attributionIds are on a blocked domain', async () => {
      const { deps, addReceivedRepostUseCase } = createDeps(undefined, true, [], undefined, isBlockedUri);
      const note = createNote([]).clone({
        attribution: new Person({
          id: new URL('https://blocked.example/users/alice'),
          inbox: new URL('https://blocked.example/users/alice/inbox'),
        }),
      });
      const getAttribution = vi.spyOn(note, 'getAttribution');

      await createOnAnnounce(deps)(createCtx(), createActivityReturning(note));

      expect(getAttribution).not.toHaveBeenCalled();
      expect(addReceivedRepostUseCase.run).not.toHaveBeenCalled();
    });

    it('does not save a relay Announce whose Note id is on a blocked domain', async () => {
      const { deps, remotePostUpserter, federatedTimelineItemCreatedStore } = createDeps(
        relay,
        true,
        [],
        undefined,
        isBlockedUri,
      );
      const note = createBlockedNote();
      const getAttribution = vi.spyOn(note, 'getAttribution');

      await createOnAnnounce(deps)(createCtx(), createActivityReturning(note));

      expect(getAttribution).not.toHaveBeenCalled();
      expect(remotePostUpserter.resolve).not.toHaveBeenCalled();
      expect(federatedTimelineItemCreatedStore.store).not.toHaveBeenCalled();
    });

    it('does not save a forwarded Announce whose Note id is on a blocked domain', async () => {
      const { deps, remotePostUpserter, federatedTimelineItemCreatedStore } = createDeps(
        undefined,
        false,
        [relay],
        undefined,
        isBlockedUri,
      );
      const note = createBlockedNote();
      const getAttribution = vi.spyOn(note, 'getAttribution');

      await createOnAnnounce(deps)(createCtx(), createActivityReturning(note));

      expect(getAttribution).not.toHaveBeenCalled();
      expect(remotePostUpserter.resolve).not.toHaveBeenCalled();
      expect(federatedTimelineItemCreatedStore.store).not.toHaveBeenCalled();
    });

    it('does nothing for an Announce whose actor is on a blocked domain', async () => {
      const {
        deps,
        addReceivedRepostUseCase,
        remotePostUpserter,
        federatedTimelineItemCreatedStore,
        followedByLocalActorResolverByActorUri,
        inboxActorResolver,
      } = createDeps(relay, true, [], undefined, isBlockedUri);
      const activity = {
        ...createActivity(createNote([])),
        actorId: new URL('https://blocked.example/users/bob'),
      } as unknown as Announce;

      await expect(createOnAnnounce(deps)(createCtx(), activity)).resolves.toBeUndefined();

      expect(activity.getObject).not.toHaveBeenCalled();
      expect(followedByLocalActorResolverByActorUri.resolve).not.toHaveBeenCalled();
      expect(inboxActorResolver.resolve).not.toHaveBeenCalled();
      expect(addReceivedRepostUseCase.run).not.toHaveBeenCalled();
      expect(remotePostUpserter.resolve).not.toHaveBeenCalled();
      expect(federatedTimelineItemCreatedStore.store).not.toHaveBeenCalled();
    });
  });
});
