import {
  Announce,
  Article,
  Create,
  Note,
  OrderedCollection,
  OrderedCollectionPage,
  Person,
  Question,
} from '@fedify/vocab';
import type { DocumentLoader } from '@fedify/vocab-runtime';
import { RA } from '@iwasa-kosui/result';
import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it, vi } from 'vitest';

import { isBlockedUri } from '../../adaptor/fedify/blockedInboxDomain.ts';
import type { Actor } from '../../domain/actor/actor.ts';
import { FetchRemoteOutboxUseCase } from '../fetchRemoteOutbox.ts';

const ORIGIN = 'https://iori.test';
const ACTOR_URI = 'https://remote.example/users/alice';
const BLOCKED_DOMAIN = 'blocked.example';

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

const createOf = (note: Note | Article | Question) =>
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
  notes?: ReadonlyArray<Note | Article | Question>;
  stored?: ReadonlyArray<string>;
  localUris?: ReadonlyArray<string>;
  blocked?: boolean;
  blockedAfterFirstCheck?: boolean;
  blockedCheckRejectsAfterFirst?: boolean;
  failingUris?: ReadonlyArray<string>;
  hangingUris?: ReadonlyArray<string>;
  documentLoader?: DocumentLoader;
  fetchTimeoutMs?: number;
  totalTimeoutMs?: number;
  now?: () => number;
}>;

