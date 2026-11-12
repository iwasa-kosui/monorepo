import { type Collection, CollectionPage, Create, isActor } from '@fedify/vocab';
import type { DocumentLoader } from '@fedify/vocab-runtime';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import { type Actor, ActorNotFoundError } from '../domain/actor/actor.ts';
import type { ActorId } from '../domain/actor/actorId.ts';
import type { Agg } from '../domain/aggregate/index.ts';
import type { BlockedActorUriResolverByUsername } from '../domain/block/block.ts';
import type {
  LocalPostUrisResolverByUris,
  RemotePostUpserter,
  RemotePostUrisResolverByUris,
} from '../domain/post/post.ts';
import type { UserNotFoundError, UserResolver } from '../domain/user/user.ts';
import type { UserId } from '../domain/user/userId.ts';
import type { Username } from '../domain/user/username.ts';
import { timedOut, withTimeout } from '../helper/withTimeout.ts';
import { signalWithTimeout, withFetchTimeout } from './helper/abortableFetch.ts';
import { isBlockedActorUri } from './helper/isBlockedActorUri.ts';
import { createRecentRuns } from './helper/recentRuns.ts';
import { toRemotePostIdentity } from './helper/remoteNoteIdentity.ts';
import { isRemotePostObject, type RemotePostObject } from './helper/remotePostObject.ts';
import { resolveUserWith } from './helper/resolve.ts';
import type { UseCase } from './useCase.ts';

const MAX_SAVED = 20;
const MAX_LOOKUPS_IN_FLIGHT = 4;
const MAX_PAGES = 3;
const MAX_ITEMS_PER_PAGE = 100;
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
  remotePostUrisResolverByUris: RemotePostUrisResolverByUris;
  localPostUrisResolverByUris: LocalPostUrisResolverByUris;
  remotePostUpserter: RemotePostUpserter;
  blockedActorUriResolverByUsername: BlockedActorUriResolverByUsername;
  isBlockedUri: (uri: string) => boolean;
  fetchTimeoutMs?: number;
  totalTimeoutMs?: number;
  now?: () => number;
}>;

type Progress = {
  fetched: number;
  stopped: boolean;
  signal: AbortSignal;
};

