import { Create, Note } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { createOnCreate } from './onCreate.ts';

const followersId = new URL('https://remote.example/users/alice/followers');
const publicUri = new URL('https://www.w3.org/ns/activitystreams#Public');
const origin = 'https://iori.test';
const kosuiId = new URL('https://iori.test/users/kosui');
const noRecipients = { toIds: [], ccIds: [], btoIds: [], bccIds: [], audienceIds: [] };

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
      getObject: vi.fn(async () => note),
      ...noRecipients,
    } as unknown as Create;
    const listener = createOnCreate({
      origin,
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
    const processing = listener({ lookupObject: vi.fn() } as never, activity).then(() => {
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
      getObject: vi.fn(async () => note),
      ...noRecipients,
      ...activity,
    } as unknown as Create;
    await listener({ lookupObject: vi.fn() } as never, create);
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
    const create = { getObject: vi.fn(async () => note), ...noRecipients } as unknown as Create;

    await expect(listener({ lookupObject: vi.fn() } as never, create)).resolves.toBeUndefined();

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
});
