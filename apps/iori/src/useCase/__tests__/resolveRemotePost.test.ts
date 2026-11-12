import { Article, Note, Person, Question } from '@fedify/vocab';
import type { DocumentLoader } from '@fedify/vocab-runtime';
import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { isBlockedUri } from '../../adaptor/fedify/blockedInboxDomain.ts';
import type { LookupUrlResolver } from '../../ports/lookupUrlResolver.ts';
import { ResolveRemotePostUseCase } from '../resolveRemotePost.ts';

const ORIGIN = 'https://iori.test';
const HTML_URL = 'https://remote.example/@alice/123';
const NOTE_URI = 'https://remote.example/notes/123';
const ALICE_URI = 'https://remote.example/users/alice';
const BLOCKED_DOMAIN = 'blocked.example';

const personOf = (name: string) =>
  new Person({
    id: new URL(`https://remote.example/users/${name}`),
    inbox: new URL(`https://remote.example/users/${name}/inbox`),
    preferredUsername: name,
  });

const noteOf = (id: string, author = 'alice') =>
  new Note({ id: new URL(id), content: id, attribution: personOf(author) });

type Setup = Readonly<{
  stored?: Readonly<Record<string, string>>;
  localStored?: Readonly<Record<string, string>>;
  storedAuthorUris?: Readonly<Record<string, string>>;
  blockedActorUris?: ReadonlyArray<string>;
  blockedCheckRejects?: boolean;
  lookupObject?: (uri: string) => Promise<unknown>;
  documentLoader?: DocumentLoader;
  lookupUrlResolver?: LookupUrlResolver;
  userFound?: boolean;
  fetchTimeoutMs?: number;
  totalTimeoutMs?: number;
}>;

const setup = (options: Setup = {}) => {
  const stored = new Map(Object.entries(options.stored ?? {}));
  const lookupObject = vi.fn(
    async (uri: string, _options: { documentLoader: DocumentLoader; signal?: AbortSignal }) =>
      options.lookupObject === undefined ? null : options.lookupObject(uri),
  );
  const documentLoader = options.documentLoader ?? (vi.fn() as unknown as DocumentLoader);
  const lookupUrlResolver = vi.fn<LookupUrlResolver>(
    options.lookupUrlResolver ?? (async (url) => ({ type: 'resolved', url })),
  );
  const ctx = { getDocumentLoader: vi.fn(async () => documentLoader), lookupObject };
  const remotePostUpserter = {
    resolve: vi.fn(async (identity: { uri: string }) => {
      const postId = `saved:${identity.uri}`;
      stored.set(identity.uri, postId);
      return RA.ok({ postId } as never);
    }),
  };
  const postResolverByUri = {
    resolve: vi.fn(async ({ uri }: { uri: string }) =>
      RA.ok(
        stored.has(uri)
          ? ({ type: 'remote', postId: stored.get(uri), actorId: `actor-of:${stored.get(uri)}` } as never)
          : undefined,
      )
    ),
  };
  const actorResolverById = {
    resolve: vi.fn(async (actorId: string) => {
      const postId = actorId.replace('actor-of:', '');
      return RA.ok({ uri: options.storedAuthorUris?.[postId] ?? ALICE_URI } as never);
    }),
  };
  const localPostResolverByUri = {
    resolve: vi.fn(async ({ uri }: { uri: string }) =>
      RA.ok(
        options.localStored?.[uri] === undefined
          ? undefined
          : ({ type: 'local', postId: options.localStored[uri] } as never),
      )
    ),
  };
  const useCase = ResolveRemotePostUseCase.create({
    origin: ORIGIN,
    userResolver: {
      resolve: async () =>
        options.userFound === false ? RA.ok(undefined) : RA.ok({ id: 'user-1', username: 'kosui' } as never),
    },
    postResolverByUri,
    localPostResolverByUri,
    actorResolverById: actorResolverById as never,
    remotePostUpserter,
    blockedActorUriResolverByUsername: {
      resolve: async ({ actorUri }) => {
        if (options.blockedCheckRejects) throw new Error('D1 is down');
        return RA.ok(options.blockedActorUris?.includes(actorUri) ?? false);
      },
    },
    isBlockedUri: (uri) => isBlockedUri(uri, [BLOCKED_DOMAIN]),
    lookupUrlResolver,
    fetchTimeoutMs: options.fetchTimeoutMs,
    totalTimeoutMs: options.totalTimeoutMs,
  });
  const run = async (url: string) => {
    const result = await useCase.run({ userId: 'user-1' as never, url, ctx });
    if (!result.ok) throw new Error(`unexpected error: ${result.err.type}`);
    return result.val;
  };
  return { run, useCase, ctx, lookupObject, remotePostUpserter, stored, documentLoader, lookupUrlResolver };
};

