import { OrderedCollection, OrderedCollectionPage, Person } from '@fedify/vocab';
import type { DocumentLoader } from '@fedify/vocab-runtime';
import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { isBlockedUri } from '../../adaptor/fedify/blockedInboxDomain.ts';
import type { Actor } from '../../domain/actor/actor.ts';
import { ListRemoteActorFollowsUseCase } from '../listRemoteActorFollows.ts';

const ORIGIN = 'https://iori.test';
const ACTOR_URI = 'https://remote.example/users/alice';
const FOLLOWERS_URI = `${ACTOR_URI}/followers`;
const FOLLOWING_URI = `${ACTOR_URI}/following`;
const BLOCKED_DOMAIN = 'blocked.example';

const uriOf = (name: string, host = 'remote.example') => `https://${host}/users/${name}`;

const personAt = (uri: string, extra: { followers?: URL | null; following?: URL | null } = {}) =>
  new Person({
    id: new URL(uri),
    inbox: new URL(`${uri}/inbox`),
    preferredUsername: uri.split('/').pop()!,
    followers: extra.followers ?? null,
    following: extra.following ?? null,
  });

const pageUri = (base: string, index: number) => `${base}?page=${index}`;

const pagesOf = (base: string, pages: ReadonlyArray<ReadonlyArray<string>>) =>
  pages.map((items, index) =>
    new OrderedCollectionPage({
      id: new URL(pageUri(base, index)),
      partOf: new URL(base),
      items: items.map((uri) => new URL(uri)),
      next: index + 1 < pages.length ? new URL(pageUri(base, index + 1)) : null,
    })
  );

const collectionOf = (base: string, pages: ReadonlyArray<ReadonlyArray<string>>, totalItems?: number) =>
  new OrderedCollection({
    id: new URL(base),
    totalItems: totalItems ?? pages.flat().length,
    first: pages.length === 0 ? null : new URL(pageUri(base, 0)),
  });

const remoteActor = { id: 'actor-1', type: 'remote', uri: ACTOR_URI } as unknown as Actor;
const localActor = { id: 'actor-1', type: 'local', uri: `${ORIGIN}/users/kosui` } as unknown as Actor;

type Setup = Readonly<{
  actor?: Actor | undefined;
  followers?: ReadonlyArray<ReadonlyArray<string>>;
  following?: ReadonlyArray<ReadonlyArray<string>>;
  followersCollection?: OrderedCollection;
  known?: Readonly<Record<string, string>>;
  missing?: ReadonlyArray<string>;
  hangingUris?: ReadonlyArray<string>;
  totalTimeoutMs?: number;
}>;

const setup = (options: Setup = {}) => {
  const objects = new Map<string, unknown>([
    [ACTOR_URI, personAt(ACTOR_URI, { followers: new URL(FOLLOWERS_URI), following: new URL(FOLLOWING_URI) })],
  ]);
  const addCollection = (base: string, pages: ReadonlyArray<ReadonlyArray<string>> | undefined) => {
    if (pages === undefined) return;
    objects.set(base, collectionOf(base, pages));
    for (const page of pagesOf(base, pages)) objects.set(page.id!.href, page);
    for (const uri of pages.flat()) {
      if (!options.missing?.includes(uri)) objects.set(uri, personAt(uri));
    }
  };
  addCollection(FOLLOWERS_URI, options.followers);
  addCollection(FOLLOWING_URI, options.following);
  if (options.followersCollection !== undefined) objects.set(FOLLOWERS_URI, options.followersCollection);

  const documentLoader = (async (url: string) => {
    const found = objects.get(url);
    if (found === undefined) throw new Error(`not found: ${url}`);
    return {
      contextUrl: null,
      documentUrl: url,
      document: await (found as { toJsonLd: () => Promise<unknown> }).toJsonLd(),
    };
  }) as unknown as DocumentLoader;

  const lookupObject = vi.fn(async (uri: string, _options: { documentLoader: DocumentLoader; signal?: AbortSignal }) => {
    if (options.hangingUris?.includes(uri)) return new Promise<never>(() => {});
    return objects.get(uri) ?? null;
  });
  const ctx = { getDocumentLoader: vi.fn(async () => documentLoader), lookupObject };

  const stored = new Map<string, string>(Object.entries(options.known ?? {}));
  const actorResolverByUri = {
    resolve: vi.fn(async (uri: string) => {
      const id = stored.get(uri);
      return RA.ok(id === undefined ? undefined : ({ id, type: 'remote', uri } as unknown as Actor));
    }),
  };
  const remoteActorCreatedStore = {
    store: vi.fn(async (...events: ReadonlyArray<{ aggregateState: { id: string; uri: string } }>) => {
      for (const event of events) stored.set(event.aggregateState.uri, event.aggregateState.id);
      return RA.ok(undefined);
    }),
  };
  const useCase = ListRemoteActorFollowsUseCase.create({
    origin: ORIGIN,
    userResolver: { resolve: async () => RA.ok({ id: 'user-1', username: 'kosui' } as never) },
    actorResolverById: { resolve: vi.fn(async () => RA.ok('actor' in options ? options.actor : remoteActor)) },
    actorResolverByUri,
    remoteActorCreatedStore: remoteActorCreatedStore as never,
    logoUriUpdatedStore: { store: vi.fn(async () => RA.ok(undefined)) } as never,
    isBlockedUri: (uri) => isBlockedUri(uri, [BLOCKED_DOMAIN]),
    totalTimeoutMs: options.totalTimeoutMs,
  });
  const run = async (kind: 'followers' | 'following' = 'followers', cursor?: string) => {
    const result = await useCase.run({ userId: 'user-1' as never, actorId: 'actor-1' as never, kind, cursor, ctx });
    if (!result.ok) throw new Error(`unexpected error: ${result.err.type}`);
    return result.val;
  };
  return { run, lookupObject, remoteActorCreatedStore, stored, useCase, ctx };
};

