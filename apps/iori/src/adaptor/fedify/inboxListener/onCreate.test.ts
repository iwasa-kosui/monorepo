import { Article, Create, Mention, Note, Person, Question } from '@fedify/vocab';
import { FetchError } from '@fedify/vocab-runtime';
import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { FederatedTimelineItemResolverByPostId } from '../../../domain/federatedTimeline/federatedTimelineItem.ts';
import type { RemotePostUpserter } from '../../../domain/post/post.ts';
import type { AcceptedRelaysResolver } from '../../../domain/relay/relay.ts';
import { createOnCreate } from './onCreate.ts';

const followersId = new URL('https://remote.example/users/alice/followers');
const publicUri = new URL('https://www.w3.org/ns/activitystreams#Public');
const origin = 'https://iori.test';
const kosuiId = new URL('https://iori.test/users/kosui');
const actorId = new URL('https://remote.example/users/alice');
const noRecipients = { toIds: [], ccIds: [], btoIds: [], bccIds: [], audienceIds: [] };

const forwardingDeps = (followed = true, acceptedRelays: unknown[] = []) => ({
  followedByLocalActorResolverByActorUri: { resolve: vi.fn(async () => RA.ok(followed)) },
  acceptedRelaysResolver: {
    resolve: vi.fn<AcceptedRelaysResolver['resolve']>(async () => RA.ok(acceptedRelays as never)),
  },
  remotePostUpserter: {
    resolve: vi.fn<RemotePostUpserter['resolve']>(async () => RA.ok({ postId: 'post-1', actorId: 'actor-1' } as never)),
  },
  actorResolverByUri: { resolve: vi.fn(async () => RA.ok({ id: 'actor-1' } as never)) },
  federatedTimelineItemResolverByPostId: {
    resolve: vi.fn<FederatedTimelineItemResolverByPostId['resolve']>(async () => RA.ok(undefined)),
  },
  federatedTimelineItemCreatedStore: {
    store: vi.fn(async (..._events: readonly unknown[]) => RA.ok(undefined)),
  },
});

const createCtx = (parsedUri: unknown = null) =>
  ({ lookupObject: vi.fn(), parseUri: vi.fn(() => parsedUri), documentLoader: vi.fn() }) as never;

