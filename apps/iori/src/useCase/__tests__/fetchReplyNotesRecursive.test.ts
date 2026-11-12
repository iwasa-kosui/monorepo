import { Note, Person } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { FetchReplyNotesRecursiveUseCase } from '../fetchReplyNotesRecursive.ts';

const followersId = new URL('https://remote.example/users/alice/followers');
const publicUri = new URL('https://www.w3.org/ns/activitystreams#Public');

const createNote = (addressing: { tos?: URL[]; ccs?: URL[]; btos?: URL[]; bccs?: URL[] }) =>
  new Note({
    id: new URL('https://remote.example/notes/parent'),
    content: '<p>parent</p>',
    attribution: new Person({
      id: new URL('https://remote.example/users/alice'),
      inbox: new URL('https://remote.example/users/alice/inbox'),
      followers: followersId,
      preferredUsername: 'alice',
    }),
    ...addressing,
  });

const run = async (note: Note) => {
  const remotePostUpserter = { resolve: vi.fn(async () => RA.ok({ postId: 'post-1' } as never)) };
  const useCase = FetchReplyNotesRecursiveUseCase.create({
    origin: 'https://iori.test',
    postResolverByUri: { resolve: async () => RA.ok(undefined) },
    localPostResolverByUri: { resolve: async () => RA.ok(undefined) },
    remotePostUpserter,
  });
  await useCase.run({
    inReplyToUri: 'https://remote.example/notes/parent',
    documentLoader: vi.fn() as never,
    lookupObject: async () => note,
  });
  return remotePostUpserter.resolve;
};

describe('FetchReplyNotesRecursiveUseCase', () => {
  it('records the visibility of a fetched reply Note', async () => {
    const upsert = await run(createNote({ tos: [followersId] }));

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ visibility: 'private' }));
  });

  it('records public when the fetched Note is addressed to as:Public', async () => {
    const upsert = await run(createNote({ tos: [publicUri] }));

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ visibility: 'public' }));
  });

  it('records null when the fetched Note has no to and cc', async () => {
    const upsert = await run(createNote({}));

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ visibility: null }));
  });

  it('records the local actors addressed by the fetched Note', async () => {
    const upsert = await run(createNote({
      tos: [new URL('https://iori.test/users/kosui'), followersId],
      bccs: [new URL('https://iori.test/users/hanako')],
    }));

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientActorUris: ['https://iori.test/users/kosui', 'https://iori.test/users/hanako'],
      }),
    );
  });

  describe('shouldSave', () => {
    const chain = (shouldSave?: (identity: { uri: string }) => boolean | Promise<boolean>) => {
      const parent = createNote({}).clone({ replyTarget: new URL('https://remote.example/notes/grandparent') });
      const grandparent = createNote({}).clone({ id: new URL('https://remote.example/notes/grandparent') });
      const notes = new Map([[parent.id!.href, parent], [grandparent.id!.href, grandparent]]);
      const remotePostUpserter = { resolve: vi.fn(async () => RA.ok({ postId: 'post-1' } as never)) };
      const lookupObject = vi.fn(async (uri: string) => notes.get(uri) ?? null);
      const useCase = FetchReplyNotesRecursiveUseCase.create({
        origin: 'https://iori.test',
        postResolverByUri: { resolve: async () => RA.ok(undefined) },
        localPostResolverByUri: { resolve: async () => RA.ok(undefined) },
        remotePostUpserter,
      });
      const execute = () =>
        useCase.run({
          inReplyToUri: parent.id!.href,
          documentLoader: vi.fn() as never,
          lookupObject,
          shouldSave,
        });
      return { execute, lookupObject, upsert: remotePostUpserter.resolve };
    };

    it('省略したときは、祖先を最後までたどって保存する', async () => {
      const t = chain();

      await t.execute();

      expect(t.upsert).toHaveBeenCalledTimes(2);
    });

    it('真を返す間は保存して先へ進む', async () => {
      const shouldSave = vi.fn(async () => true);
      const t = chain(shouldSave);

      await t.execute();

      expect(shouldSave).toHaveBeenCalledTimes(2);
      expect(t.upsert).toHaveBeenCalledTimes(2);
    });

    it('偽を返したら、その投稿を保存せず、そこで連鎖を止める', async () => {
      const shouldSave = vi.fn(async () => false);
      const t = chain(shouldSave);

      const result = await t.execute();

      expect(shouldSave).toHaveBeenCalledWith(expect.objectContaining({ uri: 'https://remote.example/notes/parent' }));
      expect(t.upsert).not.toHaveBeenCalled();
      expect(t.lookupObject).toHaveBeenCalledTimes(1);
      expect(result.ok && result.val.fetchedPosts).toEqual([]);
    });
  });
});