const setup = (options: Setup = {}) => {
  const stored = new Set(options.stored ?? []);
  const objects = new Map<string, unknown>([
    [ACTOR_URI, personOf('alice', options.outbox)],
    ...(options.notes ?? []).map((note): [string, Note | Article | Question] => [note.id!.href, note]),
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
  if (options.blockedAfterFirstCheck) {
    blockedActorUriResolverByUsername.resolve.mockImplementationOnce(async () => RA.ok(false));
    blockedActorUriResolverByUsername.resolve.mockImplementation(async () => RA.ok(true));
  }
  if (options.blockedCheckRejectsAfterFirst) {
    blockedActorUriResolverByUsername.resolve.mockImplementationOnce(async () => RA.ok(false));
    blockedActorUriResolverByUsername.resolve.mockImplementation(async () => {
      throw new Error('D1 is down');
    });
  }
  const remotePostUrisResolverByUris = {
    resolve: vi.fn(async ({ uris }: { uris: readonly string[] }) => RA.ok(uris.filter((uri) => stored.has(uri)))),
  };
  const localPostUrisResolverByUris = {
    resolve: vi.fn(async ({ uris }: { uris: readonly string[] }) =>
      RA.ok(uris.filter((uri) => options.localUris?.includes(uri)))
    ),
  };
  const actorResolverById = {
    resolve: vi.fn(async () => RA.ok('actor' in options ? options.actor : remoteActor)),
  };
  const useCase = FetchRemoteOutboxUseCase.create({
    origin: ORIGIN,
    userResolver: { resolve: async () => RA.ok({ id: 'user-1', username: 'kosui' } as never) },
    actorResolverById,
    remotePostUrisResolverByUris,
    localPostUrisResolverByUris,
    remotePostUpserter,
    blockedActorUriResolverByUsername,
    isBlockedUri: (uri) => isBlockedUri(uri, [BLOCKED_DOMAIN]),
    fetchTimeoutMs: options.fetchTimeoutMs,
    totalTimeoutMs: options.totalTimeoutMs,
    now: options.now,
  });
  const run = async (actorId = 'actor-1') => {
    const result = await useCase.run({ userId: 'user-1' as never, actorId: actorId as never, ctx });
    if (!result.ok) throw new Error(`unexpected error: ${result.err.type}`);
    return result.val.fetchedCount;
  };
  return {
    run,
    ctx,
    lookupObject,
    remotePostUpserter,
    remotePostUrisResolverByUris,
    localPostUrisResolverByUris,
    actorResolverById,
    blockedActorUriResolverByUsername,
    stored,
    documentLoader,
  };
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

  it('outbox の Create の Article と Question も、本文を組み立てて保存する', async () => {
    const article = new Article({
      id: new URL(noteUri(1)),
      name: 'Title',
      content: '<p>body</p>',
      attribution: personOf('alice'),
    });
    const question = new Question({
      id: new URL(noteUri(2)),
      content: '<p>q</p>',
      exclusiveOptions: [new Note({ name: 'a' })],
      attribution: personOf('alice'),
    });
    const t = setup({ outbox: outboxOf([createOf(article), createOf(question)]), notes: [article, question] });

    expect(await t.run()).toBe(2);
    expect(t.remotePostUpserter.resolve.mock.calls.map(([identity]) => identity)).toMatchObject([
      { uri: noteUri(1), content: '<p><strong>Title</strong></p><p>body</p>' },
      { uri: noteUri(2), content: `<p>q</p><ul><li>a</li></ul><p><a href="${noteUri(2)}">元の投稿で投票する</a></p>` },
    ]);
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

  it('ブロックしたドメインのアクターなら outbox を取りに行かない', async () => {
    const blockedActor = {
      id: 'actor-1',
      type: 'remote',
      uri: `https://${BLOCKED_DOMAIN}/users/alice`,
    } as unknown as Actor;
    const note = noteOf(1);
    const t = setup({ actor: blockedActor, outbox: outboxOf([createOf(note)]), notes: [note] });

    expect(await t.run()).toBe(0);
    expect(t.lookupObject).not.toHaveBeenCalled();
    expect(t.ctx.getDocumentLoader).not.toHaveBeenCalled();
    expect(t.remotePostUpserter.resolve).not.toHaveBeenCalled();
  });

  it('ブロックしたサブドメインのアクターでも outbox を取りに行かない', async () => {
    const blockedActor = {
      id: 'actor-1',
      type: 'remote',
      uri: `https://social.${BLOCKED_DOMAIN}/users/alice`,
    } as unknown as Actor;
    const t = setup({ actor: blockedActor, outbox: outboxOf([]) });

    expect(await t.run()).toBe(0);
    expect(t.lookupObject).not.toHaveBeenCalled();
  });

  it('outbox の中のブロックしたドメインの投稿は取りに行かず、保存しない', async () => {
    const blockedNote = new Note({
      id: new URL(`https://${BLOCKED_DOMAIN}/notes/1`),
      content: 'blocked',
      attribution: personOf('alice'),
    });
    const notes = [blockedNote, noteOf(2)];
    const t = setup({ outbox: outboxOf(notes.map(createOf)), notes });

    expect(await t.run()).toBe(1);
    expect(storedUris(t)).toEqual([noteUri(2)]);
    expect(lookedUpUris(t)).not.toContain(blockedNote.id!.href);
    expect(t.remotePostUrisResolverByUris.resolve).toHaveBeenCalledWith({ uris: [noteUri(2)] });
  });

  it('作者の一人がブロックしたドメインの投稿は保存しない', async () => {
    const sharedNote = new Note({
      id: new URL(noteUri(1)),
      content: 'shared',
      attributions: [personOf('alice'), new Person({ id: new URL(`https://${BLOCKED_DOMAIN}/users/bob`) })],
    });
    const notes = [sharedNote, noteOf(2)];
    const t = setup({ outbox: outboxOf(notes.map(createOf)), notes });

    expect(await t.run()).toBe(1);
    expect(storedUris(t)).toEqual([noteUri(2)]);
  });

  it('ブロックしていないドメインの投稿は、ブロックの設定があっても保存する', async () => {
    const notes = [noteOf(1), noteOf(2)];
    const t = setup({ outbox: outboxOf(notes.map(createOf)), notes });

    expect(await t.run()).toBe(2);
    expect(storedUris(t)).toEqual([noteUri(1), noteUri(2)]);
  });

  it('個別にブロックした作者の投稿は保存しない', async () => {
    const notes = [noteOf(1), noteOf(2)];
    const t = setup({ outbox: outboxOf(notes.map(createOf)), notes, blockedAfterFirstCheck: true });

    expect(await t.run()).toBe(0);
    expect(t.remotePostUpserter.resolve).not.toHaveBeenCalled();
    expect(t.blockedActorUriResolverByUsername.resolve).toHaveBeenCalledWith({
      username: 'kosui',
      actorUri: ACTOR_URI,
    });
  });

  it('保存前のブロックの判定が失敗したときは、その相手の投稿を保存しない', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const notes = [noteOf(1), noteOf(2)];
    const t = setup({ outbox: outboxOf(notes.map(createOf)), notes, blockedCheckRejectsAfterFirst: true });

    expect(await t.run()).toBe(0);
    expect(t.remotePostUpserter.resolve).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('ローカルのアクターなら何も取らず 0 件を返す', async () => {
    const note = noteOf(1);
    const t = setup({ actor: localActor, outbox: outboxOf([createOf(note)]), notes: [note] });

    expect(await t.run()).toBe(0);
    expect(t.lookupObject).not.toHaveBeenCalled();
    expect(t.remotePostUpserter.resolve).not.toHaveBeenCalled();
  });

  describe('Note の取得の並列', () => {
    const delayNoteLookups = (t: ReturnType<typeof setup>, delayOf: (uri: string) => number) => {
      const original = t.lookupObject.getMockImplementation()!;
      const state = { active: 0, maxActive: 0, completed: [] as string[] };
      t.lookupObject.mockImplementation(async (uri, options) => {
        if (uri === ACTOR_URI) {
          return original(uri, options);
        }
        state.active++;
        state.maxActive = Math.max(state.maxActive, state.active);
        await new Promise((resolve) => setTimeout(resolve, delayOf(uri)));
        state.active--;
        state.completed.push(uri);
        return original(uri, options);
      });
      return state;
    };

    it('Note の取得は同時に最大 4 件まで走らせる', async () => {
      const notes = Array.from({ length: 10 }, (_, index) => noteOf(index));
      const t = setup({ outbox: outboxOf(notes.map(createOf)), notes });
      const state = delayNoteLookups(t, () => 5);

      expect(await t.run()).toBe(10);
      expect(state.maxActive).toBe(4);
    });

    it('取得の完了順が前後しても、保存は outbox の順に行う', async () => {
      const notes = Array.from({ length: 4 }, (_, index) => noteOf(index));
      const t = setup({ outbox: outboxOf(notes.map(createOf)), notes });
      const delays = new Map(notes.map((note, index) => [note.id!.href, (4 - index) * 10]));
      const state = delayNoteLookups(t, (uri) => delays.get(uri)!);

      expect(await t.run()).toBe(4);
      expect(state.completed).toEqual([noteUri(3), noteUri(2), noteUri(1), noteUri(0)]);
      expect(storedUris(t)).toEqual([noteUri(0), noteUri(1), noteUri(2), noteUri(3)]);
    });

    it('保存が 20 件に達する分だけ取得を始め、21 件目以降の取得は始めない', async () => {
      const notes = Array.from({ length: 25 }, (_, index) => noteOf(index));
      const t = setup({ outbox: outboxOf(notes.map(createOf)), notes });
      const state = delayNoteLookups(t, () => 1);

      expect(await t.run()).toBe(20);
      expect(state.maxActive).toBe(4);
      expect(lookedUpUris(t).filter((uri) => uri !== ACTOR_URI)).toEqual(
        notes.slice(0, 20).map((note) => note.id!.href),
      );
    });

    it('取れなかった Note の分は、保存が 20 件に達するまで後ろの Note で補う', async () => {
      const notes = Array.from({ length: 25 }, (_, index) => noteOf(index));
      const t = setup({
        outbox: outboxOf(notes.map(createOf)),
        notes,
        failingUris: [noteUri(0), noteUri(1), noteUri(2)],
      });
      delayNoteLookups(t, () => 1);

      expect(await t.run()).toBe(20);
      expect(lookedUpUris(t)).toContain(noteUri(22));
      expect(lookedUpUris(t)).not.toContain(noteUri(23));
    });
  });

  describe('保存済みの判定', () => {
    it('1 ページ分の Create の object の URI をまとめて、リモートとローカルそれぞれ 1 回の問い合わせで調べる', async () => {
      const notes = [noteOf(1), noteOf(2), noteOf(3)];
      const t = setup({ outbox: outboxOf([createOf(notes[0]!), announceOf(notes[1]!), createOf(notes[2]!)]), notes });

      await t.run();

      expect(t.remotePostUrisResolverByUris.resolve).toHaveBeenCalledTimes(1);
      expect(t.remotePostUrisResolverByUris.resolve).toHaveBeenCalledWith({ uris: [noteUri(1), noteUri(3)] });
      expect(t.localPostUrisResolverByUris.resolve).toHaveBeenCalledTimes(1);
      expect(t.localPostUrisResolverByUris.resolve).toHaveBeenCalledWith({ uris: [noteUri(1), noteUri(3)] });
    });

    it('ページごとに 1 回ずつ問い合わせる', async () => {
      const notes = [noteOf(1), noteOf(2)];
      const t = setup({ outbox: outboxOf([createOf(notes[0]!)], [createOf(notes[1]!)]), notes });

      await t.run();

      expect(t.remotePostUrisResolverByUris.resolve.mock.calls.map(([input]) => input.uris)).toEqual([
        [noteUri(1)],
        [noteUri(2)],
      ]);
      expect(t.localPostUrisResolverByUris.resolve).toHaveBeenCalledTimes(2);
    });

    it('1 ページから調べる URI は 100 件までにする', async () => {
      const notes = Array.from({ length: 120 }, (_, index) => noteOf(index));
      const t = setup({ outbox: outboxOf(notes.map(createOf)), notes });

      await t.run();

      expect(t.remotePostUrisResolverByUris.resolve.mock.calls[0]![0].uris).toHaveLength(100);
      expect(t.localPostUrisResolverByUris.resolve.mock.calls[0]![0].uris).toHaveLength(100);
    });

    it('Create がないページでは問い合わせない', async () => {
      const t = setup({ outbox: outboxOf([announceOf(noteOf(1))]), notes: [noteOf(1)] });

      await t.run();

      expect(t.remotePostUrisResolverByUris.resolve).not.toHaveBeenCalled();
      expect(t.localPostUrisResolverByUris.resolve).not.toHaveBeenCalled();
    });
  });

  describe('同じアクターへの取得', () => {
    const withNote = () => {
      const note = noteOf(1);
      return { outbox: outboxOf([createOf(note)]), notes: [note] };
    };

    it('同時の 2 回のリクエストは、1 回の取得にまとめて同じ結果を返す', async () => {
      const t = setup(withNote());

      const counts = await Promise.all([t.run(), t.run()]);

      expect(counts).toEqual([1, 1]);
      expect(t.ctx.getDocumentLoader).toHaveBeenCalledTimes(1);
      expect(t.remotePostUpserter.resolve).toHaveBeenCalledTimes(1);
    });

    it('別のアクターへの同時のリクエストはまとめない', async () => {
      const t = setup(withNote());

      await Promise.all([t.run('actor-1'), t.run('actor-2')]);

      expect(t.ctx.getDocumentLoader).toHaveBeenCalledTimes(2);
    });

    it('完了から 60 秒以内の再実行は、取得せずに 0 件を返す', async () => {
      let time = 1_000_000;
      const t = setup({ ...withNote(), now: () => time });

      expect(await t.run()).toBe(1);
      time += 59_999;

      expect(await t.run()).toBe(0);
      expect(t.ctx.getDocumentLoader).toHaveBeenCalledTimes(1);
    });

    it('完了から 60 秒たったら、もう一度取得する', async () => {
      let time = 1_000_000;
      const t = setup({ ...withNote(), now: () => time });

      await t.run();
      time += 60_000;
      await t.run();

      expect(t.ctx.getDocumentLoader).toHaveBeenCalledTimes(2);
    });

    it('アクターが見つからなかった実行は覚えず、続けて呼ぶと毎回調べる', async () => {
      const actorResolverById = { resolve: vi.fn(async () => RA.ok(undefined)) };
      const useCase = FetchRemoteOutboxUseCase.create({
        origin: ORIGIN,
        userResolver: { resolve: async () => RA.ok({ id: 'user-1', username: 'kosui' } as never) },
        actorResolverById,
        remotePostUrisResolverByUris: { resolve: async () => RA.ok([]) },
        localPostUrisResolverByUris: { resolve: async () => RA.ok([]) },
        remotePostUpserter: { resolve: vi.fn() },
        blockedActorUriResolverByUsername: { resolve: async () => RA.ok(false) },
        isBlockedUri: () => false,
      });
      const input = {
        userId: 'user-1' as never,
        actorId: 'actor-1' as never,
        ctx: { getDocumentLoader: vi.fn(), lookupObject: vi.fn() },
      };

      const results = [await useCase.run(input), await useCase.run(input)];

      expect(results.map((result) => result.ok)).toEqual([false, false]);
      expect(actorResolverById.resolve).toHaveBeenCalledTimes(2);
    });

    it('覚えておくアクターは 200 件までにし、古いものから忘れる', async () => {
      let time = 1_000_000;
      const t = setup({ ...withNote(), now: () => time });
      for (let index = 0; index < 201; index++) {
        await t.run(`actor-${index}`);
        time += 1;
      }
      const loaders = t.ctx.getDocumentLoader.mock.calls.length;

      await t.run('actor-200');
      expect(t.ctx.getDocumentLoader.mock.calls.length).toBe(loaders);
      await t.run('actor-0');
      expect(t.ctx.getDocumentLoader.mock.calls.length).toBe(loaders + 1);
    });
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
    });

    it('全体の時間切れで、実行中の取得に渡した signal を abort する', async () => {
      const note = noteOf(1);
      const t = setup({
        outbox: outboxOf([createOf(note)]),
        notes: [note],
        hangingUris: [noteUri(1)],
        totalTimeoutMs: 50,
      });

      await t.run();

      const signal = t.lookupObject.mock.calls.find(([uri]) => uri === noteUri(1))![1].signal!;
      expect(signal.aborted).toBe(true);
    });

    it('時間切れにならなければ、取得に渡した signal を abort しない', async () => {
      const note = noteOf(1);
      const t = setup({ outbox: outboxOf([createOf(note)]), notes: [note] });

      await t.run();

      expect(t.lookupObject.mock.calls.map(([, options]) => options.signal!.aborted)).toEqual([false, false]);
    });

    it('全体の時間切れで、文書の取得に渡す signal も abort する', async () => {
      const signals: AbortSignal[] = [];
      const documentLoader = vi.fn(async (_url: string, options?: { signal?: AbortSignal }) => {
        signals.push(options!.signal!);
        return new Promise(() => undefined);
      }) as unknown as DocumentLoader;
      const t = setup({ documentLoader, totalTimeoutMs: 50 });
      t.lookupObject.mockImplementation(async (_uri, options) => {
        await options.documentLoader('https://remote.example/outbox');
        return null;
      });

      await t.run();

      expect(signals).toHaveLength(1);
      expect(signals[0]!.aborted).toBe(true);
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
        remotePostUrisResolverByUris: { resolve: async () => RA.ok([]) },
        localPostUrisResolverByUris: { resolve: async () => RA.ok([]) },
        remotePostUpserter: { resolve: vi.fn() },
        blockedActorUriResolverByUsername: { resolve: async () => RA.ok(false) },
        isBlockedUri: () => false,
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
        remotePostUrisResolverByUris: { resolve: async () => RA.ok([]) },
        localPostUrisResolverByUris: { resolve: async () => RA.ok([]) },
        remotePostUpserter: { resolve: vi.fn() },
        blockedActorUriResolverByUsername: { resolve: async () => RA.ok(false) },
        isBlockedUri: () => false,
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
