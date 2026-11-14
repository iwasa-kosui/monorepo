import { type Collection, CollectionPage, isActor } from '@fedify/vocab';
import type { DocumentLoader } from '@fedify/vocab-runtime';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import { ActorIdentity } from '../adaptor/fedify/actorIdentity.ts';
import { type Actor, ActorNotFoundError, type ActorResolverByUri } from '../domain/actor/actor.ts';
import type { ActorId } from '../domain/actor/actorId.ts';
import type { RemoteActorCreatedStore } from '../domain/actor/remoteActor.ts';
import type { LogoUriUpdatedStore } from '../domain/actor/updateLogoUri.ts';
import type { RemoteActorProfileUpdatedStore } from '../domain/actor/updateProfile.ts';
import type { Agg } from '../domain/aggregate/index.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { UserNotFoundError, UserResolver } from '../domain/user/user.ts';
import type { UserId } from '../domain/user/userId.ts';
import { signalWithTimeout, withFetchTimeout } from './helper/abortableFetch.ts';
import { resolveUserWith } from './helper/resolve.ts';
import { upsertRemoteActor } from './helper/upsertRemoteActor.ts';
import type { UseCase } from './useCase.ts';

export type RemoteFollowListKind = 'followers' | 'following';

const MAX_ACCOUNTS_PER_PAGE = 40;
const MAX_LOOKUPS_IN_FLIGHT = 6;
const DEFAULT_FETCH_TIMEOUT_MS = 5_000;
const DEFAULT_TOTAL_TIMEOUT_MS = 15_000;

type FederationContext = Readonly<{
  getDocumentLoader: (params: { identifier: string }) => Promise<DocumentLoader>;
  lookupObject: (
    uri: string,
    options: { documentLoader: DocumentLoader; signal?: AbortSignal },
  ) => Promise<unknown>;
}>;

type Input = Readonly<{
  userId: UserId;
  actorId: ActorId;
  kind: RemoteFollowListKind;
  cursor?: string;
  ctx: FederationContext;
}>;

/**
 * リモートのアクターのフォローやフォロワーを、相手のサーバーのコレクションから1ページ分読んだ結果。
 * `actorIds` はページの順に並ぶ。相手のサーバーが一覧を公開していないときは空になる。
 */
type Ok = Readonly<{
  actorIds: readonly ActorId[];
  nextCursor: string | undefined;
  totalItems: number | undefined;
}>;

type Err = UserNotFoundError | ActorNotFoundError;

export type ListRemoteActorFollowsUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  origin: string;
  userResolver: UserResolver;
  actorResolverById: Agg.Resolver<ActorId, Actor | undefined>;
  actorResolverByUri: ActorResolverByUri;
  remoteActorCreatedStore: RemoteActorCreatedStore;
  logoUriUpdatedStore: LogoUriUpdatedStore;
  remoteActorProfileUpdatedStore?: RemoteActorProfileUpdatedStore;
  isBlockedUri: (uri: string) => boolean;
  fetchTimeoutMs?: number;
  totalTimeoutMs?: number;
}>;

const empty: Ok = { actorIds: [], nextCursor: undefined, totalItems: undefined };

const originOf = (uri: string): string | undefined => {
  try {
    return new URL(uri).origin;
  } catch {
    return undefined;
  }
};

/** 中断されたら待つのをやめる。中断を受け付けない取得でも、全体の時間を守るため。 */
const untilAborted = <T>(promise: Promise<T>, signal: AbortSignal): Promise<T> => {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
};