describe('ResolveRemotePostUseCase', () => {
  it('D1 に uri で保存済みの投稿は、その postId を返して取得しない', async () => {
    const t = setup({ stored: { [NOTE_URI]: 'post-1' } });

    expect(await t.run(NOTE_URI)).toBe('post-1');
    expect(t.lookupObject).not.toHaveBeenCalled();
    expect(t.remotePostUpserter.resolve).not.toHaveBeenCalled();
  });

  it('自分のサーバーの保存済みの投稿は、その postId を返して取得しない', async () => {
    const uri = `${ORIGIN}/users/kosui/posts/post-9`;
    const t = setup({ localStored: { [uri]: 'post-9' } });

    expect(await t.run(uri)).toBe('post-9');
    expect(t.lookupObject).not.toHaveBeenCalled();
  });

  it('自分のサーバーの URL で保存済みの投稿が無いときは、取得せず見つからない扱いにする', async () => {
    const t = setup();

    expect(await t.run(`${ORIGIN}/users/kosui/posts/missing`)).toBeUndefined();
    expect(await t.run(`${ORIGIN}/@kosui/1`)).toBeUndefined();
    expect(t.lookupObject).not.toHaveBeenCalled();
  });

  it('HTML の URL から Note を取得し、note.id で保存済みの投稿を見つけたら保存しない', async () => {
    const t = setup({
      stored: { [NOTE_URI]: 'post-1' },
      lookupObject: async () => noteOf(NOTE_URI),
    });

    expect(await t.run(HTML_URL)).toBe('post-1');
    expect(t.lookupObject).toHaveBeenCalledTimes(1);
    expect(t.lookupObject.mock.calls[0]![0]).toBe(HTML_URL);
    expect(t.remotePostUpserter.resolve).not.toHaveBeenCalled();
  });

  it('保存済みでない Note は取得して保存し、その postId を返す', async () => {
    const t = setup({ lookupObject: async () => noteOf(NOTE_URI) });

    expect(await t.run(HTML_URL)).toBe(`saved:${NOTE_URI}`);
    expect(t.remotePostUpserter.resolve).toHaveBeenCalledTimes(1);
    expect(t.remotePostUpserter.resolve.mock.calls[0]![0]).toMatchObject({
      uri: NOTE_URI,
      authorIdentity: { uri: ALICE_URI },
    });
  });

  it('Article は name と本文を組み立てて保存し、その postId を返す', async () => {
    const t = setup({
      lookupObject: async () =>
        new Article({ id: new URL(NOTE_URI), name: 'Title', content: '<p>body</p>', attribution: personOf('alice') }),
    });

    expect(await t.run(HTML_URL)).toBe(`saved:${NOTE_URI}`);
    expect(t.remotePostUpserter.resolve.mock.calls[0]![0]).toMatchObject({
      uri: NOTE_URI,
      content: `<p><strong>Title</strong></p><p>body</p><p><a href="${NOTE_URI}">元の記事を読む</a></p>`,
      authorIdentity: { uri: ALICE_URI },
    });
  });

  it('Question は投票のリンクを組み立て、選択肢を poll にして保存し、その postId を返す', async () => {
    const t = setup({
      lookupObject: async () =>
        new Question({
          id: new URL(NOTE_URI),
          content: '<p>q</p>',
          exclusiveOptions: [new Note({ name: 'a' }), new Note({ name: 'b' })],
          attribution: personOf('alice'),
        }),
    });

    expect(await t.run(HTML_URL)).toBe(`saved:${NOTE_URI}`);
    expect(t.remotePostUpserter.resolve.mock.calls[0]![0]).toMatchObject({
      uri: NOTE_URI,
      content: `<p>q</p><p><a href="${NOTE_URI}">元の投稿で投票する</a></p>`,
      poll: {
        multiple: false,
        options: [{ title: 'a', votesCount: 0 }, { title: 'b', votesCount: 0 }],
        votersCount: null,
        expiresAt: null,
        closed: false,
      },
    });
  });

  it('ブロックしたドメインの Article と Question は、保存せず見つからない扱いにする', async () => {
    const blockedUri = `https://${BLOCKED_DOMAIN}/objects/1`;
    const article = setup({ lookupObject: async () => new Article({ id: new URL(blockedUri), content: 'x' }) });
    const question = setup({ lookupObject: async () => new Question({ id: new URL(blockedUri), content: 'x' }) });

    expect(await article.run(HTML_URL)).toBeUndefined();
    expect(await question.run(HTML_URL)).toBeUndefined();
    expect(article.remotePostUpserter.resolve).not.toHaveBeenCalled();
    expect(question.remotePostUpserter.resolve).not.toHaveBeenCalled();
  });

  it('著者がブロックしたドメインの Article と Question は、保存せず見つからない扱いにする', async () => {
    const author = new Person({
      id: new URL(`https://${BLOCKED_DOMAIN}/users/mallory`),
      inbox: new URL(`https://${BLOCKED_DOMAIN}/users/mallory/inbox`),
      preferredUsername: 'mallory',
    });
    const article = setup({
      lookupObject: async () => new Article({ id: new URL(NOTE_URI), content: 'x', attribution: author }),
    });
    const question = setup({
      lookupObject: async () => new Question({ id: new URL(NOTE_URI), content: 'x', attribution: author }),
    });

    expect(await article.run(HTML_URL)).toBeUndefined();
    expect(await question.run(HTML_URL)).toBeUndefined();
    expect(article.remotePostUpserter.resolve).not.toHaveBeenCalled();
    expect(question.remotePostUpserter.resolve).not.toHaveBeenCalled();
  });

  it('ログインユーザーの署名付きの文書取得で取得する', async () => {
    const t = setup({ lookupObject: async () => noteOf(NOTE_URI) });

    await t.run(HTML_URL);

    expect(t.ctx.getDocumentLoader).toHaveBeenCalledWith({ identifier: 'kosui' });
    expect(t.lookupObject.mock.calls[0]![1].documentLoader).toEqual(expect.any(Function));
  });

  it('Note でないオブジェクトは保存せず、見つからない扱いにする', async () => {
    const t = setup({ lookupObject: async () => personOf('alice') });

    expect(await t.run(HTML_URL)).toBeUndefined();
    expect(t.remotePostUpserter.resolve).not.toHaveBeenCalled();
  });

  it('取得できなかったときは、見つからない扱いにする', async () => {
    const t = setup({ lookupObject: async () => null });

    expect(await t.run(HTML_URL)).toBeUndefined();
    expect(t.remotePostUpserter.resolve).not.toHaveBeenCalled();
  });

  it('id のない Note と、自分のサーバーの id を持つ Note は保存しない', async () => {
    const withoutId = setup({ lookupObject: async () => new Note({ content: 'x', attribution: personOf('alice') }) });
    const ownId = setup({ lookupObject: async () => noteOf(`${ORIGIN}/notes/1`) });

    expect(await withoutId.run(HTML_URL)).toBeUndefined();
    expect(await ownId.run(HTML_URL)).toBeUndefined();
    expect(withoutId.remotePostUpserter.resolve).not.toHaveBeenCalled();
    expect(ownId.remotePostUpserter.resolve).not.toHaveBeenCalled();
  });

  it('ブロックした相手の保存済みの投稿は、URL で引けても note.id で引けても見つからない扱いにする', async () => {
    const byUrl = setup({
      stored: { [NOTE_URI]: 'post-1' },
      storedAuthorUris: { 'post-1': ALICE_URI },
      blockedActorUris: [ALICE_URI],
    });
    const byNoteId = setup({
      stored: { [NOTE_URI]: 'post-1' },
      storedAuthorUris: { 'post-1': ALICE_URI },
      blockedActorUris: [ALICE_URI],
      lookupObject: async () => noteOf(NOTE_URI),
    });

    expect(await byUrl.run(NOTE_URI)).toBeUndefined();
    expect(await byNoteId.run(HTML_URL)).toBeUndefined();
    expect(byNoteId.remotePostUpserter.resolve).not.toHaveBeenCalled();
  });

  it('ブロックしていない相手の保存済みの投稿と、自分の保存済みの投稿は、ブロックの判定を受けずに返す', async () => {
    const uri = `${ORIGIN}/users/kosui/posts/post-9`;
    const t = setup({
      stored: { [NOTE_URI]: 'post-1' },
      localStored: { [uri]: 'post-9' },
      blockedActorUris: [ALICE_URI],
      storedAuthorUris: { 'post-1': 'https://remote.example/users/bob' },
    });

    expect(await t.run(NOTE_URI)).toBe('post-1');
    expect(await t.run(uri)).toBe('post-9');
  });

  it('ブロックした相手の投稿は保存せず、見つからない扱いにする', async () => {
    const t = setup({ blockedActorUris: [ALICE_URI], lookupObject: async () => noteOf(NOTE_URI) });

    expect(await t.run(HTML_URL)).toBeUndefined();
    expect(t.remotePostUpserter.resolve).not.toHaveBeenCalled();
  });

  it('ブロックの判定が失敗したときは、その相手の投稿を保存せず、見つからない扱いにする', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const t = setup({ blockedCheckRejects: true, lookupObject: async () => noteOf(NOTE_URI) });

    expect(await t.run(HTML_URL)).toBeUndefined();
    expect(t.remotePostUpserter.resolve).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('ブロックしたドメインの URL は、サブドメインも含めて、取得せず見つからない扱いにする', async () => {
    const t = setup({ lookupObject: async (uri) => noteOf(uri) });

    expect(await t.run(`https://${BLOCKED_DOMAIN}/@alice/1`)).toBeUndefined();
    expect(await t.run(`https://social.${BLOCKED_DOMAIN}/@alice/1`)).toBeUndefined();
    expect(t.lookupObject).not.toHaveBeenCalled();
    expect(t.remotePostUpserter.resolve).not.toHaveBeenCalled();
  });

  it('最初の URL の転送先や rel=alternate の先がブロックしたドメインなら、取得せず見つからない扱いにする', async () => {
    const t = setup({
      lookupObject: async (uri) => noteOf(uri),
      lookupUrlResolver: async () => ({ type: 'blocked' }),
    });

    expect(await t.run(HTML_URL)).toBeUndefined();
    expect(t.lookupUrlResolver).toHaveBeenCalledExactlyOnceWith(HTML_URL, { signal: expect.any(AbortSignal) });
    expect(t.lookupObject).not.toHaveBeenCalled();
    expect(t.remotePostUpserter.resolve).not.toHaveBeenCalled();
  });

  it('最初の URL をたどった先の URL で、署名付きの取得をする', async () => {
    const t = setup({
      lookupObject: async () => noteOf(NOTE_URI),
      lookupUrlResolver: async () => ({ type: 'resolved', url: NOTE_URI }),
    });

    expect(await t.run(HTML_URL)).toBe(`saved:${NOTE_URI}`);
    expect(t.lookupObject.mock.calls[0]![0]).toBe(NOTE_URI);
  });

  it('保存済みの投稿と自分のサーバーの URL では、最初の URL をたどらない', async () => {
    const t = setup({ stored: { [HTML_URL]: 'post-1' } });

    expect(await t.run(HTML_URL)).toBe('post-1');
    expect(await t.run(`${ORIGIN}/posts/1`)).toBeUndefined();
    expect(t.lookupUrlResolver).not.toHaveBeenCalled();
  });

  it('取得した Note の id がブロックしたドメインなら、保存せず見つからない扱いにする', async () => {
    const t = setup({ lookupObject: async () => noteOf(`https://${BLOCKED_DOMAIN}/notes/1`) });

    expect(await t.run(HTML_URL)).toBeUndefined();
    expect(t.lookupObject).toHaveBeenCalledTimes(1);
    expect(t.remotePostUpserter.resolve).not.toHaveBeenCalled();
  });

  it('取得した Note の著者がブロックしたドメインなら、保存せず見つからない扱いにする', async () => {
    const author = new Person({
      id: new URL(`https://${BLOCKED_DOMAIN}/users/mallory`),
      inbox: new URL(`https://${BLOCKED_DOMAIN}/users/mallory/inbox`),
      preferredUsername: 'mallory',
    });
    const t = setup({
      lookupObject: async () => new Note({ id: new URL(NOTE_URI), content: 'x', attribution: author }),
    });

    expect(await t.run(HTML_URL)).toBeUndefined();
    expect(t.lookupObject).toHaveBeenCalledTimes(1);
    expect(t.remotePostUpserter.resolve).not.toHaveBeenCalled();
  });

  it('ブロックしていないドメインの投稿は、ブロックの設定があっても取得して保存する', async () => {
    const t = setup({ lookupObject: async () => noteOf(NOTE_URI) });

    expect(await t.run(HTML_URL)).toBe(`saved:${NOTE_URI}`);
    expect(t.remotePostUpserter.resolve).toHaveBeenCalledTimes(1);
  });

  it('投稿者を解決できない Note は保存せず、見つからない扱いにする', async () => {
    const t = setup({ lookupObject: async () => new Note({ id: new URL(NOTE_URI), content: 'x' }) });

    expect(await t.run(HTML_URL)).toBeUndefined();
    expect(t.remotePostUpserter.resolve).not.toHaveBeenCalled();
  });

  it('URL として解釈できない入力は、取得せず見つからない扱いにする', async () => {
    const t = setup();

    expect(await t.run('not a url')).toBeUndefined();
    expect(t.lookupObject).not.toHaveBeenCalled();
  });

  it('取得が例外を投げても、例外を外に出さず見つからない扱いにする', async () => {
    const t = setup({
      lookupObject: async () => {
        throw new Error('network down');
      },
    });

    expect(await t.run(HTML_URL)).toBeUndefined();
    expect(t.remotePostUpserter.resolve).not.toHaveBeenCalled();
  });

  it('保存が失敗したときは、見つからない扱いにする', async () => {
    const t = setup({ lookupObject: async () => noteOf(NOTE_URI) });
    t.remotePostUpserter.resolve.mockImplementation(async () => RA.err({ type: 'failed' } as never) as never);

    expect(await t.run(HTML_URL)).toBeUndefined();
  });

  it('全体の時間切れでは、見つからない扱いにして取得の signal を abort する', async () => {
    const t = setup({ totalTimeoutMs: 50, lookupObject: async () => new Promise(() => undefined) });

    expect(await t.run(HTML_URL)).toBeUndefined();
    expect(t.lookupObject.mock.calls[0]![1].signal!.aborted).toBe(true);
    expect(t.remotePostUpserter.resolve).not.toHaveBeenCalled();
  });

  it('時間切れにならなければ、取得に渡した signal を abort しない', async () => {
    const t = setup({ lookupObject: async () => noteOf(NOTE_URI) });

    await t.run(HTML_URL);

    expect(t.lookupObject.mock.calls[0]![1].signal).toBeInstanceOf(AbortSignal);
    expect(t.lookupObject.mock.calls[0]![1].signal!.aborted).toBe(false);
  });

  it('取得ごとに 5 秒の signal を付ける', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const t = setup({ lookupObject: async () => noteOf(NOTE_URI) });

    await t.run(HTML_URL);

    expect(timeout).toHaveBeenCalledWith(5_000);
    timeout.mockRestore();
  });

  it('文書の取得にも 5 秒の signal を付け、全体の時間切れで abort する', async () => {
    const signals: AbortSignal[] = [];
    const documentLoader = vi.fn(async (_url: string, options?: { signal?: AbortSignal }) => {
      signals.push(options!.signal!);
      return new Promise(() => undefined);
    }) as unknown as DocumentLoader;
    const t = setup({
      documentLoader,
      totalTimeoutMs: 50,
      lookupObject: async () => new Note({ id: new URL(NOTE_URI), content: 'x', attribution: new URL(ALICE_URI) }),
    });

    expect(await t.run(HTML_URL)).toBeUndefined();
    expect(signals.length).toBeGreaterThanOrEqual(1);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  it('利用者が見つからないときは UserNotFoundError を返す', async () => {
    const t = setup({ userFound: false });

    const result = await t.useCase.run({ userId: 'user-1' as never, url: HTML_URL, ctx: t.ctx });

    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.err.type).toBe('UserNotFoundError');
    expect(t.lookupObject).not.toHaveBeenCalled();
  });
});
