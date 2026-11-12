import { Announce, Create, Note, OrderedCollection, OrderedCollectionPage, Person } from '@fedify/vocab';
import type { DocumentLoader } from '@fedify/vocab-runtime';
import { RA } from '@iwasa-kosui/result';
import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it, vi } from 'vitest';

import type { Actor } from '../../domain/actor/actor.ts';
import { FetchRemoteOutboxUseCase } from '../fetchRemoteOutbox.ts';

const ORIGIN = 'https://iori.test';
const ACTOR_URI = 'https://remote.example/users/alice';

const personOf = (name: string, outbox?: OrderedCollection) =>
  new Person({
    id: new URL(`https://remote.example/users/${name}`),
    inbox: new URL(`https://remote.example/users/${name}/inbox`),
    preferredUsername: name,
    outbox: outbox ?? null,
  });

const noteUri = (index: number) => `https://remote.example/notes/${index}`;

const noteOf = (index: number, options: { author?: string; published?: string } = {}) =>
  new Note({
    id: new URL(noteUri(index)),
    content: noteUri(index),
    attribution: personOf(options.author ?? 'alice'),
    published: options.published === undefined ? null : Temporal.Instant.from(options.published),
  });

const createOf = (note: Note) =>
  new Create({ id: new URL(`${note.id!.href}/activity`), actor: personOf('alice'), object: note });

const announceOf = (note: Note) =>
  new Announce({ id: new URL(`${note.id!.href}/announce`), actor: personOf('alice'), object: note });

const outboxOf = (...pages: ReadonlyArray<ReadonlyArray<Create | Announce>>) => {
  const pageOf = (index: number): OrderedCollectionPage =>
    new OrderedCollectionPage({
      id: new URL(`https://remote.example/users/alice/outbox?page=${index}`),
      items: [...pages[index]!],
      next: index + 1 < pages.length ? pageOf(index + 1) : null,
    });
  return new OrderedCollection({
    id: new URL('https://remote.example/users/alice/outbox'),
    first: pageOf(0),
  });
};

const remoteActor = { id: 'actor-1', type: 'remote', uri: ACTOR_URI } as unknown as Actor;
const localActor = { id: 'actor-1', type: 'local', uri: 'https://iori.test/users/kosui' } as unknown as Actor;

type Setup = Readonly<{
  actor?: Actor | undefined;
  outbox?: OrderedCollection;
  notes?: ReadonlyArray<Note>;
  stored?: ReadonlyArray<string>;
  localUris?: ReadonlyArray<string>;
  blocked?: boolean;
  failingUris?: ReadonlyArray<string>;
  hangingUris?: ReadonlyArray<string>;
  documentLoader?: DocumentLoader;
  fetchTimeoutMs?: number;
  totalTimeoutMs?: number;
}>;

const setup = (options: Setup = {}) => {
  const stored = new Set(options.stored ?? []);
  const objects = new Map<string, unknown>([
    [ACTOR_URI, personOf('alice', options.outbox)],
    ...(options.notes ?? []).map((note): [string, Note] => [note.id!.href, note]),
  ]);
  const lookupObject = vi.fn(
    async (uri: string, _options: { documentLoader: DocumentLoader; signal?: AbortSignal }) => {
      if (options.failingUris?.includes(uri)) throw new Error(`failed to fetch ${uri}`);
      if (options.hangingUris?.includes(uri)) return new Promise<never>(() => {});
      return objects.get(uri) ?? null;
    },
  );
  const documentLoader = options.documentLoader ?? (vi.fn() as unknown as DocumentLoader);
  const ctx = { getDocumentLoader: vi.fn(async () => documentLoader), lookupObject };
  const remotePostUpserter = {
    resolve: vi.fn(async (identity: { uri: string }) => {
      stored.add(identity.uri);
      return RA.ok({ postId: identity.uri } as never);
    }),
  };
  const blockedActorUriResolverByUsername = {
    resolve: vi.fn(async (_input: { username: unknown; actorUri: string }) => RA.ok(options.blocked ?? false)),
  };
  const useCase = FetchRemoteOutboxUseCase.create({
    origin: ORIGIN,
    userResolver: { resolve: async () => RA.ok({ id: 'user-1', username: 'kosui' } as never) },
    actorResolverById: {
      resolve: async () => RA.ok('actor' in options ? options.actor : remoteActor),
    },
    postResolverByUri: { resolve: async ({ uri }) => RA.ok(stored.has(uri) ? ({ uri } as never) : undefined) },
    localPostResolverByUri: {
      resolve: async ({ uri }) => RA.ok(options.localUris?.includes(uri) ? ({ uri } as never) : undefined),
    },
    remotePostUpserter,
    blockedActorUriResolverByUsername,
    fetchTimeoutMs: options.fetchTimeoutMs,
    totalTimeoutMs: options.totalTimeoutMs,
  });
  const run = async () => {
    const result = await useCase.run({ userId: 'user-1' as never, actorId: 'actor-1' as never, ctx });
    if (!result.ok) throw new Error(`unexpected error: ${result.err.type}`);
    return result.val.fetchedCount;
  };
  return { run, ctx, lookupObject, remotePostUpserter, blockedActorUriResolverByUsername, stored, documentLoader };
};