const lookedUpUris = (t: ReturnType<typeof setup>) => t.lookupObject.mock.calls.map(([uri]) => uri);

describe('ListRemoteActorFollowsUseCase', () => {
  it('フォロワーの最初のページを読み、ページの順にアクターを返し、次のページと総数を返す', async () => {
    const t = setup({ followers: [[uriOf('bob'), uriOf('carol')], [uriOf('dave')]] });

    const result = await t.run('followers');

    expect(result.actorIds.map((id) => [...t.stored].find(([, v]) => v === id)?.[0])).toEqual([
      uriOf('bob'),
      uriOf('carol'),
    ]);
    expect(result.nextCursor).toBe(pageUri(FOLLOWERS_URI, 1));
    expect(result.totalItems).toBe(3);
  });

  it('cursor のページを読み、最後のページでは次のページを返さない', async () => {
    const t = setup({ following: [[uriOf('bob')], [uriOf('dave')]] });

    const result = await t.run('following', pageUri(FOLLOWING_URI, 1));

    expect(result.actorIds).toEqual([t.stored.get(uriOf('dave'))]);
    expect(result.nextCursor).toBeUndefined();
    expect(lookedUpUris(t)).not.toContain(ACTOR_URI);
  });

  it('保存済みのアクターは相手のサーバーに問い合わせず、その ID を使う', async () => {
    const t = setup({ followers: [[uriOf('bob'), uriOf('carol')]], known: { [uriOf('bob')]: 'known-bob' } });

    const result = await t.run();

    expect(result.actorIds[0]).toBe('known-bob');
    expect(lookedUpUris(t)).not.toContain(uriOf('bob'));
    expect(t.remoteActorCreatedStore.store).toHaveBeenCalledTimes(1);
  });

  it('取得できないアクター、ブロックしているドメイン、未保存の自サーバーの URI は飛ばす', async () => {
    const t = setup({
      followers: [[uriOf('gone'), uriOf('eve', BLOCKED_DOMAIN), uriOf('nobody', 'iori.test'), uriOf('bob')]],
      missing: [uriOf('gone')],
    });

    const result = await t.run();

    expect(result.actorIds).toEqual([t.stored.get(uriOf('bob'))]);
    expect(lookedUpUris(t)).not.toContain(uriOf('eve', BLOCKED_DOMAIN));
    expect(lookedUpUris(t)).not.toContain(uriOf('nobody', 'iori.test'));
  });

  it('自サーバーのアクターが保存済みなら、その ID を返す', async () => {
    const local = uriOf('kosui', 'iori.test');
    const t = setup({ followers: [[local]], known: { [local]: 'local-kosui' } });

    expect((await t.run()).actorIds).toEqual(['local-kosui']);
  });

  it('一覧を公開していないコレクションでは、空の一覧と総数を返す', async () => {
    const t = setup({ followersCollection: new OrderedCollection({ id: new URL(FOLLOWERS_URI), totalItems: 42 }) });

    expect(await t.run()).toEqual({ actorIds: [], nextCursor: undefined, totalItems: 42 });
  });

  it('アクターのサーバーと違うオリジンの cursor は読まない', async () => {
    const t = setup({ followers: [[uriOf('bob')]] });

    const result = await t.run('followers', 'https://evil.example/page');

    expect(result.actorIds).toEqual([]);
    expect(t.lookupObject).not.toHaveBeenCalled();
  });

  it('ローカルのアクターでは相手のサーバーに問い合わせない', async () => {
    const t = setup({ actor: localActor, followers: [[uriOf('bob')]] });

    expect((await t.run()).actorIds).toEqual([]);
    expect(t.lookupObject).not.toHaveBeenCalled();
  });

  it('アクターが見つからなければ ActorNotFoundError を返す', async () => {
    const t = setup({ actor: undefined });

    const result = await t.useCase.run({
      userId: 'user-1' as never,
      actorId: 'actor-1' as never,
      kind: 'followers',
      ctx: t.ctx,
    });

    expect(!result.ok && result.err.type).toBe('ActorNotFoundError');
  });

  it('全体の時間を過ぎたら、それまでに解決できたアクターと次のページを返す', async () => {
    const t = setup({
      followers: [[uriOf('bob'), uriOf('slow')], [uriOf('dave')]],
      hangingUris: [uriOf('slow')],
      totalTimeoutMs: 100,
    });

    const result = await t.run();

    expect(result.actorIds).toEqual([t.stored.get(uriOf('bob'))]);
    expect(result.nextCursor).toBe(pageUri(FOLLOWERS_URI, 1));
  });
});
