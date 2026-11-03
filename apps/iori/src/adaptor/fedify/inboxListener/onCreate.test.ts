import { Create, Note } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { createOnCreate } from './onCreate.ts';

const followersId = new URL('https://remote.example/users/alice/followers');
const publicUri = new URL('https://www.w3.org/ns/activitystreams#Public');

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
      toIds: [],
      ccIds: [],
    } as unknown as Create;
    const listener = createOnCreate({
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
      toIds: [],
      ccIds: [],
      ...activity,
    } as unknown as Create;
    await listener({ lookupObject: vi.fn() } as never, create);
    return addRemotePostUseCase.run;
  };

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
});
