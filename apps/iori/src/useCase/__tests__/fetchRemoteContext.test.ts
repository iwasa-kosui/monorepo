import { Collection, CollectionPage, Note, Person } from '@fedify/vocab';
import type { DocumentLoader } from '@fedify/vocab-runtime';
import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { Post } from '../../domain/post/post.ts';
import { FetchRemoteContextUseCase } from '../fetchRemoteContext.ts';

const ORIGIN = 'https://iori.test';
const ROOT_URI = 'https://remote.example/notes/root';
const PARENT_URI = 'https://remote.example/notes/parent';

const personOf = (name: string) =>
  new Person({
    id: new URL(`https://remote.example/users/${name}`),
    inbox: new URL(`https://remote.example/users/${name}/inbox`),
    preferredUsername: name,
  });

const noteOf = (
  id: string,
  options: { replyTo?: string; replies?: Collection; author?: string } = {},
) =>
  new Note({
    id: new URL(id),
    content: id,
    attribution: personOf(options.author ?? 'alice'),
    replyTarget: options.replyTo === undefined ? null : new URL(options.replyTo),
    replies: options.replies ?? null,
  });

const repliesOf = (...uris: string[]) => new Collection({ items: uris.map((uri) => new URL(uri)) });

const replyUri = (index: number) => `https://remote.example/notes/reply-${index}`;

const remotePost = (overrides: Partial<Post> = {}) =>
  ({
    type: 'remote',
    postId: 'post-1',
    uri: ROOT_URI,
    inReplyToUri: null,
    ...overrides,
  }) as Post;

type Setup = Readonly<{
  post?: Post;
  notes?: ReadonlyArray<Note>;
  stored?: ReadonlyArray<string>;
  localUris?: ReadonlyArray<string>;
  blockedActorUris?: ReadonlyArray<string>;
  documentLoader?: DocumentLoader;
  failingUris?: ReadonlyArray<string>;
  lookupObject?: (uri: string) => Promise<unknown>;
  ancestors?: number;
  fetchTimeoutMs?: number;
  totalTimeoutMs?: number;
}>;

