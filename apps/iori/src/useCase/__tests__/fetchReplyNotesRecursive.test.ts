import { Note, Person } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { FetchReplyNotesRecursiveUseCase } from '../fetchReplyNotesRecursive.ts';

const followersId = new URL('https://remote.example/users/alice/followers');

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
    isBlockedUri: () => false,
  });
  await useCase.run({
    inReplyToUri: 'https://remote.example/notes/parent',
    documentLoader: vi.fn() as never,
    lookupObject: async () => note,
  });
  return remotePostUpserter.resolve;
};

describe('FetchReplyNotesRecursiveUseCase', () => {
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
        isBlockedUri: () => false,
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

  describe('ブロックしたドメイン', () => {
    const person = (host: string) =>
      new Person({
        id: new URL(`https://${host}/users/alice`),
        inbox: new URL(`https://${host}/users/alice/inbox`),
        preferredUsername: 'alice',
      });
    const build = (notes: ReadonlyMap<string, Note>) => {
      const remotePostUpserter = { resolve: vi.fn(async () => RA.ok({ postId: 'post-1' } as never)) };
      const lookupObject = vi.fn(async (uri: string) => notes.get(uri) ?? null);
      const useCase = FetchReplyNotesRecursiveUseCase.create({
        origin: 'https://iori.test',
        postResolverByUri: { resolve: async () => RA.ok(undefined) },
        localPostResolverByUri: { resolve: async () => RA.ok(undefined) },
        remotePostUpserter,
        isBlockedUri: (uri) => new URL(uri).hostname === 'blocked.example',
      });
      const run = (inReplyToUri: string, maxDepth?: number) =>
        useCase.run({ inReplyToUri, documentLoader: vi.fn() as never, lookupObject, maxDepth });
      return { remotePostUpserter, lookupObject, run };
    };

    it('ブロックしたドメインの URI は取りに行かない', async () => {
      const { remotePostUpserter, lookupObject, run } = build(new Map());

      const result = await run('https://blocked.example/notes/quoted', 1);

      expect(lookupObject).not.toHaveBeenCalled();
      expect(remotePostUpserter.resolve).not.toHaveBeenCalled();
      expect(result).toEqual({ ok: true, val: { fetchedPosts: [] } });
    });

    it('取得した Note の id がブロックしたドメインなら保存しない', async () => {
      const uri = 'https://remote.example/notes/quoted';
      const note = new Note({
        id: new URL('https://blocked.example/notes/quoted'),
        content: 'quoted',
        attribution: person('remote.example'),
      });
      const { remotePostUpserter, run } = build(new Map([[uri, note]]));

      await run(uri, 1);

      expect(remotePostUpserter.resolve).not.toHaveBeenCalled();
    });

    it('返信の連鎖でも、ブロックしたドメインの親は取りに行かず、そこで打ち切る', async () => {
      const childUri = 'https://remote.example/notes/child';
      const blockedUri = 'https://blocked.example/notes/parent';
      const grandparentUri = 'https://remote.example/notes/grandparent';
      const notes = new Map([
        [
          childUri,
          new Note({
            id: new URL(childUri),
            content: 'child',
            attribution: person('remote.example'),
            replyTarget: new URL(blockedUri),
          }),
        ],
        [
          blockedUri,
          new Note({
            id: new URL(blockedUri),
            content: 'parent',
            attribution: person('remote.example'),
            replyTarget: new URL(grandparentUri),
          }),
        ],
        [
          grandparentUri,
          new Note({ id: new URL(grandparentUri), content: 'grandparent', attribution: person('remote.example') }),
        ],
      ]);
      const { remotePostUpserter, lookupObject, run } = build(notes);

      await run(childUri);

      expect(lookupObject).toHaveBeenCalledTimes(1);
      expect(lookupObject).toHaveBeenCalledWith(childUri, expect.anything());
      expect(remotePostUpserter.resolve).toHaveBeenCalledOnce();
      expect(remotePostUpserter.resolve).toHaveBeenCalledWith(expect.objectContaining({ uri: childUri }));
    });

    it('返信の連鎖でも、著者がブロックしたドメインの親は保存せず、そこで打ち切る', async () => {
      const childUri = 'https://remote.example/notes/child';
      const parentUri = 'https://remote.example/notes/parent';
      const grandparentUri = 'https://remote.example/notes/grandparent';
      const notes = new Map([
        [
          childUri,
          new Note({
            id: new URL(childUri),
            content: 'child',
            attribution: person('remote.example'),
            replyTarget: new URL(parentUri),
          }),
        ],
        [
          parentUri,
          new Note({
            id: new URL(parentUri),
            content: 'parent',
            attribution: person('blocked.example'),
            replyTarget: new URL(grandparentUri),
          }),
        ],
        [
          grandparentUri,
          new Note({ id: new URL(grandparentUri), content: 'grandparent', attribution: person('remote.example') }),
        ],
      ]);
      const { remotePostUpserter, lookupObject, run } = build(notes);

      await run(childUri);

      expect(lookupObject).toHaveBeenCalledTimes(2);
      expect(remotePostUpserter.resolve).toHaveBeenCalledOnce();
      expect(remotePostUpserter.resolve).toHaveBeenCalledWith(expect.objectContaining({ uri: childUri }));
    });
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
        isBlockedUri: () => false,
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