const create = ({
  origin,
  userResolver,
  actorResolverById,
  actorResolverByUri,
  remoteActorCreatedStore,
  logoUriUpdatedStore,
  remoteActorProfileUpdatedStore,
  isBlockedUri,
  fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
  totalTimeoutMs = DEFAULT_TOTAL_TIMEOUT_MS,
}: Deps): ListRemoteActorFollowsUseCase => {
  const resolveUser = resolveUserWith(userResolver);

  const firstPageOf = async (
    actorUri: string,
    kind: RemoteFollowListKind,
    ctx: FederationContext,
    documentLoader: DocumentLoader,
    signal: AbortSignal,
  ): Promise<Readonly<{ page: Collection | null; totalItems: number | undefined }>> => {
    const actor = await untilAborted(ctx.lookupObject(actorUri, { documentLoader, signal }), signal);
    if (!isActor(actor) || actor.id?.href !== actorUri) {
      return { page: null, totalItems: undefined };
    }
    const options = { documentLoader, suppressError: true } as const;
    const collection = kind === 'followers'
      ? await actor.getFollowers(options)
      : await actor.getFollowing(options);
    if (collection === null) {
      return { page: null, totalItems: undefined };
    }
    const totalItems = collection.totalItems ?? undefined;
    if (collection.firstId === null && collection.itemIds.length === 0) {
      return { page: null, totalItems };
    }
    return { page: (await collection.getFirst(options)) ?? collection, totalItems };
  };

  const pageAt = async (
    cursor: string,
    ctx: FederationContext,
    documentLoader: DocumentLoader,
    signal: AbortSignal,
  ): Promise<Collection | null> => {
    const page = await untilAborted(ctx.lookupObject(cursor, { documentLoader, signal }), signal);
    return page instanceof CollectionPage ? page : null;
  };

  type Resolved =
    | Readonly<{ kind: 'stored'; actorId: ActorId }>
    | Readonly<{ kind: 'fetched'; identity: ActorIdentity }>
    | undefined;

  const resolveUri = async (
    uri: string,
    ctx: FederationContext,
    documentLoader: DocumentLoader,
    signal: AbortSignal,
  ): Promise<Resolved> => {
    try {
      const existing = await actorResolverByUri.resolve(uri);
      if (existing.ok && existing.val !== undefined) {
        return { kind: 'stored', actorId: existing.val.id };
      }
      if (originOf(uri) === origin || isBlockedUri(uri)) {
        return undefined;
      }
      const lookupSignal = signalWithTimeout(signal, fetchTimeoutMs);
      const found = await untilAborted(ctx.lookupObject(uri, { documentLoader, signal: lookupSignal }), lookupSignal);
      if (!isActor(found) || found.id?.href !== uri) {
        return undefined;
      }
      const identity = await untilAborted(ActorIdentity.fromFedifyActor(found, { documentLoader }), lookupSignal);
      return identity.ok ? { kind: 'fetched', identity: identity.val } : undefined;
    } catch (error) {
      getLogger().debug(`Failed to resolve an actor in the follow list: ${uri} - ${error}`);
      return undefined;
    }
  };

  /** 相手のサーバーへの問い合わせは並べて行い、保存は1件ずつページの順に行う。 */
  const actorIdsOf = async (
    uris: readonly string[],
    ctx: FederationContext,
    documentLoader: DocumentLoader,
    signal: AbortSignal,
  ): Promise<readonly ActorId[]> => {
    const resolved: Resolved[] = Array.from({ length: uris.length }, () => undefined);
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < uris.length && !signal.aborted) {
        const index = next++;
        resolved[index] = await resolveUri(uris[index]!, ctx, documentLoader, signal);
      }
    };
    await Promise.all(Array.from({ length: Math.min(MAX_LOOKUPS_IN_FLIGHT, uris.length) }, worker));

    const upsert = upsertRemoteActor({
      now: Instant.now(),
      remoteActorCreatedStore,
      logoUriUpdatedStore,
      remoteActorProfileUpdatedStore,
      actorResolverByUri,
    });
    const actorIds: ActorId[] = [];
    for (const item of resolved) {
      if (item?.kind === 'stored') {
        actorIds.push(item.actorId);
      } else if (item?.kind === 'fetched') {
        try {
          const upserted = await upsert(item.identity);
          if (upserted.ok) actorIds.push(upserted.val.id);
        } catch (error) {
          getLogger().debug(`Failed to save an actor in the follow list: ${item.identity.uri} - ${error}`);
        }
      }
    }
    return actorIds;
  };

  const readPage = async (
    actorUri: string,
    kind: RemoteFollowListKind,
    cursor: string | undefined,
    ctx: FederationContext,
    documentLoader: DocumentLoader,
    signal: AbortSignal,
  ): Promise<Ok> => {
    try {
      const pageSignal = signalWithTimeout(signal, fetchTimeoutMs);
      const { page, totalItems } = cursor === undefined
        ? await firstPageOf(actorUri, kind, ctx, documentLoader, pageSignal)
        : { page: await pageAt(cursor, ctx, documentLoader, pageSignal), totalItems: undefined };
      if (page === null) {
        return { ...empty, totalItems };
      }
      const uris = [...new Set(page.itemIds.map((id) => id.href))].slice(0, MAX_ACCOUNTS_PER_PAGE);
      const actorIds = await actorIdsOf(uris, ctx, documentLoader, signal);
      const nextId = page instanceof CollectionPage ? page.nextId?.href : undefined;
      const nextCursor = nextId !== undefined && nextId !== cursor && originOf(nextId) === originOf(actorUri)
        ? nextId
        : undefined;
      return {
        actorIds,
        nextCursor,
        totalItems,
      };
    } catch (error) {
      getLogger().debug(`Failed to read the ${kind} of the actor: ${actorUri} - ${error}`);
      return empty;
    }
  };

  const run = async ({ userId, actorId, kind, cursor, ctx }: Input): RA<Ok, Err> => {
    const user = await resolveUser(userId);
    if (!user.ok) {
      return RA.err(user.err);
    }
    const resolved = await actorResolverById.resolve(actorId);
    if (!resolved.ok || resolved.val === undefined) {
      return RA.err(ActorNotFoundError.create(actorId));
    }
    const actor = resolved.val;
    if (actor.type === 'local' || isBlockedUri(actor.uri)) {
      return RA.ok(empty);
    }
    if (cursor !== undefined && originOf(cursor) !== originOf(actor.uri)) {
      return RA.ok(empty);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      getLogger().debug(`Timed out while reading the ${kind} of the actor: ${actorId}`);
    }, totalTimeoutMs);
    try {
      const documentLoader = withFetchTimeout(
        await ctx.getDocumentLoader({ identifier: user.val.username }),
        controller.signal,
        fetchTimeoutMs,
      );
      return RA.ok(await readPage(actor.uri, kind, cursor, ctx, documentLoader, controller.signal));
    } finally {
      clearTimeout(timer);
    }
  };

  return { run };
};

export const ListRemoteActorFollowsUseCase = {
  create,
} as const;
