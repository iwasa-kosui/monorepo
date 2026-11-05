import { Create, Note, Person } from '@fedify/vocab';
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
    resolve: vi.fn<RemotePostUpserter['resolve']>(async () => RA.ok({ postId: 'post-1' } as never)),
  },
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

  const run = async (note: Note, activity?: Partial<Create>) => {
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

  it('records no recipients when no local actor is addressed', async () => {
    const note = new Note({ id: new URL('https://remote.example/posts/1'), content: 'hi', tos: [publicUri] });

    const addRemotePost = await run(note);

    expect(addRemotePost).toHaveBeenCalledWith(expect.objectContaining({ recipientActorUris: [] }));
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
