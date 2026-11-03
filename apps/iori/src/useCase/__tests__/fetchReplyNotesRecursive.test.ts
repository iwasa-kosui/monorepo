import { Note, Person } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { FetchReplyNotesRecursiveUseCase } from '../fetchReplyNotesRecursive.ts';

const followersId = new URL('https://remote.example/users/alice/followers');
const publicUri = new URL('https://www.w3.org/ns/activitystreams#Public');

const createNote = (addressing: { tos?: URL[]; ccs?: URL[] }) =>
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
});