const create = ({
  origin,
  userResolver,
  actorResolverById,
  remotePostUrisResolverByUris,
  localPostUrisResolverByUris,
  remotePostUpserter,
  blockedActorUriResolverByUsername,
  isBlockedUri,
  fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
  totalTimeoutMs = DEFAULT_TOTAL_TIMEOUT_MS,
  now = Date.now,
}: Deps): FetchRemoteOutboxUseCase => {
  const recentRuns = createRecentRuns<ActorId, Awaited<RA<Ok, Err>>>({
    now,
    recentResult: () => RA.ok({ fetchedCount: 0 }),
  });

  const signalFor = (progress: Progress): AbortSignal => signalWithTimeout(progress.signal, fetchTimeoutMs);

  const storedUris = async (uris: readonly string[]): Promise<ReadonlySet<string>> => {
    if (uris.length === 0) {
      return new Set();
    }
    const [remote, local] = await Promise.all([
      remotePostUrisResolverByUris.resolve({ uris }),
      localPostUrisResolverByUris.resolve({ uris }),
    ]);
    return new Set([...(remote.ok ? remote.val : []), ...(local.ok ? local.val : [])]);
  };

  const isBlocked = (username: Username, actorUri: string): Promise<boolean> =>
    isBlockedActorUri(blockedActorUriResolverByUsername, username, actorUri);

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
    progress: Progress,
  ): Promise<RemotePostObject | undefined> => {
    try {
      const found = await ctx.lookupObject(uri, { documentLoader, signal: signalFor(progress) });
      return isRemotePostObject(found) ? found : undefined;
    } catch (error) {
      getLogger().debug(`Failed to look up a note: ${uri} - ${error}`);
      return undefined;
    }
  };

  const saveNote = async (
    note: RemotePostObject | undefined,
    noteUri: string,
    actorUri: string,
    username: Username,
    documentLoader: DocumentLoader,
    progress: Progress,
  ): Promise<void> => {
    try {
      if (note === undefined || note.attributionId?.href !== actorUri) {
        return;
      }
      const identity = await toRemotePostIdentity(note, { origin, documentLoader, isBlockedUri });
      if (identity === undefined || await isBlocked(username, identity.authorIdentity.uri) || progress.stopped) {
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

  const saveCreates = async (
    creates: readonly Create[],
    actorUri: string,
    username: Username,
    ctx: FederationContext,
    documentLoader: DocumentLoader,
    progress: Progress,
  ): Promise<void> => {
    const lookups: Promise<RemotePostObject | undefined>[] = [];
    let running = 0;
    let consumed = 0;
    const startLookups = (): void => {
      while (
        running < MAX_LOOKUPS_IN_FLIGHT
        && lookups.length < creates.length
        && !progress.stopped
        && progress.fetched + (lookups.length - consumed) < MAX_SAVED
      ) {
        running++;
        lookups.push(
          lookupNote(ctx, creates[lookups.length]!.objectId!.href, documentLoader, progress).finally(() => {
            running--;
            startLookups();
          }),
        );
      }
    };

    for (let index = 0; index < creates.length; index++) {
      startLookups();
      const lookup = lookups[index];
      if (lookup === undefined || progress.stopped || progress.fetched >= MAX_SAVED) {
        return;
      }
      const note = await lookup;
      if (progress.stopped || progress.fetched >= MAX_SAVED) {
        return;
      }
      await saveNote(note, creates[index]!.objectId!.href, actorUri, username, documentLoader, progress);
      consumed++;
    }
  };

  const pageCreates = async (
    page: Collection,
    documentLoader: DocumentLoader,
    progress: Progress,
  ): Promise<Create[]> => {
    const creates: Create[] = [];
    for await (const item of page.getItems({ documentLoader, suppressError: true })) {
      if (progress.stopped || creates.length >= MAX_ITEMS_PER_PAGE) {
        break;
      }
      if (item instanceof Create && item.objectId !== null && !isBlockedUri(item.objectId.href)) {
        creates.push(item);
      }
    }
    return creates;
  };

  const fetchOutbox = async (
    actorUri: string,
    username: Username,
    ctx: FederationContext,
    documentLoader: DocumentLoader,
    progress: Progress,
  ): Promise<void> => {
    try {
      const actor = await ctx.lookupObject(actorUri, { documentLoader, signal: signalFor(progress) });
      if (!isActor(actor) || actor.id?.href !== actorUri) {
        return;
      }
      const outbox = await actor.getOutbox({ documentLoader, suppressError: true });
      if (outbox === null) {
        return;
      }
      for await (const page of outboxPages(outbox, documentLoader)) {
        const creates = await pageCreates(page, documentLoader, progress);
        const stored = await storedUris(creates.map((create) => create.objectId!.href));
        const fresh = creates.filter((create) => !stored.has(create.objectId!.href));
        await saveCreates(fresh, actorUri, username, ctx, documentLoader, progress);
        if (progress.stopped || progress.fetched >= MAX_SAVED) {
          return;
        }
      }
    } catch (error) {
      getLogger().debug(`Failed to read the outbox of the actor: ${actorUri} - ${error}`);
    }
  };

  const execute = async ({ userId, actorId, ctx }: Input): RA<Ok, Err> => {
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
    if (isBlockedUri(actor.uri) || await isBlocked(user.val.username, actor.uri)) {
      return RA.ok({ fetchedCount: 0 });
    }

    const controller = new AbortController();
    const documentLoader = withFetchTimeout(
      await ctx.getDocumentLoader({ identifier: user.val.username }),
      controller.signal,
      fetchTimeoutMs,
    );
    const progress: Progress = { fetched: 0, stopped: false, signal: controller.signal };
    const finished = await withTimeout(
      fetchOutbox(actor.uri, user.val.username, ctx, documentLoader, progress),
      totalTimeoutMs,
    );
    if (finished === timedOut) {
      progress.stopped = true;
      controller.abort();
      getLogger().debug(`Timed out while fetching the outbox of the actor: ${actorId}`);
    }
    return RA.ok({ fetchedCount: progress.fetched });
  };

  const run = (input: Input): RA<Ok, Err> => recentRuns(input.actorId, () => execute(input));

  return { run };
};

export const FetchRemoteOutboxUseCase = {
  create,
} as const;
