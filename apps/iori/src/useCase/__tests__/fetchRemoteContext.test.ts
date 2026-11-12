import { Article, Collection, CollectionPage, Note, Person, Question } from '@fedify/vocab';
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
  notes?: ReadonlyArray<Note | Article | Question>;
  stored?: ReadonlyArray<string>;
  localUris?: ReadonlyArray<string>;
  blockedActorUris?: ReadonlyArray<string>;
  blockedCheckRejects?: boolean;
  isBlockedUri?: (uri: string) => boolean;
  documentLoader?: DocumentLoader;
  failingUris?: ReadonlyArray<string>;
  lookupObject?: (uri: string) => Promise<unknown>;
  ancestors?: number;
  fetchTimeoutMs?: number;
  totalTimeoutMs?: number;
  now?: () => number;
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
  const remotePostUrisResolverByUris = {
    resolve: vi.fn(async ({ uris }: { uris: readonly string[] }) => RA.ok(uris.filter((uri) => stored.has(uri)))),
  };
  const localPostUrisResolverByUris = {
    resolve: vi.fn(async ({ uris }: { uris: readonly string[] }) =>
      RA.ok(uris.filter((uri) => options.localUris?.includes(uri)))
    ),
  };
  const useCase = FetchRemoteContextUseCase.create({
    origin: ORIGIN,
    userResolver: { resolve: async () => RA.ok({ id: 'user-1', username: 'kosui' } as never) },
    postResolver: { resolve: async () => RA.ok(options.post ?? remotePost()) },
    remotePostUrisResolverByUris,
    localPostUrisResolverByUris,
    remotePostUpserter,
    blockedActorUriResolverByUsername: {
      resolve: async ({ actorUri }) => {
        if (options.blockedCheckRejects) throw new Error('D1 is down');
        return RA.ok(options.blockedActorUris?.includes(actorUri) ?? false);
      },
    },
    fetchReplyNotesRecursiveUseCase,
    isBlockedUri: options.isBlockedUri ?? (() => false),
    fetchTimeoutMs: options.fetchTimeoutMs,
    totalTimeoutMs: options.totalTimeoutMs,
    now: options.now,
  });
  const run = async (postId = 'post-1') => {
    const result = await useCase.run({ userId: 'user-1' as never, postId: postId as never, ctx });
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
    fetchReplyNotesRecursiveUseCase,
    stored,
    documentLoader,
  };
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

    it('Article の投稿の返信にある Article と Question も、本文を組み立てて保存する', async () => {
      const article = new Article({
        id: new URL(replyUri(1)),
        name: 'Title',
        content: '<p>body</p>',
        attribution: personOf('bob'),
        replyTarget: new URL(ROOT_URI),
      });
      const question = new Question({
        id: new URL(replyUri(2)),
        content: '<p>q</p>',
        exclusiveOptions: [new Note({ name: 'a' })],
        attribution: personOf('carol'),
        replyTarget: new URL(ROOT_URI),
      });
      const t = setup({
        notes: [
          new Article({
            id: new URL(ROOT_URI),
            content: 'root',
            attribution: personOf('alice'),
            replies: repliesOf(replyUri(1), replyUri(2)),
          }),
          article,
          question,
        ],
      });

      expect(await t.run()).toBe(2);
      expect(t.remotePostUpserter.resolve.mock.calls.map(([identity]) => identity)).toMatchObject([
        {
          uri: replyUri(1),
          content: `<p><strong>Title</strong></p><p>body</p><p><a href="${replyUri(1)}">元の記事を読む</a></p>`,
        },
        {
          uri: replyUri(2),
          content: '<p>q</p>',
          poll: {
            multiple: false,
            options: [{ title: 'a', votesCount: 0 }],
            votersCount: null,
            expiresAt: null,
            closed: false,
          },
        },
      ]);
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

    it('既に D1 にある URI は保存し直さない', async () => {
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
      expect(storedUris(t)).toEqual([replyUri(3)]);
    });

    it('1 ページ分の URI をまとめて、リモートとローカルそれぞれ 1 回の問い合わせで保存済みか調べる', async () => {
      const t = setup({
        notes: [
          noteOf(ROOT_URI, { replies: repliesOf(replyUri(1), replyUri(2), replyUri(3)) }),
          ...[1, 2, 3].map((index) => noteOf(replyUri(index), { replyTo: ROOT_URI })),
        ],
      });

      await t.run();

      expect(t.remotePostUrisResolverByUris.resolve).toHaveBeenCalledTimes(1);
      expect(t.remotePostUrisResolverByUris.resolve).toHaveBeenCalledWith({
        uris: [replyUri(1), replyUri(2), replyUri(3)],
      });
      expect(t.localPostUrisResolverByUris.resolve).toHaveBeenCalledTimes(1);
    });

    it('保存済みの返信は保存し直さず、その下の返信を保存する', async () => {
      const t = setup({
        notes: [
          noteOf(ROOT_URI, { replies: repliesOf(replyUri(1)) }),
          noteOf(replyUri(1), { replyTo: ROOT_URI, replies: repliesOf(replyUri(2)) }),
          noteOf(replyUri(2), { replyTo: replyUri(1) }),
        ],
        stored: [replyUri(1)],
      });

      expect(await t.run()).toBe(1);
      expect(storedUris(t)).toEqual([replyUri(2)]);
    });

    it('保存済みの返信が深さの上限にあるときは、取得しない', async () => {
      const t = setup({
        notes: [
          noteOf(ROOT_URI, { replies: repliesOf(replyUri(1)) }),
          noteOf(replyUri(1), { replyTo: ROOT_URI, replies: repliesOf(replyUri(2)) }),
          noteOf(replyUri(2), { replyTo: replyUri(1), replies: repliesOf(replyUri(3)) }),
          noteOf(replyUri(3), { replyTo: replyUri(2) }),
        ],
        stored: [replyUri(1), replyUri(2), replyUri(3)],
      });

      expect(await t.run()).toBe(0);
      expect(t.lookupObject.mock.calls.map(([uri]) => uri)).toEqual([ROOT_URI, replyUri(1), replyUri(2)]);
    });

    it('保存済みの返信が親への返信でなければ、その下は取得しない', async () => {
      const t = setup({
        notes: [
          noteOf(ROOT_URI, { replies: repliesOf(replyUri(1)) }),
          noteOf(replyUri(1), { replyTo: 'https://remote.example/notes/other', replies: repliesOf(replyUri(2)) }),
          noteOf(replyUri(2), { replyTo: replyUri(1) }),
        ],
        stored: [replyUri(1)],
      });

      expect(await t.run()).toBe(0);
      expect(t.lookupObject.mock.calls.map(([uri]) => uri)).toEqual([ROOT_URI, replyUri(1)]);
    });

    it('ブロックしているアクターの保存済みの返信の下は取得しない', async () => {
      const t = setup({
        notes: [
          noteOf(ROOT_URI, { replies: repliesOf(replyUri(1)) }),
          noteOf(replyUri(1), { replyTo: ROOT_URI, author: 'spammer', replies: repliesOf(replyUri(2)) }),
          noteOf(replyUri(2), { replyTo: replyUri(1) }),
        ],
        stored: [replyUri(1)],
        blockedActorUris: ['https://remote.example/users/spammer'],
      });

      expect(await t.run()).toBe(0);
      expect(t.lookupObject.mock.calls.map(([uri]) => uri)).toEqual([ROOT_URI, replyUri(1)]);
    });

    it('ブロックの判定が失敗したときは、その相手の返信を保存しない', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const t = setup({
        notes: [
          noteOf(ROOT_URI, { replies: repliesOf(replyUri(1)) }),
          noteOf(replyUri(1), { replyTo: ROOT_URI }),
        ],
        blockedCheckRejects: true,
      });

      expect(await t.run()).toBe(0);
      expect(t.remotePostUpserter.resolve).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it('外部への lookup は、保存済みも数えて合計 60 回までにする', async () => {
      const uris = Array.from({ length: 100 }, (_, index) => replyUri(index));
      const t = setup({
        notes: [
          noteOf(ROOT_URI, { replies: repliesOf(...uris) }),
          ...uris.map((uri) => noteOf(uri, { replyTo: ROOT_URI })),
        ],
        stored: uris,
      });

      expect(await t.run()).toBe(0);
      expect(t.lookupObject).toHaveBeenCalledTimes(60);
    });

    it('新規と保存済みが混ざっていても、lookup は合計 60 回までにする', async () => {
      const uris = Array.from({ length: 100 }, (_, index) => replyUri(index));
      const t = setup({
        notes: [
          noteOf(ROOT_URI, { replies: repliesOf(...uris) }),
          ...uris.map((uri) => noteOf(uri, { replyTo: ROOT_URI })),
        ],
        stored: uris.filter((_, index) => index % 2 === 0),
      });

      expect(await t.run()).toBe(29);
      expect(t.lookupObject).toHaveBeenCalledTimes(60);
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

    it('全体の時間切れで、実行中の取得に渡した signal を abort する', async () => {
      const t = setup({
        totalTimeoutMs: 50,
        lookupObject: async () => new Promise(() => undefined),
      });

      await t.run();

      const signal = t.lookupObject.mock.calls[0]![1].signal!;
      expect(signal.aborted).toBe(true);
    });

    it('時間切れにならなければ、取得に渡した signal を abort しない', async () => {
      const t = setup({ notes: [noteOf(ROOT_URI)] });

      await t.run();

      expect(t.lookupObject.mock.calls[0]![1].signal!.aborted).toBe(false);
    });

    it('全体の時間切れで、文書の取得に渡す signal も abort する', async () => {
      const signals: AbortSignal[] = [];
      const documentLoader = vi.fn(async (_url: string, options?: { signal?: AbortSignal }) => {
        signals.push(options!.signal!);
        return new Promise(() => undefined);
      }) as unknown as DocumentLoader;
      const t = setup({
        documentLoader,
        totalTimeoutMs: 50,
        notes: [noteOf(ROOT_URI, { replies: new Collection({ first: new URL('https://remote.example/replies') }) })],
      });

      await t.run();

      expect(signals).toHaveLength(1);
      expect(signals[0]!.aborted).toBe(true);
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

    describe('ブロックしたドメイン', () => {
      const isBlockedUri = (uri: string) => new URL(uri).hostname === 'blocked.example';

      it('ブロックしたドメインの返信は取りに行かない', async () => {
        const blockedReply = 'https://blocked.example/notes/reply';
        const t = setup({
          isBlockedUri,
          notes: [
            noteOf(ROOT_URI, { replies: repliesOf(blockedReply, replyUri(1)) }),
            noteOf(blockedReply, { replyTo: ROOT_URI }),
            noteOf(replyUri(1), { replyTo: ROOT_URI }),
          ],
        });

        expect(await t.run()).toBe(1);
        expect(storedUris(t)).toEqual([replyUri(1)]);
        expect(t.lookupObject.mock.calls.map(([uri]) => uri)).not.toContain(blockedReply);
      });

      it('著者がブロックしたドメインにいる返信は保存しない', async () => {
        const blockedAuthor = new Person({
          id: new URL('https://blocked.example/users/mallory'),
          inbox: new URL('https://blocked.example/users/mallory/inbox'),
          preferredUsername: 'mallory',
        });
        const t = setup({
          isBlockedUri,
          notes: [
            noteOf(ROOT_URI, { replies: repliesOf(replyUri(1), replyUri(2)) }),
            noteOf(replyUri(1), { replyTo: ROOT_URI }).clone({ attribution: blockedAuthor }),
            noteOf(replyUri(2), { replyTo: ROOT_URI }),
          ],
        });

        expect(await t.run()).toBe(1);
        expect(storedUris(t)).toEqual([replyUri(2)]);
      });
    });
  });

  describe('同じ投稿への取得', () => {
    const withReply = () => ({
      notes: [noteOf(ROOT_URI, { replies: repliesOf(replyUri(1)) }), noteOf(replyUri(1), { replyTo: ROOT_URI })],
    });

    it('同時の 2 回のリクエストは、1 回の取得にまとめて同じ結果を返す', async () => {
      const t = setup(withReply());

      const counts = await Promise.all([t.run(), t.run()]);

      expect(counts).toEqual([1, 1]);
      expect(t.ctx.getDocumentLoader).toHaveBeenCalledTimes(1);
      expect(t.lookupObject).toHaveBeenCalledTimes(2);
      expect(t.remotePostUpserter.resolve).toHaveBeenCalledTimes(1);
    });

    it('別の投稿への同時のリクエストはまとめない', async () => {
      const t = setup(withReply());

      await Promise.all([t.run('post-1'), t.run('post-2')]);

      expect(t.ctx.getDocumentLoader).toHaveBeenCalledTimes(2);
    });

    it('完了から 60 秒以内の再実行は、取得せずに 0 件を返す', async () => {
      let time = 1_000_000;
      const t = setup({ ...withReply(), now: () => time });

      expect(await t.run()).toBe(1);
      time += 59_999;

      expect(await t.run()).toBe(0);
      expect(t.ctx.getDocumentLoader).toHaveBeenCalledTimes(1);
      expect(t.lookupObject).toHaveBeenCalledTimes(2);
    });

    it('完了から 60 秒たったら、もう一度取得する', async () => {
      let time = 1_000_000;
      const t = setup({ ...withReply(), now: () => time });

      await t.run();
      time += 60_000;
      await t.run();

      expect(t.ctx.getDocumentLoader).toHaveBeenCalledTimes(2);
      expect(t.lookupObject).toHaveBeenCalledTimes(4);
    });

    it('投稿が見つからなかった実行は覚えず、続けて呼ぶと毎回調べる', async () => {
      const postResolver = { resolve: vi.fn(async () => RA.ok(undefined)) };
      const useCase = FetchRemoteContextUseCase.create({
        origin: ORIGIN,
        userResolver: { resolve: async () => RA.ok({ id: 'user-1', username: 'kosui' } as never) },
        postResolver,
        remotePostUrisResolverByUris: { resolve: async () => RA.ok([]) },
        localPostUrisResolverByUris: { resolve: async () => RA.ok([]) },
        remotePostUpserter: { resolve: vi.fn() },
        blockedActorUriResolverByUsername: { resolve: async () => RA.ok(false) },
        fetchReplyNotesRecursiveUseCase: { run: vi.fn() },
        isBlockedUri: () => false,
      });
      const input = {
        userId: 'user-1' as never,
        postId: 'post-1' as never,
        ctx: { getDocumentLoader: vi.fn(), lookupObject: vi.fn() },
      };

      const results = [await useCase.run(input), await useCase.run(input)];

      expect(results.map((result) => result.ok)).toEqual([false, false]);
      expect(postResolver.resolve).toHaveBeenCalledTimes(2);
    });

    it('覚えておく投稿は 200 件までにし、古いものから忘れる', async () => {
      let time = 1_000_000;
      const t = setup({ ...withReply(), now: () => time });
      for (let index = 0; index < 201; index++) {
        await t.run(`post-${index}`);
        time += 1;
      }
      const loaders = t.ctx.getDocumentLoader.mock.calls.length;

      await t.run('post-200');
      expect(t.ctx.getDocumentLoader.mock.calls.length).toBe(loaders);
      await t.run('post-0');
      expect(t.ctx.getDocumentLoader.mock.calls.length).toBe(loaders + 1);
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

    it('祖先の保存前の判定では、ブロックしているアクターを偽にする', async () => {
      const t = setup({
        post: remotePost({ inReplyToUri: PARENT_URI }),
        notes: [noteOf(ROOT_URI)],
        blockedActorUris: ['https://remote.example/users/spammer'],
      });

      await t.run();
      const [{ shouldSave }] = t.fetchReplyNotesRecursiveUseCase.run.mock.calls[0] as unknown as [
        { shouldSave: (identity: { authorIdentity: { uri: string } }) => Promise<boolean> },
      ];

      expect(await shouldSave({ authorIdentity: { uri: 'https://remote.example/users/spammer' } })).toBe(false);
      expect(await shouldSave({ authorIdentity: { uri: 'https://remote.example/users/alice' } })).toBe(true);
    });

    it('ブロックの判定が失敗したときは、祖先の保存前の判定を偽にする', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const t = setup({
        post: remotePost({ inReplyToUri: PARENT_URI }),
        notes: [noteOf(ROOT_URI)],
        blockedCheckRejects: true,
      });

      await t.run();
      const [{ shouldSave }] = t.fetchReplyNotesRecursiveUseCase.run.mock.calls[0] as unknown as [
        { shouldSave: (identity: { authorIdentity: { uri: string } }) => Promise<boolean> },
      ];

      expect(await shouldSave({ authorIdentity: { uri: 'https://remote.example/users/alice' } })).toBe(false);
      warn.mockRestore();
    });

    it('祖先の保存前の判定は、全体の時間切れのあとは偽にする', async () => {
      const t = setup({
        post: remotePost({ inReplyToUri: PARENT_URI }),
        totalTimeoutMs: 50,
        lookupObject: async () => new Promise(() => undefined),
      });

      await t.run();
      const [{ shouldSave }] = t.fetchReplyNotesRecursiveUseCase.run.mock.calls[0] as unknown as [
        { shouldSave: (identity: { authorIdentity: { uri: string } }) => Promise<boolean> },
      ];

      expect(await shouldSave({ authorIdentity: { uri: 'https://remote.example/users/alice' } })).toBe(false);
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
        remotePostUrisResolverByUris: { resolve: async () => RA.ok([]) },
        localPostUrisResolverByUris: { resolve: async () => RA.ok([]) },
        remotePostUpserter: { resolve: vi.fn() },
        blockedActorUriResolverByUsername: { resolve: async () => RA.ok(false) },
        fetchReplyNotesRecursiveUseCase: { run: vi.fn() },
        isBlockedUri: () => false,
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
        remotePostUrisResolverByUris: { resolve: async () => RA.ok([]) },
        localPostUrisResolverByUris: { resolve: async () => RA.ok([]) },
        remotePostUpserter: { resolve: vi.fn() },
        blockedActorUriResolverByUsername: { resolve: async () => RA.ok(false) },
        fetchReplyNotesRecursiveUseCase: { run: vi.fn() },
        isBlockedUri: () => false,
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
