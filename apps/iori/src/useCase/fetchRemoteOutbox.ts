import { type Collection, CollectionPage, Create, isActor, Note } from '@fedify/vocab';
import type { DocumentLoader } from '@fedify/vocab-runtime';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import { type Actor, ActorNotFoundError } from '../domain/actor/actor.ts';
import type { ActorId } from '../domain/actor/actorId.ts';
import type { Agg } from '../domain/aggregate/index.ts';
import type { BlockedActorUriResolverByUsername } from '../domain/block/block.ts';
import type { LocalPostResolverByUri, PostResolverByUri, RemotePostUpserter } from '../domain/post/post.ts';
import type { UserNotFoundError, UserResolver } from '../domain/user/user.ts';
import type { UserId } from '../domain/user/userId.ts';
import { timedOut, withTimeout } from '../helper/withTimeout.ts';
import { toRemotePostIdentity } from './helper/remoteNoteIdentity.ts';
import { resolveUserWith } from './helper/resolve.ts';
import type { UseCase } from './useCase.ts';

const MAX_SAVED = 20;
const MAX_PAGES = 3;
const DEFAULT_FETCH_TIMEOUT_MS = 5_000;
const DEFAULT_TOTAL_TIMEOUT_MS = 10_000;

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
  ctx: FederationContext;
}>;

type Ok = Readonly<{
  fetchedCount: number;
}>;

type Err = UserNotFoundError | ActorNotFoundError;

export type FetchRemoteOutboxUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  origin: string;
  userResolver: UserResolver;
  actorResolverById: Agg.Resolver<ActorId, Actor | undefined>;
  postResolverByUri: PostResolverByUri;
  localPostResolverByUri: LocalPostResolverByUri;
  remotePostUpserter: RemotePostUpserter;
  blockedActorUriResolverByUsername: BlockedActorUriResolverByUsername;
  fetchTimeoutMs?: number;
  totalTimeoutMs?: number;
}>;

type Progress = {
  fetched: number;
  stopped: boolean;
};

const create = ({
  origin,
  userResolver,
  actorResolverById,
  postResolverByUri,
  localPostResolverByUri,
  remotePostUpserter,
  blockedActorUriResolverByUsername,
  fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
  totalTimeoutMs = DEFAULT_TOTAL_TIMEOUT_MS,
}: Deps): FetchRemoteOutboxUseCase => {
  const withFetchTimeout = (loader: DocumentLoader): DocumentLoader => (url, options) =>
    loader(url, {
      ...options,
      signal: options?.signal === undefined
        ? AbortSignal.timeout(fetchTimeoutMs)
        : AbortSignal.any([options.signal, AbortSignal.timeout(fetchTimeoutMs)]),
    });

  const exists = async (uri: string): Promise<boolean> => {
    const [remote, local] = await Promise.all([
      postResolverByUri.resolve({ uri }),
      localPostResolverByUri.resolve({ uri }),
    ]);
    return (remote.ok && remote.val !== undefined) || (local.ok && local.val !== undefined);
  };

  const outboxPages = async function*(outbox: Collection, documentLoader: DocumentLoader): AsyncGenerator<Collection> {
    const options = { documentLoader, suppressError: true } as const;
    const seen = new Set<string>();
    let page: Collection | null = (await outbox.getFirst(options)) ?? outbox;
    for (let count = 0; page !== null && count < MAX_PAGES; count++) {
      if (page.id !== null) {
        if (seen.has(page.id.href)) return;
        seen.add(page.id.href);
      }
      yield page;
      page = page instanceof CollectionPage ? await page.getNext(options) : null;
    }
  };

  const lookupNote = async (
    ctx: FederationContext,
    uri: string,
    documentLoader: DocumentLoader,
  ): Promise<Note | undefined> => {
    try {
      const found = await ctx.lookupObject(uri, { documentLoader, signal: AbortSignal.timeout(fetchTimeoutMs) });
      return found instanceof Note ? found : undefined;
    } catch (error) {
      getLogger().debug(`Failed to look up a note: ${uri} - ${error}`);
      return undefined;
    }
  };

  const saveItem = async (
    item: unknown,
    actorUri: string,
    ctx: FederationContext,
    documentLoader: DocumentLoader,
    progress: Progress,
  ): Promise<void> => {
    if (!(item instanceof Create) || item.objectId === null) {
      return;
    }
    const noteUri = item.objectId.href;
    try {
      if (progress.stopped || await exists(noteUri)) {
        return;
      }
      const note = await lookupNote(ctx, noteUri, documentLoader);
      if (note === undefined || note.attributionId?.href !== actorUri) {
        return;
      }
      const identity = await toRemotePostIdentity(note, { origin, documentLoader });
      if (identity === undefined || progress.stopped) {
        return;
      }
      const upserted = await remotePostUpserter.resolve(identity);
      if (upserted.ok) {
        progress.fetched++;
      }
    } catch (error) {
      getLogger().debug(`Failed to save a note: ${noteUri} - ${error}`);
    }
  };

  const fetchOutbox = async (
    actorUri: string,
    ctx: FederationContext,
    documentLoader: DocumentLoader,
    progress: Progress,
  ): Promise<void> => {
    try {
      const actor = await ctx.lookupObject(actorUri, { documentLoader, signal: AbortSignal.timeout(fetchTimeoutMs) });
      if (!isActor(actor) || actor.id?.href !== actorUri) {
        return;
      }
      const outbox = await actor.getOutbox({ documentLoader, suppressError: true });
      if (outbox === null) {
        return;
      }
      for await (const page of outboxPages(outbox, documentLoader)) {
        for await (const item of page.getItems({ documentLoader, suppressError: true })) {
          if (progress.stopped || progress.fetched >= MAX_SAVED) {
            return;
          }
          await saveItem(item, actorUri, ctx, documentLoader, progress);
        }
      }
    } catch (error) {
      getLogger().debug(`Failed to read the outbox of the actor: ${actorUri} - ${error}`);
    }
  };

  const run = async ({ userId, actorId, ctx }: Input): RA<Ok, Err> => {
    const user = await resolveUserWith(userResolver)(userId);
    if (!user.ok) {
      return RA.err(user.err);
    }
    const resolved = await actorResolverById.resolve(actorId);
    if (!resolved.ok || resolved.val === undefined) {
      return RA.err(ActorNotFoundError.create(actorId));
    }
    const actor = resolved.val;
    if (actor.type === 'local') {
      return RA.ok({ fetchedCount: 0 });
    }
    const blocked = await blockedActorUriResolverByUsername.resolve({
      username: user.val.username,
      actorUri: actor.uri,
    });
    if (!blocked.ok || blocked.val) {
      return RA.ok({ fetchedCount: 0 });
    }

    const documentLoader = withFetchTimeout(await ctx.getDocumentLoader({ identifier: user.val.username }));
    const progress: Progress = { fetched: 0, stopped: false };
    const finished = await withTimeout(fetchOutbox(actor.uri, ctx, documentLoader, progress), totalTimeoutMs);
    if (finished === timedOut) {
      progress.stopped = true;
      getLogger().debug(`Timed out while fetching the outbox of the actor: ${actorId}`);
    }
    return RA.ok({ fetchedCount: progress.fetched });
  };

  return { run };
};

export const FetchRemoteOutboxUseCase = {
  create,
} as const;