const setup = (options: Setup = {}) => {
  const stored = new Set(options.stored ?? []);
  const notes = new Map((options.notes ?? []).map((note) => [note.id!.href, note]));
  const lookupObject = vi.fn(
    async (uri: string, _options: { documentLoader: DocumentLoader; signal?: AbortSignal }) => {
      if (options.failingUris?.includes(uri)) throw new Error(`failed to fetch ${uri}`);
      return options.lookupObject === undefined ? (notes.get(uri) ?? null) : options.lookupObject(uri);
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
  const fetchReplyNotesRecursiveUseCase = {
    run: vi.fn(async () =>
      RA.ok({ fetchedPosts: Array.from({ length: options.ancestors ?? 0 }, () => ({}) as never) })
    ),
  };
  const useCase = FetchRemoteContextUseCase.create({
    origin: ORIGIN,
    userResolver: { resolve: async () => RA.ok({ id: 'user-1', username: 'kosui' } as never) },
    postResolver: { resolve: async () => RA.ok(options.post ?? remotePost()) },
    postResolverByUri: { resolve: async ({ uri }) => RA.ok(stored.has(uri) ? ({ uri } as never) : undefined) },
    localPostResolverByUri: {
      resolve: async ({ uri }) => RA.ok(options.localUris?.includes(uri) ? ({ uri } as never) : undefined),
    },
    remotePostUpserter,
    blockedActorUriResolverByUsername: {
      resolve: async ({ actorUri }) => RA.ok(options.blockedActorUris?.includes(actorUri) ?? false),
    },
    fetchReplyNotesRecursiveUseCase,
    fetchTimeoutMs: options.fetchTimeoutMs,
    totalTimeoutMs: options.totalTimeoutMs,
  });
  const run = async () => {
    const result = await useCase.run({ userId: 'user-1' as never, postId: 'post-1' as never, ctx });
    if (!result.ok) throw new Error(`unexpected error: ${result.err.type}`);
    return result.val.fetchedCount;
  };
  return { run, ctx, lookupObject, remotePostUpserter, fetchReplyNotesRecursiveUseCase, stored, documentLoader };
};

const storedUris = (t: ReturnType<typeof setup>) =>
  t.remotePostUpserter.resolve.mock.calls.map(([identity]) => identity.uri);

describe('FetchRemoteContextUseCase', () => {
  describe('返信', () => {
    it('最初のページの返信だけでなく、次のページにある他人の返信も保存する', async () => {
      const first = new CollectionPage({
        items: [new URL(replyUri(1))],
        next: new CollectionPage({ items: [new URL(replyUri(2))] }),
      });
      const t = setup({
        notes: [
          noteOf(ROOT_URI, { replies: new Collection({ first }) }),
          noteOf(replyUri(1), { replyTo: ROOT_URI }),
          noteOf(replyUri(2), { replyTo: ROOT_URI, author: 'bob' }),
        ],
      });

      expect(await t.run()).toBe(2);
      expect(storedUris(t)).toEqual([replyUri(1), replyUri(2)]);
    });

    it('署名付きのローダーはログインユーザーの identifier で作る', async () => {
      const t = setup({ notes: [noteOf(ROOT_URI)] });

      await t.run();

      expect(t.ctx.getDocumentLoader).toHaveBeenCalledWith({ identifier: 'kosui' });
    });

    it('取得ごとに 5 秒の signal を付けて lookupObject を呼ぶ', async () => {
      const t = setup({ notes: [noteOf(ROOT_URI)] });

      await t.run();

      expect(t.lookupObject.mock.calls[0]![1].signal).toBeInstanceOf(AbortSignal);
    });

    it('深さ 3 までを保存し、4 段目は取らない', async () => {
      const t = setup({
        notes: [
          noteOf(ROOT_URI, { replies: repliesOf(replyUri(1)) }),
          noteOf(replyUri(1), { replyTo: ROOT_URI, replies: repliesOf(replyUri(2)) }),
          noteOf(replyUri(2), { replyTo: replyUri(1), replies: repliesOf(replyUri(3)) }),
          noteOf(replyUri(3), { replyTo: replyUri(2), replies: repliesOf(replyUri(4)) }),
          noteOf(replyUri(4), { replyTo: replyUri(3) }),
        ],
      });

      expect(await t.run()).toBe(3);
      expect(storedUris(t)).toEqual([replyUri(1), replyUri(2), replyUri(3)]);
      expect(t.lookupObject.mock.calls.map(([uri]) => uri)).not.toContain(replyUri(4));
    });

    it('同じ深さの返信を先に保存してから、その下の返信へ進む', async () => {
      const t = setup({
        notes: [
          noteOf(ROOT_URI, { replies: repliesOf(replyUri(1), replyUri(2)) }),
          noteOf(replyUri(1), { replyTo: ROOT_URI, replies: repliesOf(replyUri(3)) }),
          noteOf(replyUri(2), { replyTo: ROOT_URI }),
          noteOf(replyUri(3), { replyTo: replyUri(1) }),
        ],
      });

      await t.run();

      expect(storedUris(t)).toEqual([replyUri(1), replyUri(2), replyUri(3)]);
    });

    it('保存する返信は合計 40 件までにする', async () => {
      const uris = Array.from({ length: 50 }, (_, index) => replyUri(index));
      const t = setup({
        notes: [
          noteOf(ROOT_URI, { replies: repliesOf(...uris) }),
          ...uris.map((uri) => noteOf(uri, { replyTo: ROOT_URI })),
        ],
      });

      expect(await t.run()).toBe(40);
      expect(t.remotePostUpserter.resolve).toHaveBeenCalledTimes(40);
      expect(t.lookupObject).toHaveBeenCalledTimes(41);
    });

    it('取得するコレクションのページは合計 10 ページまでにする', async () => {
      const pageUri = (index: number) => `https://remote.example/notes/root/replies?page=${index}`;
      const pages = new Map<string, CollectionPage>(
        Array.from({ length: 15 }, (_, index) => [
          pageUri(index + 1),
          new CollectionPage({
            id: new URL(pageUri(index + 1)),
            items: [new URL(replyUri(index + 1))],
            next: new URL(pageUri(index + 2)),
          }),
        ]),
      );
      const documentLoader = vi.fn(async (url: string) => {
        const page = pages.get(url);
        if (page === undefined) throw new Error(`not found: ${url}`);
        return { contextUrl: null, documentUrl: url, document: await page.toJsonLd() };
      }) as unknown as DocumentLoader;
      const t = setup({
        documentLoader,
        notes: [
          noteOf(ROOT_URI, { replies: new Collection({ first: new URL(pageUri(1)) }) }),
          ...Array.from({ length: 15 }, (_, index) => noteOf(replyUri(index + 1), { replyTo: ROOT_URI })),
        ],
      });

      expect(await t.run()).toBe(10);
      expect(documentLoader).toHaveBeenCalledTimes(10);
    });

    it('既に D1 にある URI は取得しない', async () => {
      const t = setup({
        notes: [
          noteOf(ROOT_URI, { replies: repliesOf(replyUri(1), replyUri(2), replyUri(3)) }),
          noteOf(replyUri(1), { replyTo: ROOT_URI }),
          noteOf(replyUri(2), { replyTo: ROOT_URI }),
          noteOf(replyUri(3), { replyTo: ROOT_URI }),
        ],
        stored: [replyUri(1)],
        localUris: [replyUri(2)],
      });

      expect(await t.run()).toBe(1);
      expect(t.lookupObject.mock.calls.map(([uri]) => uri)).toEqual([ROOT_URI, replyUri(3)]);
    });

    it('ブロックしているアクターの返信は保存しない', async () => {
      const t = setup({
        notes: [
          noteOf(ROOT_URI, { replies: repliesOf(replyUri(1), replyUri(2)) }),
          noteOf(replyUri(1), { replyTo: ROOT_URI, author: 'spammer' }),
          noteOf(replyUri(2), { replyTo: ROOT_URI }),
        ],
        blockedActorUris: ['https://remote.example/users/spammer'],
      });

      expect(await t.run()).toBe(1);
      expect(storedUris(t)).toEqual([replyUri(2)]);
    });

    it('親への返信でない Note は保存しない', async () => {
      const t = setup({
        notes: [
          noteOf(ROOT_URI, { replies: repliesOf(replyUri(1)) }),
          noteOf(replyUri(1), { replyTo: 'https://remote.example/notes/other' }),
        ],
      });

      expect(await t.run()).toBe(0);
    });

    it('ある返信の取得が例外で失敗しても、次の返信を保存する', async () => {
      const t = setup({
        notes: [
          noteOf(ROOT_URI, { replies: repliesOf(replyUri(1), replyUri(2)) }),
          noteOf(replyUri(2), { replyTo: ROOT_URI }),
        ],
        failingUris: [replyUri(1)],
      });

      expect(await t.run()).toBe(1);
      expect(storedUris(t)).toEqual([replyUri(2)]);
    });

    it('ある返信の保存が失敗しても、次の返信を保存する', async () => {
      const t = setup({
        notes: [
          noteOf(ROOT_URI, { replies: repliesOf(replyUri(1), replyUri(2)) }),
          noteOf(replyUri(1), { replyTo: ROOT_URI }),
          noteOf(replyUri(2), { replyTo: ROOT_URI }),
        ],
      });
      t.remotePostUpserter.resolve.mockRejectedValueOnce(new Error('D1 failure'));

      expect(await t.run()).toBe(1);
      expect(t.stored.has(replyUri(2))).toBe(true);
    });

    it('次のページの取得が失敗しても、読めたページの返信は保存して件数を返す', async () => {
      const first = new CollectionPage({ items: [new URL(replyUri(1))], next: new URL('https://remote.example/gone') });
      const documentLoader = vi.fn(async () => {
        throw new Error('unreachable');
      }) as unknown as DocumentLoader;
      const t = setup({
        documentLoader,
        notes: [
          noteOf(ROOT_URI, { replies: new Collection({ first }) }),
          noteOf(replyUri(1), { replyTo: ROOT_URI }),
        ],
      });

      expect(await t.run()).toBe(1);
    });

    it('時間切れになったら、それまでに保存した件数を返す', async () => {
      const t = setup({
        totalTimeoutMs: 50,
        lookupObject: async (uri) => {
          if (uri === ROOT_URI) return noteOf(ROOT_URI, { replies: repliesOf(replyUri(1), replyUri(2), replyUri(3)) });
          if (uri === replyUri(1)) return noteOf(uri, { replyTo: ROOT_URI });
          return new Promise(() => undefined);
        },
      });

      expect(await t.run()).toBe(1);
      expect(storedUris(t)).toEqual([replyUri(1)]);
    });

    it('ローカルの投稿の返信は相手のサーバーから取らない', async () => {
      const t = setup({ post: { ...remotePost(), type: 'local' } as Post });

      expect(await t.run()).toBe(0);
      expect(t.lookupObject).not.toHaveBeenCalled();
    });

    it('投稿の Note が取れなければ 0 件を返す', async () => {
      const t = setup();

      expect(await t.run()).toBe(0);
    });
  });

  describe('祖先', () => {
    it('inReplyToUri から FetchReplyNotesRecursiveUseCase に取り込みを任せ、その件数を足す', async () => {
      const t = setup({
        post: remotePost({ inReplyToUri: PARENT_URI }),
        notes: [noteOf(ROOT_URI, { replies: repliesOf(replyUri(1)) }), noteOf(replyUri(1), { replyTo: ROOT_URI })],
        ancestors: 2,
      });

      expect(await t.run()).toBe(3);
      expect(t.fetchReplyNotesRecursiveUseCase.run).toHaveBeenCalledWith(
        expect.objectContaining({ inReplyToUri: PARENT_URI, documentLoader: expect.any(Function) }),
      );
    });

    it('ローカルの投稿でも inReplyToUri があれば祖先を取り込む', async () => {
      const t = setup({ post: { ...remotePost({ inReplyToUri: PARENT_URI }), type: 'local' } as Post, ancestors: 1 });

      expect(await t.run()).toBe(1);
      expect(t.fetchReplyNotesRecursiveUseCase.run).toHaveBeenCalledTimes(1);
    });

    it('inReplyToUri がなければ祖先は取り込まない', async () => {
      const t = setup({ notes: [noteOf(ROOT_URI)] });

      await t.run();

      expect(t.fetchReplyNotesRecursiveUseCase.run).not.toHaveBeenCalled();
    });

    it('祖先の取得にも 5 秒の signal を付ける', async () => {
      const t = setup({ post: remotePost({ inReplyToUri: PARENT_URI }), notes: [noteOf(PARENT_URI)] });

      await t.run();
      const [{ lookupObject }] = t.fetchReplyNotesRecursiveUseCase.run.mock.calls[0] as unknown as [
        { lookupObject: (uri: string, options: { documentLoader: DocumentLoader }) => Promise<unknown> },
      ];
      await lookupObject(PARENT_URI, { documentLoader: t.documentLoader });

      expect(t.lookupObject).toHaveBeenLastCalledWith(
        PARENT_URI,
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
  });

  describe('エラー', () => {
    it('投稿がなければ PostNotFoundError を返す', async () => {
      const useCase = FetchRemoteContextUseCase.create({
        origin: ORIGIN,
        userResolver: { resolve: async () => RA.ok({ id: 'user-1', username: 'kosui' } as never) },
        postResolver: { resolve: async () => RA.ok(undefined) },
        postResolverByUri: { resolve: async () => RA.ok(undefined) },
        localPostResolverByUri: { resolve: async () => RA.ok(undefined) },
        remotePostUpserter: { resolve: vi.fn() },
        blockedActorUriResolverByUsername: { resolve: async () => RA.ok(false) },
        fetchReplyNotesRecursiveUseCase: { run: vi.fn() },
      });

      const result = await useCase.run({
        userId: 'user-1' as never,
        postId: 'post-1' as never,
        ctx: { getDocumentLoader: vi.fn(), lookupObject: vi.fn() },
      });

      expect(result.ok ? undefined : result.err.type).toBe('PostNotFoundError');
    });

    it('ユーザーがいなければ UserNotFoundError を返す', async () => {
      const useCase = FetchRemoteContextUseCase.create({
        origin: ORIGIN,
        userResolver: { resolve: async () => RA.ok(undefined) },
        postResolver: { resolve: async () => RA.ok(remotePost()) },
        postResolverByUri: { resolve: async () => RA.ok(undefined) },
        localPostResolverByUri: { resolve: async () => RA.ok(undefined) },
        remotePostUpserter: { resolve: vi.fn() },
        blockedActorUriResolverByUsername: { resolve: async () => RA.ok(false) },
        fetchReplyNotesRecursiveUseCase: { run: vi.fn() },
      });

      const result = await useCase.run({
        userId: 'user-1' as never,
        postId: 'post-1' as never,
        ctx: { getDocumentLoader: vi.fn(), lookupObject: vi.fn() },
      });

      expect(result.ok ? undefined : result.err.type).toBe('UserNotFoundError');
    });
  });
});
