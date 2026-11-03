import { type Announce, Document, Note, Person } from '@fedify/fedify';
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

const createCtx = (documentLoader: unknown = vi.fn()) =>
  ({
    parseUri: vi.fn(() => null),
    documentLoader,
  }) as never;

const createDeps = (relay: unknown) => {
  const documentLoader = vi.fn();
  const addReceivedRepostUseCase = {
    run: vi.fn(async () => RA.ok({ actor: { uri: 'https://announcer.example/users/bob' } })),
  };
  const remotePostUpserter = {
    resolve: vi.fn(async () => RA.ok({ postId: 'post-1' })),
  };
  const federatedTimelineItemResolverByPostId = { resolve: vi.fn(async () => RA.ok(undefined)) };
  const federatedTimelineItemCreatedStore = { store: vi.fn(async () => RA.ok(undefined)) };
  const deps = {
    origin: 'https://iori.test',
    relayResolverByActorUri: { resolve: vi.fn(async () => RA.ok(relay)) },
    inboxActorResolver: {
      resolve: vi.fn(async () =>
        RA.ok({
          actorIdentity: { uri: 'https://announcer.example/users/bob' },
          documentLoaderOptions: { documentLoader },
        })
      ),
    },
    addReceivedRepostUseCase,
    remotePostUpserter,
    federatedTimelineItemResolverByPostId,
    federatedTimelineItemCreatedStore,
  };
  return { deps: deps as never, documentLoader, addReceivedRepostUseCase, remotePostUpserter };
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
});