const storedUris = (t: ReturnType<typeof setup>) =>
  t.remotePostUpserter.resolve.mock.calls.map(([identity]) => identity.uri);

const lookedUpUris = (t: ReturnType<typeof setup>) => t.lookupObject.mock.calls.map(([uri]) => uri);

describe('FetchRemoteOutboxUseCase', () => {
  it('outbox の Create の Note だけを新しい順に保存し、Announce は飛ばす', async () => {
    const notes = [noteOf(1), noteOf(2), noteOf(3)];
    const t = setup({
      outbox: outboxOf([createOf(notes[0]!), announceOf(notes[1]!), createOf(notes[2]!)]),
      notes,
    });

    expect(await t.run()).toBe(2);
    expect(storedUris(t)).toEqual([noteUri(1), noteUri(3)]);
    expect(lookedUpUris(t)).not.toContain(noteUri(2));
  });

  it('署名付きのローダーはログインユーザーの identifier で作る', async () => {
    const t = setup({ outbox: outboxOf([]) });

    await t.run();

    expect(t.ctx.getDocumentLoader).toHaveBeenCalledWith({ identifier: 'kosui' });
  });

  it('Note の published を publishedAt にして保存する', async () => {
    const note = noteOf(1, { published: '2024-01-02T03:04:05.000Z' });
    const t = setup({ outbox: outboxOf([createOf(note)]), notes: [note] });

    await t.run();

    expect(t.remotePostUpserter.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ uri: noteUri(1), publishedAt: Date.parse('2024-01-02T03:04:05.000Z') }),
    );
  });

  it('2 ページ目以降の Note も保存する', async () => {
    const notes = [noteOf(1), noteOf(2)];
    const t = setup({ outbox: outboxOf([createOf(notes[0]!)], [createOf(notes[1]!)]), notes });

    expect(await t.run()).toBe(2);
    expect(storedUris(t)).toEqual([noteUri(1), noteUri(2)]);
  });

  it('保存は 20 件で止め、21 件目は取らない', async () => {
    const notes = Array.from({ length: 25 }, (_, index) => noteOf(index));
    const t = setup({ outbox: outboxOf(notes.map(createOf)), notes });

    expect(await t.run()).toBe(20);
    expect(storedUris(t)).toHaveLength(20);
    expect(lookedUpUris(t)).not.toContain(noteUri(20));
  });

  it('ページは 3 ページまでで、4 ページ目の Note は取らない', async () => {
    const notes = Array.from({ length: 5 }, (_, index) => noteOf(index));
    const t = setup({ outbox: outboxOf(...notes.map((note) => [createOf(note)])), notes });

    expect(await t.run()).toBe(3);
    expect(storedUris(t)).toEqual([noteUri(0), noteUri(1), noteUri(2)]);
    expect(lookedUpUris(t)).not.toContain(noteUri(3));
  });

  it('既に保存してある URI は、リモートでもローカルでも取らず、件数に数えない', async () => {
    const notes = [noteOf(1), noteOf(2), noteOf(3)];
    const t = setup({
      outbox: outboxOf(notes.map(createOf)),
      notes,
      stored: [noteUri(1)],
      localUris: [noteUri(2)],
    });

    expect(await t.run()).toBe(1);
    expect(storedUris(t)).toEqual([noteUri(3)]);
    expect(lookedUpUris(t)).not.toContain(noteUri(1));
    expect(lookedUpUris(t)).not.toContain(noteUri(2));
  });

  it('attribution が相手と違う Note は保存しない', async () => {
    const notes = [noteOf(1, { author: 'bob' }), noteOf(2)];
    const t = setup({ outbox: outboxOf(notes.map(createOf)), notes });

    expect(await t.run()).toBe(1);
    expect(storedUris(t)).toEqual([noteUri(2)]);
  });

  it('Note でないオブジェクトを指す Create は飛ばす', async () => {
    const note = noteOf(1);
    const t = setup({ outbox: outboxOf([createOf(note)]), notes: [] });

    expect(await t.run()).toBe(0);
    expect(t.remotePostUpserter.resolve).not.toHaveBeenCalled();
  });

  it('ブロックしている相手なら何も取らない', async () => {
    const note = noteOf(1);
    const t = setup({ outbox: outboxOf([createOf(note)]), notes: [note], blocked: true });

    expect(await t.run()).toBe(0);
    expect(t.blockedActorUriResolverByUsername.resolve).toHaveBeenCalledWith({
      username: 'kosui',
      actorUri: ACTOR_URI,
    });
    expect(t.lookupObject).not.toHaveBeenCalled();
    expect(t.ctx.getDocumentLoader).not.toHaveBeenCalled();
  });

  it('ローカルのアクターなら何も取らず 0 件を返す', async () => {
    const note = noteOf(1);
    const t = setup({ actor: localActor, outbox: outboxOf([createOf(note)]), notes: [note] });

    expect(await t.run()).toBe(0);
    expect(t.lookupObject).not.toHaveBeenCalled();
    expect(t.remotePostUpserter.resolve).not.toHaveBeenCalled();
  });

  describe('失敗と時間切れ', () => {
    it('一部の Note の取得に失敗しても、残りを保存する', async () => {
      const notes = [noteOf(1), noteOf(2), noteOf(3)];
      const t = setup({ outbox: outboxOf(notes.map(createOf)), notes, failingUris: [noteUri(2)] });

      expect(await t.run()).toBe(2);
      expect(storedUris(t)).toEqual([noteUri(1), noteUri(3)]);
    });

    it('保存に失敗した Note は飛ばして残りを保存する', async () => {
      const notes = [noteOf(1), noteOf(2)];
      const t = setup({ outbox: outboxOf(notes.map(createOf)), notes });
      t.remotePostUpserter.resolve.mockRejectedValueOnce(new Error('failed to store'));

      expect(await t.run()).toBe(1);
      expect(storedUris(t)).toEqual([noteUri(1), noteUri(2)]);
    });

    it('相手のアクターの取得に失敗したら 0 件を返す', async () => {
      const note = noteOf(1);
      const t = setup({ outbox: outboxOf([createOf(note)]), notes: [note], failingUris: [ACTOR_URI] });

      expect(await t.run()).toBe(0);
    });

    it('outbox がなければ 0 件を返す', async () => {
      const t = setup();

      expect(await t.run()).toBe(0);
      expect(t.remotePostUpserter.resolve).not.toHaveBeenCalled();
    });

    it('全体の時間切れまでに保存した件数を返し、その後は保存しない', async () => {
      const notes = [noteOf(1), noteOf(2), noteOf(3)];
      const t = setup({
        outbox: outboxOf(notes.map(createOf)),
        notes,
        hangingUris: [noteUri(2)],
        totalTimeoutMs: 30,
      });

      expect(await t.run()).toBe(1);
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(storedUris(t)).toEqual([noteUri(1)]);
      expect(lookedUpUris(t)).not.toContain(noteUri(3));
    });

    it('取得ごとに 5 秒の signal を付けて lookupObject を呼ぶ', async () => {
      const note = noteOf(1);
      const t = setup({ outbox: outboxOf([createOf(note)]), notes: [note] });

      await t.run();

      expect(t.lookupObject.mock.calls.map(([, options]) => options.signal)).toEqual([
        expect.any(AbortSignal),
        expect.any(AbortSignal),
      ]);
    });

    it('ドキュメントローダーにも取得ごとの signal を付ける', async () => {
      const base = vi.fn(async () => ({ contextUrl: null, documentUrl: 'https://remote.example/', document: {} }));
      const note = noteOf(1);
      const t = setup({
        outbox: outboxOf([createOf(note)]),
        notes: [note],
        documentLoader: base as unknown as DocumentLoader,
      });

      await t.run();
      await t.lookupObject.mock.calls[0]![1].documentLoader('https://remote.example/x');

      expect(base).toHaveBeenCalledWith(
        'https://remote.example/x',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
  });

  describe('エラー', () => {
    it('ユーザーがいなければ UserNotFoundError を返す', async () => {
      const useCase = FetchRemoteOutboxUseCase.create({
        origin: ORIGIN,
        userResolver: { resolve: async () => RA.ok(undefined) },
        actorResolverById: { resolve: async () => RA.ok(remoteActor) },
        postResolverByUri: { resolve: async () => RA.ok(undefined) },
        localPostResolverByUri: { resolve: async () => RA.ok(undefined) },
        remotePostUpserter: { resolve: vi.fn() },
        blockedActorUriResolverByUsername: { resolve: async () => RA.ok(false) },
      });

      const result = await useCase.run({
        userId: 'user-1' as never,
        actorId: 'actor-1' as never,
        ctx: { getDocumentLoader: vi.fn(), lookupObject: vi.fn() },
      });

      expect(result.ok ? undefined : result.err.type).toBe('UserNotFoundError');
    });

    it('アクターがいなければ ActorNotFoundError を返す', async () => {
      const useCase = FetchRemoteOutboxUseCase.create({
        origin: ORIGIN,
        userResolver: { resolve: async () => RA.ok({ id: 'user-1', username: 'kosui' } as never) },
        actorResolverById: { resolve: async () => RA.ok(undefined) },
        postResolverByUri: { resolve: async () => RA.ok(undefined) },
        localPostResolverByUri: { resolve: async () => RA.ok(undefined) },
        remotePostUpserter: { resolve: vi.fn() },
        blockedActorUriResolverByUsername: { resolve: async () => RA.ok(false) },
      });

      const result = await useCase.run({
        userId: 'user-1' as never,
        actorId: 'actor-1' as never,
        ctx: { getDocumentLoader: vi.fn(), lookupObject: vi.fn() },
      });

      expect(result.ok ? undefined : result.err.type).toBe('ActorNotFoundError');
    });
  });
});