describe('createOnCreate', () => {
  it('awaits recursive reply fetching before resolving', async () => {
    let finishFetch: ((value: unknown) => void) | undefined;
    const fetchReplyNotesRecursiveUseCase = {
      run: vi.fn(() =>
        new Promise((resolve) => {
          finishFetch = resolve;
        })
      ),
    };
    const note = new Note({
      id: new URL('https://remote.example/posts/reply'),
      content: '<p>reply</p>',
      replyTarget: new URL('https://remote.example/posts/parent'),
    });
    const activity = {
      actorId,
      getObject: vi.fn(async () => note),
      ...noRecipients,
    } as unknown as Create;
    const listener = createOnCreate({
      origin,
      ...forwardingDeps(),
      inboxActorResolver: {
        resolve: async () =>
          RA.ok({
            actor: { followersId: followersId } as never,
            actorIdentity: {} as never,
            documentLoaderOptions: { documentLoader: vi.fn() as never },
          }),
      } as never,
      addRemotePostUseCase: {
        run: async () => RA.ok({ actor: { uri: 'https://remote.example/users/alice' } } as never),
      },
      fetchReplyNotesRecursiveUseCase: fetchReplyNotesRecursiveUseCase as never,
    });

    let settled = false;
    const processing = listener(createCtx(), activity).then(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(fetchReplyNotesRecursiveUseCase.run).toHaveBeenCalledOnce());
    expect(settled).toBe(false);

    finishFetch?.(RA.ok({ fetchedPosts: [] }));
    await processing;
    expect(settled).toBe(true);
  });

  const run = async (note: Note | Article | Question | Person, activity?: Partial<Create>) => {
    const addRemotePostUseCase = {
      run: vi.fn(async () => RA.ok({ actor: { uri: 'https://remote.example/users/alice' } } as never)),
    };
    const listener = createOnCreate({
      origin,
      ...forwardingDeps(),
      inboxActorResolver: {
        resolve: async () =>
          RA.ok({
            actor: { followersId } as never,
            actorIdentity: {} as never,
            documentLoaderOptions: { documentLoader: vi.fn() as never },
          }),
      } as never,
      addRemotePostUseCase: addRemotePostUseCase as never,
      fetchReplyNotesRecursiveUseCase: { run: vi.fn() } as never,
    });
    const create = {
      actorId,
      getObject: vi.fn(async () => note),
      ...noRecipients,
      ...activity,
    } as unknown as Create;
    await listener(createCtx(), create);
    return addRemotePostUseCase.run;
  };

  it('does not throw when the post is owned by another actor', async () => {
    const note = new Note({ id: new URL('https://remote.example/posts/1'), content: 'hi' });
    const addRemotePostUseCase = {
      run: vi.fn(async () =>
        RA.err({
          type: 'RemotePostAuthorMismatchError',
          message: 'mismatch',
          detail: { uri: 'https://remote.example/posts/1', existingActorId: 'actor-other', actorId: 'actor-alice' },
        })
      ),
    };
    const fetchReplyNotesRecursiveUseCase = { run: vi.fn() };
    const listener = createOnCreate({
      origin,
      ...forwardingDeps(),
      inboxActorResolver: {
        resolve: async () =>
          RA.ok({
            actor: { followersId } as never,
            actorIdentity: {} as never,
            documentLoaderOptions: { documentLoader: vi.fn() as never },
          }),
      } as never,
      addRemotePostUseCase: addRemotePostUseCase as never,
      fetchReplyNotesRecursiveUseCase: fetchReplyNotesRecursiveUseCase as never,
    });
    const create = { actorId, getObject: vi.fn(async () => note), ...noRecipients } as unknown as Create;

    await expect(listener(createCtx(), create)).resolves.toBeUndefined();

    expect(fetchReplyNotesRecursiveUseCase.run).not.toHaveBeenCalled();
  });

  it.each<[string, { tos?: URL[]; ccs?: URL[] }]>([
    ['public', { tos: [publicUri], ccs: [followersId] }],
    ['unlisted', { tos: [followersId], ccs: [publicUri] }],
    ['private', { tos: [followersId] }],
    ['direct', { tos: [new URL('https://remote.example/users/bob')] }],
  ])('records %s from the to and cc of the Note', async (expected, addressing) => {
    const note = new Note({ id: new URL('https://remote.example/posts/1'), content: 'hi', ...addressing });

    const addRemotePost = await run(note);

    expect(addRemotePost).toHaveBeenCalledWith(expect.objectContaining({ visibility: expected }));
  });

  it('falls back to the to and cc of the Create when the Note has none', async () => {
    const note = new Note({ id: new URL('https://remote.example/posts/1'), content: 'hi' });

    const addRemotePost = await run(note, { toIds: [followersId], ccIds: [publicUri] });

    expect(addRemotePost).toHaveBeenCalledWith(expect.objectContaining({ visibility: 'unlisted' }));
  });

  it('records null when neither the Note nor the Create has to and cc', async () => {
    const note = new Note({ id: new URL('https://remote.example/posts/1'), content: 'hi' });

    const addRemotePost = await run(note);

    expect(addRemotePost).toHaveBeenCalledWith(expect.objectContaining({ visibility: null }));
  });

  it('records only the local actors addressed by the Note and the Create', async () => {
    const note = new Note({
      id: new URL('https://remote.example/posts/1'),
      content: 'hi',
      tos: [kosuiId, followersId],
      ccs: [publicUri],
      bccs: [new URL('https://iori.test/users/hanako')],
    });

    const addRemotePost = await run(note, { btoIds: [new URL('https://iori.test/users/taro')] });

    expect(addRemotePost).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientActorUris: [
          'https://iori.test/users/kosui',
          'https://iori.test/users/hanako',
          'https://iori.test/users/taro',
        ],
      }),
    );
  });

  it('records the summary and sensitive flag of the Note', async () => {
    const note = new Note({
      id: new URL('https://remote.example/posts/1'),
      content: 'hi',
      summary: 'ネタバレ注意',
      sensitive: true,
    });

    const addRemotePost = await run(note);

    expect(addRemotePost).toHaveBeenCalledWith(expect.objectContaining({ summary: 'ネタバレ注意', sensitive: true }));
  });

  it('records null and false when the Note has no content warning', async () => {
    const note = new Note({ id: new URL('https://remote.example/posts/1'), content: 'hi' });

    const addRemotePost = await run(note);

    expect(addRemotePost).toHaveBeenCalledWith(expect.objectContaining({ summary: null, sensitive: false }));
  });

  it('records an Article with its name and content', async () => {
    const article = new Article({
      id: new URL('https://remote.example/posts/1'),
      name: 'Title',
      content: '<p>body</p>',
      tos: [publicUri],
    });

    const addRemotePost = await run(article);

    expect(addRemotePost).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: 'https://remote.example/posts/1',
        content:
          '<p><strong>Title</strong></p><p>body</p><p><a href="https://remote.example/posts/1">元の記事を読む</a></p>',
        visibility: 'public',
      }),
    );
  });

  it('does not treat the summary of an Article as a content warning', async () => {
    const article = new Article({
      id: new URL('https://remote.example/posts/1'),
      name: 'Title',
      content: '<p>body</p>',
      summary: '<p>excerpt</p>',
      sensitive: true,
      tos: [publicUri],
    });

    const addRemotePost = await run(article);

    expect(addRemotePost).toHaveBeenCalledWith(expect.objectContaining({ summary: null, sensitive: true }));
  });

  it('records a Question with its options and a link to vote', async () => {
    const question = new Question({
      id: new URL('https://remote.example/posts/1'),
      content: '<p>q</p>',
      exclusiveOptions: [new Note({ name: 'a' }), new Note({ name: 'b' })],
    });

    const addRemotePost = await run(question);

    expect(addRemotePost).toHaveBeenCalledWith(
      expect.objectContaining({
        content:
          '<p>q</p><ul><li>a</li><li>b</li></ul><p><a href="https://remote.example/posts/1">元の投稿で投票する</a></p>',
      }),
    );
  });

  it('ignores an object that is not a Note, an Article or a Question', async () => {
    const addRemotePost = await run(new Person({ id: new URL('https://remote.example/users/bob') }));

    expect(addRemotePost).not.toHaveBeenCalled();
  });

  it('records no recipients when no local actor is addressed', async () => {
    const note = new Note({ id: new URL('https://remote.example/posts/1'), content: 'hi', tos: [publicUri] });

    const addRemotePost = await run(note);

    expect(addRemotePost).toHaveBeenCalledWith(expect.objectContaining({ recipientActorUris: [] }));
  });

  it('passes the hrefs of the Mention tags of the Note as the mentioned actors', async () => {
    const bob = new URL('https://other.example/users/bob');
    const note = new Note({
      id: new URL('https://remote.example/posts/1'),
      content: 'hi',
      tos: [bob, kosuiId],
      tags: [new Mention({ href: bob }), new Mention({ href: kosuiId })],
    });

    const addRemotePost = await run(note);

    expect(addRemotePost).toHaveBeenCalledWith(
      expect.objectContaining({ mentionedActorUris: [bob.href, kosuiId.href] }),
    );
  });

  describe('Create from an actor no local actor follows', () => {
    const alice = new Person({
      id: new URL('https://remote.example/users/alice'),
      inbox: new URL('https://remote.example/users/alice/inbox'),
      preferredUsername: 'alice',
    });
    const createNote = (addressing: { tos?: URL[]; ccs?: URL[] } = { tos: [publicUri] }, replyTarget?: URL) =>
      new Note({
        id: new URL('https://remote.example/posts/1'),
        content: 'hi',
        attribution: alice,
        replyTarget,
        ...addressing,
      });
    const setup = (followed: boolean, acceptedRelays: unknown[] = []) => {
      const forwarding = forwardingDeps(followed, acceptedRelays);
      const addRemotePostUseCase = {
        run: vi.fn(async () => RA.ok({ actor: { uri: 'https://remote.example/users/alice' } } as never)),
      };
      const fetchReplyNotesRecursiveUseCase = { run: vi.fn(async () => RA.ok({ fetchedPosts: [] })) };
      const listener = createOnCreate({
        origin,
        ...forwarding,
        inboxActorResolver: {
          resolve: async () =>
            RA.ok({
              actor: { followersId } as never,
              actorIdentity: {} as never,
              documentLoaderOptions: { documentLoader: vi.fn() as never },
            }),
        } as never,
        addRemotePostUseCase: addRemotePostUseCase as never,
        fetchReplyNotesRecursiveUseCase: fetchReplyNotesRecursiveUseCase as never,
      });
      const create = (note: Note) =>
        ({
          id: new URL('https://remote.example/activities/1'),
          actorId: alice.id,
          getObject: vi.fn(async () => note),
          ...noRecipients,
        }) as unknown as Create;
      return { ...forwarding, addRemotePostUseCase, fetchReplyNotesRecursiveUseCase, listener, create };
    };

    it('adds the post through addRemotePostUseCase when a local actor follows the actor', async () => {
      const { listener, create, addRemotePostUseCase, followedByLocalActorResolverByActorUri } = setup(true);

      await listener(createCtx(), create(createNote()));

      expect(followedByLocalActorResolverByActorUri.resolve).toHaveBeenCalledWith({
        actorUri: 'https://remote.example/users/alice',
      });
      expect(addRemotePostUseCase.run).toHaveBeenCalledOnce();
    });

    it('saves a public Create to the federated timeline when exactly one relay is accepted', async () => {
      const { listener, create, addRemotePostUseCase, remotePostUpserter, federatedTimelineItemCreatedStore } = setup(
        false,
        [{ relayId: 'relay-1' }],
      );

      await listener(createCtx(), create(createNote()));

      expect(addRemotePostUseCase.run).not.toHaveBeenCalled();
      expect(remotePostUpserter.resolve).toHaveBeenCalledOnce();
      expect(federatedTimelineItemCreatedStore.store).toHaveBeenCalledOnce();
    });

    it('saves an unlisted Create to the federated timeline when exactly one relay is accepted', async () => {
      const { listener, create, federatedTimelineItemCreatedStore } = setup(false, [{ relayId: 'relay-1' }]);

      await listener(createCtx(), create(createNote({ tos: [followersId], ccs: [publicUri] })));

      expect(federatedTimelineItemCreatedStore.store).toHaveBeenCalledOnce();
    });

    it.each<[string, URL | undefined, string | null]>([
      ['the reply target', new URL('https://remote.example/p/0'), 'https://remote.example/p/0'],
      ['null for a Create that is not a reply', undefined, null],
    ])('passes %s as inReplyToUri when saving to the federated timeline', async (_name, replyTarget, expected) => {
      const { listener, create, remotePostUpserter } = setup(false, [{ relayId: 'relay-1' }]);

      await listener(createCtx(), create(createNote({ tos: [publicUri] }, replyTarget)));

      expect(remotePostUpserter.resolve).toHaveBeenCalledWith(expect.objectContaining({ inReplyToUri: expected }));
    });

    it('does not fetch the reply thread when saving to the federated timeline', async () => {
      const { listener, create, fetchReplyNotesRecursiveUseCase } = setup(false, [{ relayId: 'relay-1' }]);

      await listener(createCtx(), create(createNote({ tos: [publicUri] }, new URL('https://remote.example/p/0'))));

      expect(fetchReplyNotesRecursiveUseCase.run).not.toHaveBeenCalled();
    });

    describe('url', () => {
      it('passes the url of the Note to addRemotePostUseCase', async () => {
        const { listener, create, addRemotePostUseCase } = setup(true);
        const note = new Note({
          id: new URL('https://remote.example/posts/1'),
          url: new URL('https://remote.example/@alice/1'),
          content: 'hello',
          attribution: alice,
          tos: [publicUri],
        });

        await listener(createCtx(), create(note));

        expect(addRemotePostUseCase.run).toHaveBeenCalledWith(
          expect.objectContaining({ url: 'https://remote.example/@alice/1' }),
        );
      });

      it('passes null when the Note has no url', async () => {
        const { listener, create, addRemotePostUseCase } = setup(true);

        await listener(createCtx(), create(createNote()));

        expect(addRemotePostUseCase.run).toHaveBeenCalledWith(expect.objectContaining({ url: null }));
      });
    });

    describe('quote', () => {
      const quoteId = new URL('https://other.example/notes/quoted');
      const quotingNote = () =>
        new Note({
          id: new URL('https://remote.example/posts/1'),
          content: 'quoting',
          attribution: alice,
          tos: [publicUri],
          quote: quoteId,
        });

      it('passes the quoted note URI to addRemotePostUseCase', async () => {
        const { listener, create, addRemotePostUseCase } = setup(true);

        await listener(createCtx(), create(quotingNote()));

        expect(addRemotePostUseCase.run).toHaveBeenCalledWith(
          expect.objectContaining({ quoteUri: 'https://other.example/notes/quoted' }),
        );
      });

      it('passes null when the Note quotes nothing', async () => {
        const { listener, create, addRemotePostUseCase } = setup(true);

        await listener(createCtx(), create(createNote()));

        expect(addRemotePostUseCase.run).toHaveBeenCalledWith(expect.objectContaining({ quoteUri: null }));
      });

      it('fetches only the quoted note, one level deep, after saving the post', async () => {
        const { listener, create, addRemotePostUseCase, fetchReplyNotesRecursiveUseCase } = setup(true);

        await listener(createCtx(), create(quotingNote()));

        expect(fetchReplyNotesRecursiveUseCase.run).toHaveBeenCalledOnce();
        expect(fetchReplyNotesRecursiveUseCase.run).toHaveBeenCalledWith(
          expect.objectContaining({ inReplyToUri: 'https://other.example/notes/quoted', maxDepth: 1 }),
        );
        expect(addRemotePostUseCase.run.mock.invocationCallOrder[0]).toBeLessThan(
          fetchReplyNotesRecursiveUseCase.run.mock.invocationCallOrder[0]!,
        );
      });

      it('does not fetch a quoted note when the Note quotes nothing', async () => {
        const { listener, create, fetchReplyNotesRecursiveUseCase } = setup(true);

        await listener(createCtx(), create(createNote()));

        expect(fetchReplyNotesRecursiveUseCase.run).not.toHaveBeenCalled();
      });

      it('fetches the reply target and the quoted note separately', async () => {
        const { listener, create, fetchReplyNotesRecursiveUseCase } = setup(true);
        const note = new Note({
          id: new URL('https://remote.example/posts/1'),
          content: 'quoting reply',
          attribution: alice,
          tos: [publicUri],
          replyTarget: new URL('https://remote.example/p/0'),
          quote: quoteId,
        });

        await listener(createCtx(), create(note));

        expect(fetchReplyNotesRecursiveUseCase.run.mock.calls.map((call: readonly unknown[]) => call[0])).toEqual([
          expect.objectContaining({ inReplyToUri: 'https://remote.example/p/0' }),
          expect.objectContaining({ inReplyToUri: 'https://other.example/notes/quoted', maxDepth: 1 }),
        ]);
      });

      it('still succeeds when fetching the quoted note throws', async () => {
        const { listener, create, addRemotePostUseCase, fetchReplyNotesRecursiveUseCase } = setup(true);
        fetchReplyNotesRecursiveUseCase.run.mockRejectedValueOnce(new Error('lookup failed'));

        await expect(listener(createCtx(), create(quotingNote()))).resolves.not.toThrow();

        expect(addRemotePostUseCase.run).toHaveBeenCalledOnce();
      });

      it('passes the quoted note URI when saving to the federated timeline, without fetching the quoted note', async () => {
        const { listener, create, remotePostUpserter, fetchReplyNotesRecursiveUseCase } = setup(false, [
          { relayId: 'relay-1' },
        ]);

        await listener(createCtx(), create(quotingNote()));

        expect(remotePostUpserter.resolve).toHaveBeenCalledWith(
          expect.objectContaining({ quoteUri: 'https://other.example/notes/quoted' }),
        );
        expect(fetchReplyNotesRecursiveUseCase.run).not.toHaveBeenCalled();
      });
    });

    it.each([
      [0, []],
      [2, [{ relayId: 'relay-1' }, { relayId: 'relay-2' }]],
    ])('saves nothing when %i relays are accepted', async (_count, relays) => {
      const { listener, create, addRemotePostUseCase, remotePostUpserter, federatedTimelineItemCreatedStore } = setup(
        false,
        relays,
      );

      await listener(createCtx(), create(createNote()));

      expect(addRemotePostUseCase.run).not.toHaveBeenCalled();
      expect(remotePostUpserter.resolve).not.toHaveBeenCalled();
      expect(federatedTimelineItemCreatedStore.store).not.toHaveBeenCalled();
    });

    it('rejects without saving anything when resolving the accepted relays fails', async () => {
      const {
        listener,
        create,
        addRemotePostUseCase,
        acceptedRelaysResolver,
        remotePostUpserter,
        federatedTimelineItemCreatedStore,
      } = setup(false, [{ relayId: 'relay-1' }]);
      acceptedRelaysResolver.resolve.mockRejectedValue(new Error('db down'));

      await expect(listener(createCtx(), create(createNote()))).rejects.toThrow();

      expect(addRemotePostUseCase.run).not.toHaveBeenCalled();
      expect(remotePostUpserter.resolve).not.toHaveBeenCalled();
      expect(federatedTimelineItemCreatedStore.store).not.toHaveBeenCalled();
    });

    it('adds the post through addRemotePostUseCase when a local actor is addressed', async () => {
      const { listener, create, addRemotePostUseCase, followedByLocalActorResolverByActorUri } = setup(false, [
        { relayId: 'relay-1' },
      ]);

      await listener(createCtx(), create(createNote({ tos: [kosuiId] })));

      expect(followedByLocalActorResolverByActorUri.resolve).not.toHaveBeenCalled();
      expect(addRemotePostUseCase.run).toHaveBeenCalledOnce();
    });

    it.each(['Note', 'Article'])(
      'adds the post through addRemotePostUseCase when replying to a local %s',
      async (kind) => {
        const { listener, create, addRemotePostUseCase, followedByLocalActorResolverByActorUri } = setup(false, [
          { relayId: 'relay-1' },
        ]);
        const parsedUri = {
          type: 'object',
          class: { typeId: new URL(`https://www.w3.org/ns/activitystreams#${kind}`) },
          values: { id: '00000000-0000-4000-8000-000000000001' },
        };
        const note = createNote({ tos: [publicUri] }, new URL('https://iori.test/users/kosui/posts/1'));

        await listener(createCtx(parsedUri), create(note));

        expect(followedByLocalActorResolverByActorUri.resolve).not.toHaveBeenCalled();
        expect(addRemotePostUseCase.run).toHaveBeenCalledOnce();
      },
    );

    it.each<[string, { tos?: URL[]; ccs?: URL[] }]>([
      ['followers-only', { tos: [followersId] }],
      ['direct', { tos: [new URL('https://remote.example/users/bob')] }],
    ])('saves nothing for a %s Create', async (_name, addressing) => {
      const { listener, create, addRemotePostUseCase, remotePostUpserter, federatedTimelineItemCreatedStore } = setup(
        false,
        [{ relayId: 'relay-1' }],
      );

      await listener(createCtx(), create(createNote(addressing)));

      expect(addRemotePostUseCase.run).not.toHaveBeenCalled();
      expect(remotePostUpserter.resolve).not.toHaveBeenCalled();
      expect(federatedTimelineItemCreatedStore.store).not.toHaveBeenCalled();
    });

    it.each<[string, URL | undefined]>([
      ['is another user of the same origin', new URL('https://remote.example/users/mallory')],
      ['is missing', undefined],
    ])('saves nothing when the author of the Note %s', async (_name, attribution) => {
      const {
        listener,
        create,
        addRemotePostUseCase,
        remotePostUpserter,
        federatedTimelineItemCreatedStore,
      } = setup(false, [{ relayId: 'relay-1' }]);
      const note = new Note({
        id: new URL('https://remote.example/posts/1'),
        content: 'hi',
        attribution,
        tos: [publicUri],
      });

      await listener(createCtx(), create(note));

      expect(addRemotePostUseCase.run).not.toHaveBeenCalled();
      expect(remotePostUpserter.resolve).not.toHaveBeenCalled();
      expect(federatedTimelineItemCreatedStore.store).not.toHaveBeenCalled();
    });

    it('does not throw nor save to the federated timeline when fetching the author fails', async () => {
      const { listener, create, remotePostUpserter, federatedTimelineItemCreatedStore } = setup(false, [
        { relayId: 'relay-1' },
      ]);
      const note = createNote();
      vi.spyOn(note, 'getAttribution').mockRejectedValue(
        new FetchError('https://remote.example/users/alice', 'HTTP 410'),
      );

      await expect(listener(createCtx(), create(note))).resolves.toBeUndefined();

      expect(remotePostUpserter.resolve).not.toHaveBeenCalled();
      expect(federatedTimelineItemCreatedStore.store).not.toHaveBeenCalled();
    });

    it('rethrows an error other than a fetch failure while saving to the federated timeline', async () => {
      const { listener, create, remotePostUpserter } = setup(false, [{ relayId: 'relay-1' }]);
      const error = new Error('db down');
      remotePostUpserter.resolve.mockRejectedValue(error);

      await expect(listener(createCtx(), create(createNote()))).rejects.toBe(error);
    });

    it('rejects without saving anything when checking whether a local actor follows the actor fails', async () => {
      const {
        listener,
        create,
        addRemotePostUseCase,
        followedByLocalActorResolverByActorUri,
        federatedTimelineItemCreatedStore,
      } = setup(false, [{ relayId: 'relay-1' }]);
      followedByLocalActorResolverByActorUri.resolve.mockResolvedValue(RA.err(new Error('db down')) as never);

      await expect(listener(createCtx(), create(createNote()))).rejects.toThrow();

      expect(addRemotePostUseCase.run).not.toHaveBeenCalled();
      expect(federatedTimelineItemCreatedStore.store).not.toHaveBeenCalled();
    });
  });
});
