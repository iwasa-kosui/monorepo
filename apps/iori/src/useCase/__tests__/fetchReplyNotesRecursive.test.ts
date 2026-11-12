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

  it('records the quoted note URI of a fetched Note', async () => {
    const note = new Note({
      id: new URL('https://remote.example/notes/parent'),
      content: '<p>parent</p>',
      attribution: new Person({
        id: new URL('https://remote.example/users/alice'),
        inbox: new URL('https://remote.example/users/alice/inbox'),
        preferredUsername: 'alice',
      }),
      quote: new URL('https://other.example/notes/quoted'),
    });

    const upsert = await run(note);

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ quoteUri: 'https://other.example/notes/quoted' }));
  });

  describe('maxDepth', () => {
    const alice = new Person({
      id: new URL('https://remote.example/users/alice'),
      inbox: new URL('https://remote.example/users/alice/inbox'),
      preferredUsername: 'alice',
    });
    const notes = new Map([
      [
        'https://remote.example/notes/quoted',
        new Note({
          id: new URL('https://remote.example/notes/quoted'),
          content: 'quoted',
          attribution: alice,
          replyTarget: new URL('https://remote.example/notes/quoted-parent'),
          quote: new URL('https://remote.example/notes/quoted-quote'),
        }),
      ],
      [
        'https://remote.example/notes/quoted-parent',
        new Note({ id: new URL('https://remote.example/notes/quoted-parent'), content: 'parent', attribution: alice }),
      ],
    ]);
    const build = (existing: ReadonlySet<string> = new Set()) => {
      const remotePostUpserter = { resolve: vi.fn(async () => RA.ok({ postId: 'post-1' } as never)) };
      const lookupObject = vi.fn(async (uri: string) => notes.get(uri) ?? null);
      const useCase = FetchReplyNotesRecursiveUseCase.create({
        origin: 'https://iori.test',
        postResolverByUri: {
          resolve: async ({ uri }) => RA.ok(existing.has(uri) ? ({ inReplyToUri: null } as never) : undefined),
        },
        localPostResolverByUri: { resolve: async () => RA.ok(undefined) },
        remotePostUpserter,
      });
      return { remotePostUpserter, lookupObject, useCase };
    };

    it('stops after the first note when maxDepth is 1', async () => {
      const { remotePostUpserter, lookupObject, useCase } = build();

      await useCase.run({
        inReplyToUri: 'https://remote.example/notes/quoted',
        documentLoader: vi.fn() as never,
        lookupObject,
        maxDepth: 1,
      });

      expect(lookupObject).toHaveBeenCalledOnce();
      expect(remotePostUpserter.resolve).toHaveBeenCalledOnce();
      expect(remotePostUpserter.resolve).toHaveBeenCalledWith(
        expect.objectContaining({
          uri: 'https://remote.example/notes/quoted',
          quoteUri: 'https://remote.example/notes/quoted-quote',
        }),
      );
    });

    it('does not fetch a note that is already stored', async () => {
      const { remotePostUpserter, lookupObject, useCase } = build(new Set(['https://remote.example/notes/quoted']));

      const result = await useCase.run({
        inReplyToUri: 'https://remote.example/notes/quoted',
        documentLoader: vi.fn() as never,
        lookupObject,
        maxDepth: 1,
      });

      expect(lookupObject).not.toHaveBeenCalled();
      expect(remotePostUpserter.resolve).not.toHaveBeenCalled();
      expect(result).toEqual({ ok: true, val: { fetchedPosts: [] } });
    });

    it('returns without storing anything when the lookup fails', async () => {
      const { remotePostUpserter, useCase } = build();

      const result = await useCase.run({
        inReplyToUri: 'https://remote.example/notes/quoted',
        documentLoader: vi.fn() as never,
        lookupObject: async () => {
          throw new Error('lookup failed');
        },
        maxDepth: 1,
      });

      expect(remotePostUpserter.resolve).not.toHaveBeenCalled();
      expect(result).toEqual({ ok: true, val: { fetchedPosts: [] } });
    });

    it('follows the reply chain up to 10 notes when maxDepth is not given', async () => {
      const { remotePostUpserter, lookupObject, useCase } = build();

      await useCase.run({
        inReplyToUri: 'https://remote.example/notes/quoted',
        documentLoader: vi.fn() as never,
        lookupObject,
      });

      expect(remotePostUpserter.resolve).toHaveBeenCalledTimes(2);
    });
  });
});
